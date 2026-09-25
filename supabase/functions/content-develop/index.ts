// Edge function: content-develop — TELAS 10/11 (desenvolver e validar o conteúdo-mãe).
// Desenvolve a IDEIA-MÃE aprovada no formato de validação do produtor (Marcos:
// LinkedIn frase + texto) chamando o generate-content (metodologia inteira:
// Genesis, diretrizes, editoriais, RAG, aprendizados) + QA com 1 retry (<70),
// como o fluxo antigo. Modos:
//   develop     { idea_id }                      → primeira versão
//   adjust      { idea_id, current, instruction } → "Ajustar com a Hive"
//   new_version { idea_id, current }              → "Nova versão" (outro ângulo)
// Saída: { success, frase, texto, considered{base,coerencia,formato}, meta{...} }
import {
  checkRateLimit, errorResponse, internalUserId, jsonResponse, preflight, userIdFromAuth,
} from '../_shared/security.ts';
import { fetchRest } from '../_shared/gemini.ts';

type Fn = 'presenca' | 'posicionamento' | 'autoridade' | 'relacionamento' | 'produtos';
const FN_LABEL: Record<Fn, string> = {
  presenca: 'Ampliar presença — chegar a novas pessoas',
  posicionamento: 'Fortalecer posicionamento — clareza do que se quer ser reconhecido',
  autoridade: 'Construir autoridade — repertório, experiência e profundidade',
  relacionamento: 'Gerar relacionamento — identificação, conversa e proximidade',
  produtos: 'Aproximar produtos — conectar naturalmente ao que se oferece',
};
const FN_SHORT: Record<Fn, string> = { presenca: 'presença', posicionamento: 'posicionamento', autoridade: 'autoridade', relacionamento: 'relacionamento', produtos: 'aproximação de produtos' };
const QA_PASS = 70;

interface Input {
  mode?: 'develop' | 'adjust' | 'new_version';
  idea_id: string;
  current?: { frase?: string; texto?: string };
  instruction?: string;
}
interface Gen { quote: string; caption: string; headline_type_used?: string; analogy_used?: string; virality_score?: number; virality_reason?: string }

function svc(userId: string): HeadersInit {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'x-bee-user-id': userId };
}

