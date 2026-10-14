// Edge function: sequence-script — conteúdos sequenciais, etapa A
// (docs/identidade/Hive_Conteudos_Sequenciais_v1.md §5–§8, §11).
//
// Ações:
//   recommend_plan { content_id }                          → { plans: [...] } peças recomendadas com propósito
//   script         { post_id, replace? }                   → { units, caption, architecture } (grava post_units)
//   adjust_units   { post_id, unit_ids, instruction, scope } → { proposal } SÓ das páginas selecionadas (+legenda)
//   coherence      { post_id }                             → { notes } abertura, continuidade, redundância, legibilidade, encerramento
//
// O roteiro preserva o sentido do conteúdo aprovado e cria PROGRESSÃO (não reparte o texto em
// blocos iguais). A saída da IA é validada contra o contrato: quantidade dentro das capacidades
// da plataforma, páginas com texto, posições sem buraco; o que não passa é rejeitado.
import { checkRateLimit, errorResponse, getUserGeminiKey, internalUserId, jsonResponse, logUsage, preflight, userIdFromAuth } from '../_shared/security.ts';
import { callGeminiJson, fetchRest, svcHeaders } from '../_shared/gemini.ts';
import { loadBeeContext, renderBrain } from '../_shared/bee-context.ts';
import { contextBlock } from '../_shared/context.ts';
import { contractPromptBlock, type AcjContract } from '../_shared/acj.ts';

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

