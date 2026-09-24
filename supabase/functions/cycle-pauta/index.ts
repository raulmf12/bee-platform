// Edge function: cycle-pauta — TELA 09 (Pauta recomendada para este ciclo).
// Transforma as necessidades estratégicas do ciclo (plano determinístico já
// salvo em campaign_cycles.plan) em IDEIAS-MÃE — ainda sem escrever posts.
// Modos:
//   full    → pauta inteira (N = plan.totals.contents)
//   refresh → nova seleção, evitando as ideias atuais do ciclo
//   swap    → troca UMA ideia (mesma função e canais), evitando as demais
// A IA propõe; o servidor GARANTE: quantidade, funções = necessidades do plano,
// editorial válido e canais respeitando exatamente a cadência de cada conta.
// Entrada: { cycle_id, mode?, idea_id? }   Saída: { success, ideas[] } (não persiste)
import {
  checkRateLimit, errorResponse, getUserGeminiKey, internalUserId, jsonResponse, logUsage, preflight, userIdFromAuth,
} from '../_shared/security.ts';
import { callGeminiJson, fetchRest } from '../_shared/gemini.ts';
import { retrieveContext } from '../_shared/bee-context.ts';

type Fn = 'presenca' | 'posicionamento' | 'autoridade' | 'relacionamento' | 'produtos';
const FNS: Fn[] = ['presenca', 'posicionamento', 'autoridade', 'relacionamento', 'produtos'];
const FN_LABEL: Record<Fn, string> = {
  presenca: 'Ampliar presença (chegar a novas pessoas, descoberta)',
  posicionamento: 'Fortalecer posicionamento (clareza do que a pessoa quer ser reconhecida)',
  autoridade: 'Construir autoridade (repertório, experiência, profundidade)',
  relacionamento: 'Gerar relacionamento (identificação, conversa, proximidade)',
  produtos: 'Aproximar produtos (conectar naturalmente ao que se oferece)',
};
// Editorial padrão por função, se a IA escolher um inexistente.
const FN_DEFAULT_EDITORIAL: Record<Fn, string> = {
  presenca: 'provocacao-de-crenca', posicionamento: 'reflexao-filosofica-curta', autoridade: 'diagnostico-sistemico',
  relacionamento: 'historia-pessoal-vulneravel', produtos: 'bastidor-da-bee',
};

interface Input { cycle_id: string; mode?: 'full' | 'refresh' | 'swap'; idea_id?: string }
interface Plan {
  needs: Array<{ function: Fn; count: number }>;
  channels: Array<{ account_id: string; platform: 'linkedin' | 'instagram'; label: string; contents: number }>;
  totals: { contents: number; pieces: number };
}
interface RawIdea { title?: string; summary?: string; strategic_function?: string; editorial_slug?: string; platforms?: string[]; rationale?: string }
export interface OutIdea {
  title: string; summary: string; strategic_function: Fn; editorial_slug: string;
  channels: Array<{ account_id: string; platform: 'linkedin' | 'instagram' }>; suggested_pieces: number; rationale: string;
}

// Reatribui funções pra bater EXATAMENTE com as necessidades do plano, mexendo no
// mínimo de ideias possível (mantém a escolha da IA quando ela já está certa).
function enforceFunctions(ideas: RawIdea[], needs: Array<{ function: Fn; count: number }>): Fn[] {
  const remaining = new Map(needs.map((n) => [n.function, n.count]));
  const out: Array<Fn | null> = ideas.map((i) => {
    const f = i.strategic_function as Fn;
    if (FNS.includes(f) && (remaining.get(f) ?? 0) > 0) { remaining.set(f, remaining.get(f)! - 1); return f; }
    return null;
  });
  return out.map((f) => {
    if (f) return f;
    const next = [...remaining.entries()].find(([, c]) => c > 0);
    if (next) { remaining.set(next[0], next[1] - 1); return next[0]; }
    return 'presenca';
  });
}