async function callFn<T>(fn: string, userId: string, body: unknown): Promise<T> {
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/${fn}`, { method: 'POST', headers: svc(userId), body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${fn} HTTP ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text) as T;
}

Deno.serve(async (req: Request) => {
  const cors = preflight(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Use POST', 405);
  try {
    const userId = userIdFromAuth(req) ?? internalUserId(req);
    if (!userId) return errorResponse('Nao autenticado', 401);
    const rl = checkRateLimit(userId, 60_000, 20);
    if (!rl.ok) return errorResponse(`Rate limit. Tente em ${Math.ceil(rl.resetIn / 1000)}s`, 429);
    const input = (await req.json().catch(() => ({}))) as Input;
    const mode = input.mode ?? 'develop';
    if (!input.idea_id) return errorResponse('idea_id obrigatório', 400);
    if (mode === 'adjust' && !input.instruction?.trim()) return errorResponse('Diga o que ajustar.', 400);

    const [idea] = await fetchRest<Array<{ title: string; summary: string | null; strategic_function: Fn | null; editorial_slug: string | null; campaign_id: string | null; rationale: string | null }>>(
      `/ideas?id=eq.${input.idea_id}&user_id=eq.${userId}&select=title,summary,strategic_function,editorial_slug,campaign_id,rationale&limit=1`);
    if (!idea) return errorResponse('Ideia não encontrada', 404);
    const fn: Fn = idea.strategic_function ?? 'presenca';
    // Conteúdo avulso ("Um conteúdo") vive num contêiner metadata.kind='avulso': não é campanha.
    const [campaignRow] = idea.campaign_id
      ? await fetchRest<Array<{ name: string; type: string; intent: string | null; moment: { label?: string } | null; metadata: { kind?: string } | null }>>(`/campaigns?id=eq.${idea.campaign_id}&select=name,type,intent,moment,metadata&limit=1`)
      : [];
    const campaign = campaignRow?.metadata?.kind === 'avulso' ? undefined : campaignRow;
    const [editorial] = idea.editorial_slug
      ? await fetchRest<Array<{ name: string }>>(`/bee_editorials?slug=eq.${idea.editorial_slug}&select=name&limit=1`)
      : [];

    const context = [
      campaign ? `CAMPANHA: ${campaign.name} (${campaign.type === 'vendas' ? 'vendas/lançamento' : 'orgânica'})${campaign.intent ? ` — intenção: ${campaign.intent}` : ''}${campaign.moment?.label ? ` · momento: ${campaign.moment.label}` : ''}` : '',
      campaign?.type !== 'vendas' && fn !== 'produtos' ? 'Sem aproximação comercial direta: nada de CTA de venda.' : '',
    ].filter(Boolean).join('\n');
    const cur = input.current ?? {};
    const extra = mode === 'adjust'
      ? `A PESSOA PEDIU ESTE AJUSTE na versão atual: "${input.instruction}". Atenda ao pedido e PRESERVE tudo o que não foi pedido para mudar.\nVERSÃO ATUAL:\nFrase: ${cur.frase ?? ''}\nTexto:\n${cur.texto ?? ''}`
      : mode === 'new_version'
        ? `Traga uma NOVA VERSÃO desta mesma ideia com OUTRA entrada/ângulo — diferente desta anterior:\nFrase: ${cur.frase ?? ''}\nTexto:\n${cur.texto ?? ''}`
        : '';

    const genBody = (briefing: string) => ({
      editorial_slug: idea.editorial_slug ?? 'provocacao-de-crenca',
      target_platform: 'linkedin',
      variations: 1,
      briefing,
      mother_idea: { title: idea.title, direction: idea.summary ?? undefined, strategic_function: FN_LABEL[fn] },
    });

    const briefing = [context, extra].filter(Boolean).join('\n\n');
    let best = await callFn<Gen & { success: boolean }>('generate-content', userId, genBody(briefing));
    let qa: { score: number | null; checks?: Array<{ titulo: string; passed: boolean; nota: string }> } = { score: null };
    let qaError: string | null = null;
    try {
      qa = await callFn('qa-check', userId, { quote: best.quote, caption: best.caption, target_platform: 'linkedin', editorial_slug: idea.editorial_slug });
      if (mode !== 'adjust' && qa.score !== null && qa.score < QA_PASS) {
        const failed = (qa.checks ?? []).filter((c) => !c.passed).map((c) => `- ${c.titulo}: ${c.nota}`).join('\n');
        const retry = await callFn<Gen & { success: boolean }>('generate-content', userId, genBody(`${briefing}\n\nCORRIJA estes pontos da tentativa anterior:\n${failed}`));
        const qa2 = await callFn<{ score: number | null }>('qa-check', userId, { quote: retry.quote, caption: retry.caption, target_platform: 'linkedin', editorial_slug: idea.editorial_slug });
        if ((qa2.score ?? 0) >= (qa.score ?? 0)) { best = retry; qa = qa2; }
      }
    } catch (e) {
      qaError = (e as Error).message.slice(0, 200);
      console.warn('[content-develop] QA indisponível:', qaError);
    }

    const considered = {
      base: [editorial?.name, 'Genesis (voz e princípios)', 'Diretrizes de criação', 'Base de conhecimento'].filter(Boolean).join(' · '),
      coerencia: idea.rationale?.trim()
        || `Fortalece ${FN_SHORT[fn]}${campaign?.type !== 'vendas' && fn !== 'produtos' ? ' sem aproximação comercial direta' : ''}.`,
      formato: 'LinkedIn · frase + texto',
    };
    return jsonResponse({
      success: true,
      mode,
      frase: String(best.quote ?? '').trim(),
      texto: String(best.caption ?? '').trim(),
      considered,
      meta: {
        headline_type: best.headline_type_used ?? null, analogy: best.analogy_used ?? null,
        virality_score: best.virality_score ?? null, virality_reason: best.virality_reason ?? null, qa_score: qa.score, qa_error: qaError,
      },
    });
  } catch (e) {
    console.error('[content-develop]', e);
    return errorResponse('Erro ao desenvolver o conteúdo', 500, String(e));
  }
});

export {};