export const ARCHITECTURES: Record<string, { nome: string; progressao: string }> = {
  historia: { nome: 'História e aprendizagem', progressao: 'Situação → acontecimento → descoberta → significado' },
  perspectiva: { nome: 'Mudança de perspectiva', progressao: 'Visão habitual → limite → outra leitura → implicação' },
  conceito: { nome: 'Exploração de conceito', progressao: 'Questão → camadas → exemplo → síntese' },
  caso: { nome: 'Caso e leitura sistêmica', progressao: 'Contexto → sinais → dinâmica → aprendizagem' },
  experimento: { nome: 'Experimentação', progressao: 'Situação reconhecível → proposta prática → observação → reflexão' },
};
const LIMITS_BY: Record<string, { title: number; body: number }> = { carousel: { title: 90, body: 320 }, story: { title: 70, body: 160 } };
let LIMITS = LIMITS_BY.carousel;     // legibilidade por página (o compositor também confere o encaixe)

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, { ...init, headers: { ...svcHeaders(), ...(init.headers ?? {}) } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path.split('?')[0]} ${res.status}: ${text.slice(0, 200)}`);
  return (text ? JSON.parse(text) : null) as T;
}

async function brainFor(userId: string, editorial: string, platform: string, postId?: string | null) {
  const ctx = await loadBeeContext({ editorial_slug: editorial, target_platform: platform as 'linkedin' | 'instagram', post_id: postId ?? null }, userId).catch(() => null);
  return { brain: ctx ? renderBrain(ctx, '') : '', ctxBlock: ctx?.rctx ? contextBlock(ctx.rctx) : '' };
}

async function acjBlock(userId: string, contentId?: string | null): Promise<string> {
  if (!contentId) return '';
  const [ct] = await fetchRest<AcjContract[]>(`/acj_content_contracts?content_id=eq.${contentId}&user_id=eq.${userId}&status=neq.superseded&select=*&order=version.desc&limit=1`).catch(() => []);
  return ct ? contractPromptBlock(ct) : '';
}

const motherText = (c: Row) => `Título: ${c.title}\nFrase: ${c.body?.frase ?? ''}\nTexto aprovado:\n${c.body?.texto ?? ''}`;
const clean = (s: unknown, max: number) => String(s ?? '').replace(/\s+\n/g, '\n').trim().slice(0, max);

Deno.serve(async (req: Request) => {
  const cors = preflight(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Use POST', 405);
  try {
    const userId = userIdFromAuth(req) ?? internalUserId(req);
    if (!userId) return errorResponse('Nao autenticado', 401);
    const rl = checkRateLimit(userId, 60_000, 20);
    if (!rl.ok) return errorResponse(`Rate limit. Tente em ${Math.ceil(rl.resetIn / 1000)}s`, 429);
    const input = (await req.json().catch(() => ({}))) as { action?: string; content_id?: string; post_id?: string; unit_ids?: string[]; instruction?: string; scope?: 'units' | 'sequence' | 'caption'; replace?: boolean };
    const apiKey = await getUserGeminiKey(userId);
    if (!apiKey) return errorResponse('Chave Gemini nao configurada', 400);
    const caps = await fetchRest<Row[]>(`/format_capabilities?select=*`);
    const capOf = (platform: string, format: string) => caps.find((c) => c.platform === platform && c.format === format);

    // ------------------------------------------------------------ plano recomendado
    if (input.action === 'recommend_plan') {
      const [content] = await fetchRest<Row[]>(`/contents?id=eq.${input.content_id}&user_id=eq.${userId}&select=*`);
      if (!content) return errorResponse('Conteúdo não encontrado', 404);
      const [idea] = content.idea_id ? await fetchRest<Row[]>(`/ideas?id=eq.${content.idea_id}&select=channels,summary`) : [null];
      const accounts = await fetchRest<Row[]>(`/social_accounts?user_id=eq.${userId}&status=eq.connected&select=id,platform,label`);
      const plans = await fetchRest<Row[]>(`/content_piece_plans?content_id=eq.${content.id}&user_id=eq.${userId}&status=neq.removed&select=platform,account_id,format,approach`);
      const channels = ((idea?.channels ?? []) as Row[]).filter((c) => accounts.some((a) => a.id === c.account_id));
      const allowed = channels.length ? channels : accounts.map((a) => ({ account_id: a.id, platform: a.platform }));
      const { brain, ctxBlock } = await brainFor(userId, content.editorial_slug ?? '', 'linkedin', null);
      const sys = [
        'Você é a Hive planejando os DESDOBRAMENTOS de um conteúdo-mãe já aprovado. Recomende poucas peças, cada uma com propósito claro.',
        'Formatos disponíveis: image (imagem única) e carousel (sequência de páginas). Carrossel só quando o pensamento tiver densidade para progressão (camadas, caso, passos) — não por padrão.',
        'Pode haver mais de uma peça para a mesma conta (ex.: imagem única e carrossel no LinkedIn), desde que as ABORDAGENS sejam diferentes.',
        'Não repita peças já planejadas. Use SOMENTE as contas listadas.',
        `Arquiteturas narrativas para carrossel: ${Object.entries(ARCHITECTURES).map(([k, a]) => `${k} (${a.nome}: ${a.progressao})`).join('; ')}.`,
        ctxBlock, brain ? `--- Conhecimento de apoio ---\n${brain.slice(0, 6000)}` : '',
        'JSON puro: { "plans": [{ "account_id": "<uuid>", "platform": "linkedin|instagram", "format": "image|carousel", "approach": "<abordagem em poucas palavras>", "purpose": "<por que esta peça, 1 frase>", "architecture": "<chave da arquitetura, só para carousel>" }] }',
      ].filter(Boolean).join('\n');
      const usr = [motherText(content), `CONTAS: ${JSON.stringify(allowed.map((c) => ({ account_id: c.account_id, platform: c.platform, label: accounts.find((a) => a.id === c.account_id)?.label })))}`,
        `JÁ PLANEJADAS: ${JSON.stringify(plans)}`, await acjBlock(userId, content.id)].filter(Boolean).join('\n\n');
      const { data, model_used, usage } = await callGeminiJson<{ plans?: Row[] }>(apiKey, sys, usr, { temperature: 0.4, maxOutputTokens: 2000 });
      logUsage({ userId, provider: 'gemini', product: 'text', model: model_used, tokens_input: usage.input, tokens_output: usage.output, metadata: { fn: 'sequence-script', action: 'recommend_plan' } });
      const out = (data.plans ?? []).filter((p) => allowed.some((c) => c.account_id === p.account_id && c.platform === p.platform) && capOf(p.platform, p.format))
        .slice(0, 6).map((p) => ({ account_id: p.account_id, platform: p.platform, format: p.format, approach: clean(p.approach, 120), purpose: clean(p.purpose, 300),
          architecture: p.format === 'carousel' && ARCHITECTURES[p.architecture] ? p.architecture : (p.format === 'carousel' ? 'conceito' : null) }));
      return jsonResponse({ success: true, plans: out });
    }

    // ------------------------------------------------------------ ações sobre uma peça
    const [post] = await fetchRest<Row[]>(`/user_posts?id=eq.${input.post_id}&user_id=eq.${userId}&select=id,platform,format,caption,content_id,plan_id,narrative_architecture,script_status,status,metadata,version`);
    if (!post) return errorResponse('Peça não encontrada', 404);
    if (post.status === 'published') return errorResponse('Peça publicada: o histórico não muda.', 409);
    const [content] = post.content_id ? await fetchRest<Row[]>(`/contents?id=eq.${post.content_id}&select=*`) : [null];
    const [plan] = post.plan_id ? await fetchRest<Row[]>(`/content_piece_plans?id=eq.${post.plan_id}&select=*`) : [null];
    const cap = capOf(post.platform, post.format) ?? { min_units: 2, max_units: 10, recommended_units: '[5,8]' };
    const [recMin, recMax] = String(cap.recommended_units ?? '[5,8]').replace(/[[\]()]/g, '').split(',').map(Number);
    const editorial = content?.editorial_slug ?? (post.metadata?.editorial_slug as string | undefined) ?? '';
    const { brain, ctxBlock } = await brainFor(userId, editorial, post.platform, post.id);
    const acj = await acjBlock(userId, post.content_id);
    const arch = ARCHITECTURES[post.narrative_architecture ?? plan?.architecture ?? ''] ?? null;
    const story = post.format === 'story';
    LIMITS = LIMITS_BY[story ? 'story' : 'carousel'];
    const units = await fetchRest<Row[]>(`/post_units?post_id=eq.${post.id}&select=id,position,function,title,body,layout&order=position.asc`);
    const baseSys = [
      ctxBlock, brain ? `--- CÉREBRO (metodologia e voz) — consulte, não despeje ---\n${brain.slice(0, 9000)}\n--- fim ---` : '', acj,
    ].filter(Boolean).join('\n\n');

    if (input.action === 'script') {
      if (units.length && !input.replace) return jsonResponse({ success: true, units, caption: post.caption, architecture: post.narrative_architecture, reused: true });
      if (post.script_status === 'approved' && input.replace) return errorResponse('Roteiro aprovado: reabra o roteiro antes de refazer.', 409);
      const sys = [
        `Você é a Hive escrevendo o ROTEIRO de ${story ? 'uma sequência de STORIES do Instagram (telas verticais 9:16, vistas em segundos, uma ideia por tela)' : post.platform === 'linkedin' ? 'um carrossel do LinkedIn (documento em páginas)' : 'um carrossel do Instagram'} a partir de um conteúdo-mãe APROVADO.`,
        baseSys,
        'REGRAS DO ROTEIRO:',
        '- Preserve o sentido do conteúdo aprovado; não invente fatos, números, casos ou biografia.',
        '- Crie PROGRESSÃO: cada página acrescenta algo ao percurso. NÃO reparta o texto em blocos iguais. Sem redundância entre páginas.',
        `- ${arch ? `Arquitetura: ${arch.nome} (${arch.progressao}). Adapte; não é fórmula fixa.` : `Escolha a arquitetura que melhor serve ao pensamento entre: ${Object.entries(ARCHITECTURES).map(([k, a]) => `${k}=${a.nome}`).join(', ')}.`}`,
        `- Quantidade: o necessário, normalmente entre ${recMin} e ${recMax} páginas (mínimo ${cap.min_units}, máximo ${cap.max_units}).`,
        '- Página 1 = capa (layout "cover"): título forte e curto, sem corpo ou com uma linha. Última = encerramento (layout "closing"): síntese, pergunta, prática, continuação ou convite — convite comercial só se a intenção pedir.',
        `- Páginas internas (layout "text"): título até ${LIMITS.title} caracteres e corpo até ${LIMITS.body} caracteres — legível numa tela de celular.`,
        '- Para cada página: a função narrativa (ex.: "situação", "virada", "síntese") e uma direção visual curta.',
        story ? '- Stories: frases curtas e diretas; reflexão ou pergunta no fim. Se fizer sentido, planeje UMA interação (pergunta, enquete ou caixinha) numa tela — ela será colocada à mão no app (a API não publica figurinhas).' : '',
        story ? '- Legenda: Stories não têm legenda; devolva "caption" vazio.' : `- Legenda da peça para ${post.platform}: contextualiza e convida a percorrer as páginas, sem repetir o roteiro inteiro.`,
        `JSON puro: { "architecture": "<chave>", "units": [{ "function": "...", "layout": "cover|text|closing", "title": "...", "body": "...", "visual_direction": "..."${story ? ', "interaction": { "type": "pergunta|enquete|caixinha", "text": "..." } | null' : ''} }], "caption": "...", "notes": "<1 frase sobre a progressão>" }`,
      ].join('\n');
      const usr = [content ? motherText(content) : `Legenda atual:\n${post.caption ?? ''}`, plan?.approach ? `ABORDAGEM DESTA PEÇA: ${plan.approach}` : '', plan?.purpose ? `PROPÓSITO: ${plan.purpose}` : ''].filter(Boolean).join('\n\n');
      const { data, model_used, usage } = await callGeminiJson<{ architecture?: string; units?: Row[]; caption?: string; notes?: string }>(apiKey, sys, usr, { temperature: 0.55, maxOutputTokens: 5000 });
      logUsage({ userId, provider: 'gemini', product: 'text', model: model_used, tokens_input: usage.input, tokens_output: usage.output, metadata: { fn: 'sequence-script', action: 'script' } });
      // Validação do contrato (rejeita o que não serve; não "conserta" em silêncio o que muda sentido).
      const raw = (data.units ?? []).map((u) => ({ function: clean(u.function, 60), layout: ['cover', 'text', 'closing'].includes(u.layout) ? u.layout : 'text',
        title: clean(u.title, LIMITS.title), body: clean(u.body, LIMITS.body), visual_direction: clean(u.visual_direction, 200),
        ...(story && u.interaction?.text ? { interaction: { type: ['pergunta', 'enquete', 'caixinha'].includes(u.interaction.type) ? u.interaction.type : 'pergunta', text: clean(u.interaction.text, 160), execution: 'manual' } } : {}) })).filter((u) => u.title || u.body);
      if (raw.length < cap.min_units || raw.length > cap.max_units) return errorResponse(`Roteiro inválido: ${raw.length} página(s) (permitido ${cap.min_units}–${cap.max_units}). Tente de novo.`, 422);
      raw[0].layout = 'cover';
      raw[raw.length - 1].layout = raw.length > 1 ? 'closing' : raw[raw.length - 1].layout;
      for (let i = 1; i < raw.length - 1; i++) if (raw[i].layout !== 'text') raw[i].layout = 'text';
      const caption = story ? '' : (clean(data.caption, 2200) || post.caption || '');
      const architecture = ARCHITECTURES[data.architecture ?? ''] ? data.architecture : (post.narrative_architecture ?? plan?.architecture ?? 'conceito');
      // Grava a fonte canônica (substitui o rascunho anterior inteiro).
      await rest(`/post_units?post_id=eq.${post.id}`, { method: 'DELETE' });
      const saved = await rest<Row[]>(`/post_units`, { method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify(raw.map((u, i) => ({ ...u, user_id: userId, post_id: post.id, position: i + 1 }))) });
      await rest(`/user_posts?id=eq.${post.id}`, { method: 'PATCH', body: JSON.stringify({ caption, narrative_architecture: architecture, script_status: 'draft',
        carousel_text: { quote: raw[0].title }, metadata: { ...(post.metadata ?? {}), script_notes: clean(data.notes, 300) } }) });
      return jsonResponse({ success: true, units: saved.sort((a, b) => a.position - b.position), caption, architecture });
    }

    if (input.action === 'adjust_units') {
      const scope = input.scope ?? 'units';
      const ids = new Set(scope === 'sequence' ? units.map((u) => u.id) : (input.unit_ids ?? []));
      if (scope !== 'caption' && !ids.size) return errorResponse('Selecione ao menos uma página.', 400);
      if (!input.instruction?.trim()) return errorResponse('Diga o que ajustar.', 400);
      const sys = [
        'Você é a Hive ajustando um roteiro de carrossel. Aplique o pedido SOMENTE nas páginas selecionadas (ou só na legenda).',
        baseSys,
        '- Preserve palavra por palavra o que o pedido não menciona. Não mexa em páginas fora da seleção (elas aparecem só como contexto).',
        `- Respeite a progressão do conjunto e os limites: título até ${LIMITS.title} e corpo até ${LIMITS.body} caracteres.`,
        'JSON puro: { "units": [{ "id": "<id da página selecionada>", "title": "...", "body": "..." }], "caption": "<só se o escopo for legenda>", "coherence": "<1 frase: o que revisar no conjunto>" }',
      ].join('\n');
      const usr = [
        'ROTEIRO ATUAL:', ...units.map((u) => `${ids.has(u.id) ? '[SELECIONADA] ' : ''}id=${u.id} · p${u.position} · ${u.function ?? ''}\nTítulo: ${u.title ?? ''}\nCorpo: ${u.body ?? ''}`),
        `LEGENDA:\n${post.caption ?? ''}`, `ESCOPO: ${scope === 'caption' ? 'só a legenda' : scope === 'sequence' ? 'sequência inteira' : 'páginas selecionadas'}`, `PEDIDO: ${input.instruction}`,
      ].join('\n\n');
      const { data, model_used, usage } = await callGeminiJson<{ units?: Row[]; caption?: string; coherence?: string }>(apiKey, sys, usr, { temperature: 0.4, maxOutputTokens: 4000 });
      logUsage({ userId, provider: 'gemini', product: 'text', model: model_used, tokens_input: usage.input, tokens_output: usage.output, metadata: { fn: 'sequence-script', action: 'adjust_units' } });
      const proposal: Row = {};
      if (scope !== 'caption') {
        proposal.units = (data.units ?? []).filter((u) => ids.has(u.id)).map((u) => {
          const cur = units.find((x) => x.id === u.id)!;
          return { id: u.id, title: u.title === undefined ? cur.title : clean(u.title, LIMITS.title), body: u.body === undefined ? cur.body : clean(u.body, LIMITS.body) };
        }).filter((u) => { const cur = units.find((x) => x.id === u.id)!; return u.title !== cur.title || u.body !== cur.body; });
      } else if (data.caption) proposal.caption = clean(data.caption, 2200);
      return jsonResponse({ success: true, proposal, coherence: clean(data.coherence, 300), unit_ids: [...ids] });
    }

    if (input.action === 'coherence') {
      const sys = ['Você é a Hive revisando um roteiro de carrossel como editor.', baseSys,
        'Avalie: abertura (a capa puxa?), continuidade (cada página leva à próxima?), redundâncias, legibilidade (página com texto demais?) e encerramento.',
        'Aponte só problemas reais, com a página. JSON puro: { "notes": [{ "aspect": "abertura|continuidade|redundancia|legibilidade|encerramento", "position": <n ou null>, "note": "..." }], "ok": boolean }'].join('\n');
      const usr = units.map((u) => `p${u.position} · ${u.function ?? ''}\n${u.title ?? ''}\n${u.body ?? ''}`).join('\n\n');
      const { data } = await callGeminiJson<{ notes?: Row[]; ok?: boolean }>(apiKey, sys, usr, { temperature: 0.2, maxOutputTokens: 1500 });
      return jsonResponse({ success: true, ok: !!data.ok, notes: (data.notes ?? []).slice(0, 8).map((n) => ({ aspect: String(n.aspect ?? ''), position: typeof n.position === 'number' ? n.position : null, note: clean(n.note, 300) })) });
    }

    return errorResponse('Ação desconhecida', 400);
  } catch (e) {
    console.error('[sequence-script]', e);
    return errorResponse('Erro no roteiro da sequência', 500, String(e));
  }
});