// Distribui as vagas de cada conta (cadência) entre as ideias: cada conta recebe
// EXATAMENTE `contents` ideias. Ordem de prioridade: não repetir plataforma na
// mesma ideia → COBERTURA (quem tem menos canais) → preferência da IA → ordem.
// Cobertura vem antes da preferência pra nenhuma ideia ficar sem canal.
function balanceChannels(ideas: RawIdea[], channels: Plan['channels']): OutIdea['channels'][] {
  const assigned: OutIdea['channels'][] = ideas.map(() => []);
  const ordered = [...channels].sort((a, b) => (a.platform === 'linkedin' ? -1 : 1) - (b.platform === 'linkedin' ? -1 : 1));
  for (const ch of ordered) {
    const candidates = ideas.map((idea, i) => ({
      i,
      hasSamePlatform: assigned[i].some((c) => c.platform === ch.platform) ? 1 : 0,
      load: assigned[i].length,
      wants: (idea.platforms ?? []).includes(ch.platform) ? 0 : 1,
    })).sort((a, b) => a.hasSamePlatform - b.hasSamePlatform || a.load - b.load || a.wants - b.wants || a.i - b.i);
    for (const c of candidates.slice(0, Math.min(ch.contents, ideas.length))) {
      assigned[c.i].push({ account_id: ch.account_id, platform: ch.platform });
    }
  }
  // Se ainda sobrar ideia sem canal (vagas < ideias), MOVE um canal de quem tem
  // dois — nunca soma além da cadência.
  for (let i = 0; i < assigned.length; i++) {
    if (assigned[i].length) continue;
    const donor = assigned.findIndex((a) => a.length >= 2);
    if (donor >= 0) assigned[i].push(assigned[donor].pop()!);
  }
  return assigned;
}

Deno.serve(async (req: Request) => {
  const cors = preflight(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Use POST', 405);
  try {
    const userId = userIdFromAuth(req) ?? internalUserId(req);
    if (!userId) return errorResponse('Nao autenticado', 401);
    const rl = checkRateLimit(userId, 60_000, 15);
    if (!rl.ok) return errorResponse(`Rate limit. Tente em ${Math.ceil(rl.resetIn / 1000)}s`, 429);
    const input = (await req.json().catch(() => ({}))) as Input;
    if (!input.cycle_id) return errorResponse('cycle_id obrigatório', 400);
    const mode = input.mode ?? 'full';
    const apiKey = await getUserGeminiKey(userId);
    if (!apiKey) return errorResponse('Chave Gemini nao configurada', 400);

    const [cycle] = await fetchRest<Array<{ id: string; user_id: string; campaign_id: string; idx: number; start_date: string; end_date: string; plan: Plan | null }>>(
      `/campaign_cycles?id=eq.${input.cycle_id}&user_id=eq.${userId}&select=id,user_id,campaign_id,idx,start_date,end_date,plan&limit=1`);
    if (!cycle) return errorResponse('Ciclo não encontrado', 404);
    if (!cycle.plan?.needs?.length) return errorResponse('Confirme o planejamento do ciclo antes de gerar a pauta.', 400);
    const plan = cycle.plan;
    const [campaign] = await fetchRest<Array<{ name: string; type: string; intent: string | null; moment: { label?: string; summary?: string } | null; strategy: { mix?: Record<string, number> } | null; product_id: string | null; duration_weeks: number | null }>>(
      `/campaigns?id=eq.${cycle.campaign_id}&select=name,type,intent,moment,strategy,product_id,duration_weeks&limit=1`);

    const cycleIdeas = await fetchRest<Array<{ id: string; title: string; strategic_function: Fn; channels: OutIdea['channels']; status: string }>>(
      `/ideas?cycle_id=eq.${cycle.id}&status=neq.discarded&select=id,title,strategic_function,channels,status`);
    const swapTarget = mode === 'swap' ? cycleIdeas.find((i) => i.id === input.idea_id) : undefined;
    if (mode === 'swap' && !swapTarget) return errorResponse('Ideia a trocar não encontrada', 404);

    const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
    const [recent, contents, backlog, editorials, arsenal, core, products] = await Promise.all([
      fetchRest<Array<{ title: string | null; carousel_text: { quote?: string } | null }>>(`/user_posts?user_id=eq.${userId}&created_at=gte.${since}&select=title,carousel_text&order=created_at.desc&limit=60`),
      fetchRest<Array<{ title: string }>>(`/contents?user_id=eq.${userId}&select=title&order=created_at.desc&limit=40`),
      fetchRest<Array<{ title: string; summary: string | null; strategic_function: string | null }>>(`/ideas?user_id=eq.${userId}&status=eq.backlog&select=title,summary,strategic_function&limit=10`),
      fetchRest<Array<{ slug: string; name: string; description: string | null; objetivo: string | null; temas: string[] | null }>>(`/bee_editorials?is_active=eq.true&select=slug,name,description,objetivo,temas&order=position.asc`),
      fetchRest<Array<{ title: string; summary: string | null; editorial_slug: string | null }>>(`/bee_arsenal?is_active=eq.true&select=title,summary,editorial_slug&order=usage_count.asc,last_used_at.asc.nullsfirst&limit=25`),
      fetchRest<Array<{ produto_real: string; frase_organizadora: string; persona_nome: string | null; voz_como_escreve: string | null }>>(`/genesis_core?select=produto_real,frase_organizadora,persona_nome,voz_como_escreve&limit=1`),
      campaign?.product_id ? fetchRest<Array<{ name: string; promessa: string | null }>>(`/bee_products?id=eq.${campaign.product_id}&select=name,promessa&limit=1`) : Promise.resolve([]),
    ]);

    const edSlugs = new Set(editorials.map((e) => e.slug));
    const avoid = [
      ...cycleIdeas.map((i) => i.title),
      ...contents.map((c) => c.title),
      ...recent.map((r) => r.carousel_text?.quote ?? r.title ?? '').filter(Boolean),
    ].slice(0, 80);

    // Quantas e quais funções pedir.
    let needs: Array<{ function: Fn; count: number }>;
    if (mode === 'swap') needs = [{ function: swapTarget!.strategic_function ?? 'presenca', count: 1 }];
    else needs = plan.needs;
    const total = needs.reduce((a, n) => a + n.count, 0);

    const themeQuery = [campaign?.intent, campaign?.moment?.label, ...needs.map((n) => FN_LABEL[n.function])].filter(Boolean).join(' · ');
    const rag = await retrieveContext(apiKey, themeQuery, campaign?.intent ?? undefined, userId).catch(() => '');

    const sys = [
      'Você é a Hive, a inteligência estratégica de conteúdo da Bee Consulting. Monta a PAUTA de um ciclo semanal: ideias-mãe que valem a pena desenvolver — NÃO escreve posts ainda.',
      'Uma ideia-mãe define TERRITÓRIO e DIREÇÃO de pensamento. O título é uma pergunta ou frase provocativa na voz do autor (ex.: "Por que bons líderes repetem velhos padrões?", "E se aquilo que chamamos de resistência for apenas coerência?"). O resumo diz em 1–2 frases que linha de pensamento explorar.',
      'Cada ideia cumpre UMA função estratégica e usa UM editorial (o formato de pensamento) da lista. Ideias distintas entre si, sem repetir temas recentes, sem clichê de coach/marketing.',
      'Use os FATOS REAIS DO AUTOR quando ajudarem a dar concretude; nunca invente casos.',
      core[0] ? `PROPÓSITO DA MARCA: ${core[0].produto_real} — ${core[0].frase_organizadora}` : '',
      core[0]?.voz_como_escreve ? `COMO O AUTOR ESCREVE: ${core[0].voz_como_escreve}` : '',
      'Português do Brasil.',
    ].filter(Boolean).join('\n');

    const usr = [
      `CAMPANHA: ${campaign?.name ?? ''} (${campaign?.type === 'vendas' ? 'vendas/lançamento' : 'orgânica'}) · ciclo ${cycle.idx}${campaign?.duration_weeks ? ` de ${campaign.duration_weeks}` : ''}`,
      campaign?.intent ? `INTENÇÃO: ${campaign.intent}` : '',
      campaign?.moment?.label ? `MOMENTO: ${campaign.moment.label} — ${campaign.moment.summary ?? ''}` : '',
      products[0] ? `PRODUTO: ${products[0].name}${products[0].promessa ? ` — ${products[0].promessa}` : ''}` : '',
      '',
      `GERE EXATAMENTE ${total} IDEIA(S), com esta distribuição de funções:`,
      ...needs.map((n) => `- ${n.count}× ${n.function}: ${FN_LABEL[n.function]}`),
      '',
      'EDITORIAIS DISPONÍVEIS (use o slug):',
      ...editorials.map((e) => `- ${e.slug}: ${e.name}${e.objetivo ? ` — ${e.objetivo}` : e.description ? ` — ${e.description.slice(0, 120)}` : ''}`),
      '',
      `CANAIS DO CICLO: ${plan.channels.map((c) => `${c.platform} · ${c.label} (${c.contents}/semana)`).join('; ')}. Em "platforms", diga onde a ideia tem mais potencial.`,
      arsenal.length ? `\nÂNGULOS DO ARSENAL (inspiração, não fonte de fatos):\n${arsenal.map((a) => `- ${a.title}${a.summary ? `: ${a.summary.slice(0, 110)}` : ''}`).join('\n')}` : '',
      backlog.length ? `\nIDEIAS DO BACKLOG DO AUTOR (pode aproveitar se couber):\n${backlog.map((b) => `- ${b.title}${b.summary ? `: ${b.summary}` : ''}`).join('\n')}` : '',
      rag ? `\nFATOS REAIS DO AUTOR:\n${rag}` : '',
      avoid.length ? `\nNÃO REPITA estes temas/títulos recentes:\n${avoid.map((t) => `- ${t.slice(0, 120)}`).join('\n')}` : '',
      '',
      'Devolva JSON puro:',
      '{ "ideas": [ { "title": "...", "summary": "...", "strategic_function": "presenca|posicionamento|autoridade|relacionamento|produtos", "editorial_slug": "...", "platforms": ["linkedin","instagram"], "rationale": "<por que esta ideia agora, 1 frase>" } ] }',
    ].filter((l) => l !== '').join('\n');

    const { data, model_used, usage } = await callGeminiJson<{ ideas?: RawIdea[] }>(apiKey, sys, usr, { temperature: 0.85, maxOutputTokens: 4000 });
    let raw = (data.ideas ?? []).filter((i) => i.title && i.title.trim().length > 3).slice(0, total);
    if (raw.length === 0) return errorResponse('A Hive não conseguiu montar a pauta. Tente de novo.', 502);
    while (raw.length < total) raw = [...raw, raw[raw.length % raw.length]];

    const fns = mode === 'swap' ? raw.map(() => swapTarget!.strategic_function ?? 'presenca') : enforceFunctions(raw, needs);
    const channels = mode === 'swap' ? raw.map(() => swapTarget!.channels ?? []) : balanceChannels(raw, plan.channels);
    const ideas: OutIdea[] = raw.map((r, i) => {
      const f = fns[i];
      const slug = edSlugs.has(r.editorial_slug ?? '') ? r.editorial_slug! : (edSlugs.has(FN_DEFAULT_EDITORIAL[f]) ? FN_DEFAULT_EDITORIAL[f] : editorials[0]?.slug ?? '');
      return {
        title: r.title!.trim(), summary: (r.summary ?? '').trim(), strategic_function: f, editorial_slug: slug,
        channels: channels[i], suggested_pieces: channels[i].length, rationale: (r.rationale ?? '').trim(),
      };
    });

    logUsage({ userId, provider: 'gemini', product: 'text', model: model_used, tokens_input: usage.input, tokens_output: usage.output, metadata: { fn: 'cycle-pauta', mode } });
    return jsonResponse({ success: true, mode, ideas });
  } catch (e) {
    console.error('[cycle-pauta]', e);
    return errorResponse('Erro ao montar a pauta', 500, String(e));
  }
});

export {};
