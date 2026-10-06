// Edge function: acj-orchestrator — a ACJ-00 da Hive (docs/acj).
// Pensa e devolve; quem persiste é o cliente (mesmo padrão das campanhas), e as
// invariantes ficam no banco. Ações:
//   campaign_plan { campaign_id? | draft?, adoption?, instruction?, current? } → { plan }
//   assign        { title, summary?, strategic_function?, editorial_slug?, cycle_id? } → { assignment }
//   validate      { contract, body:{frase,texto} } → { validation }
//   read_signals  { post_id } → { reading }  (comentários da audiência à luz da ACJ)
import {
  checkRateLimit, errorResponse, getUserGeminiKey, internalUserId, jsonResponse, logUsage, preflight, userIdFromAuth,
} from '../_shared/security.ts';
import { callGeminiJson, fetchRest } from '../_shared/gemini.ts';
import {
  ACJ_IDS, ACJ_LIBRARY_VERSION, acjCatalog, acjDef, normAcj, normConfidence, normMix, validateMovement, type AcjId,
} from '../_shared/acj.ts';

type Row = Record<string, any>;
const FN_LABEL: Record<string, string> = {
  presenca: 'Presença', posicionamento: 'Posicionamento', autoridade: 'Autoridade', relacionamento: 'Relacionamento', produtos: 'Produtos',
};
const PHASES = 4;

const list = (v: unknown, n = 6) => (Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x.trim() : x)).filter(Boolean).slice(0, n) : []);
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

async function campaignPlan(apiKey: string, userId: string, input: Row) {
  let c: Row = input.draft ?? {};
  let late: Row | null = null;
  if (input.campaign_id) {
    const [row] = await fetchRest<Row[]>(`/campaigns?id=eq.${input.campaign_id}&user_id=eq.${userId}&select=id,name,type,intent,moment,strategy,duration_weeks,start_date,end_date,product_id,status&limit=1`);
    if (!row) throw Object.assign(new Error('Campanha não encontrada'), { status: 404 });
    c = { ...row, weeks: row.duration_weeks };
    if (input.adoption === 'late') {
      const today = new Date().toISOString().slice(0, 10);
      const [cycles, pieces] = await Promise.all([
        fetchRest<Row[]>(`/campaign_cycles?campaign_id=eq.${row.id}&select=idx,start_date,end_date,status&order=idx.asc`),
        fetchRest<Row[]>(`/user_posts?campaign_id=eq.${row.id}&status=in.(published,scheduled,approved)&select=title,status,carousel_text,platform&order=created_at.desc&limit=30`),
      ]);
      const current = cycles.find((cy) => cy.start_date <= today && today <= cy.end_date) ?? cycles.find((cy) => cy.start_date > today);
      late = {
        current_cycle: current?.idx ?? null, total_cycles: cycles.length,
        done: cycles.filter((cy) => cy.end_date < today).length,
        published: pieces.filter((p) => p.status === 'published').length, scheduled: pieces.filter((p) => p.status !== 'published').length,
        recent: pieces.slice(0, 12).map((p) => String(p.carousel_text?.quote ?? p.title ?? '').slice(0, 120)).filter(Boolean),
      };
    }
  }
  const [core, avatars, products] = await Promise.all([
    fetchRest<Row[]>(`/genesis_core?select=produto_real,frase_organizadora,persona_nome&limit=1`).catch(() => []),
    fetchRest<Row[]>(`/genesis_avatares?select=nome,pergunta_central,o_que_busca&order=ordem.asc&limit=5`).catch(() => []),
    c.product_id ? fetchRest<Row[]>(`/bee_products?id=eq.${c.product_id}&select=name,promessa&limit=1`).catch(() => []) : Promise.resolve([]),
  ]);
  const mix = (c.strategy?.mix ?? {}) as Record<string, number>;
  const phasesStrategy = (c.strategy?.phases ?? c.strategy?.matrix?.map((b: Row) => b.levels) ?? []) as Row[];

  const sys = [
    'Você é a ACJ-00 da Hive (Bee Consulting / Marcos Piccini): transforma a estratégia de uma campanha em um PLANO RELACIONAL.',
    'A estratégia (mix de funções: presença, posicionamento, autoridade, relacionamento, produtos) diz o que a campanha precisa produzir para o negócio. O mix ACJ é OUTRO EIXO: diz que movimentos relacionais a jornada precisa (ACJ-01..05). Não confunda: Autoridade ≠ Aprofundamento; Relacionamento ≠ Conexão.',
    'As cinco ACJs NÃO são funil linear: pessoas entram em pontos diferentes, voltam, permanecem. Trabalhe com hipóteses de sequência, pontes e sustentação.',
    'Proporções são hipóteses operacionais, não cotas. Nenhuma ACJ precisa estar em todas as fases; ausência intencional deve ser registrada em exclusions.',
    'Fase = mudança de necessidade da jornada (não só calendário). Use exatamente 4 fases, alinhadas às 4 fases da estratégia.',
    'Não infira o que os dados não autorizam: quando faltar evidência, diga em human_decisions_required e use confiança baixa.',
    'Português do Brasil. JSON puro.',
  ].join('\n');
  const usr = [
    `CAMPANHA: ${c.name ?? 'nova campanha'} · ${c.type === 'vendas' ? 'vendas/lançamento' : 'orgânica'} · ${c.weeks ?? c.duration_weeks ?? '?'} semanas`,
    c.intent ? `INTENÇÃO: ${c.intent}` : '',
    c.moment?.label ? `MOMENTO DA PRESENÇA: ${c.moment.label} — ${c.moment.summary ?? ''}` : '',
    products[0] ? `PRODUTO: ${products[0].name}${products[0].promessa ? ` — ${products[0].promessa}` : ''}` : '',
    core[0] ? `MARCA: ${core[0].produto_real} — ${core[0].frase_organizadora}` : '',
    avatars.length ? `AUDIÊNCIA (avatares): ${avatars.map((a) => `${a.nome}${a.pergunta_central ? `: ${String(a.pergunta_central).slice(0, 120)}` : ''}${a.o_que_busca ? ` (busca: ${String(a.o_que_busca).slice(0, 100)})` : ''}`).join(' | ')}` : '',
    `MIX ESTRATÉGICO APROVADO: ${Object.entries(mix).map(([k, v]) => `${FN_LABEL[k] ?? k} ${v}%`).join(' · ')}`,
    phasesStrategy.length ? `FASES DA ESTRATÉGIA (intensidade por função): ${phasesStrategy.slice(0, 4).map((p, i) => `F${i + 1}: ${Object.entries(p).map(([k, v]) => `${FN_LABEL[k] ?? k}=${v}`).join(', ')}`).join(' | ')}` : '',
    c.strategy?.rationale ? `POR QUE ESTA ESTRATÉGIA: ${c.strategy.rationale}` : '',
    late ? `\nADOÇÃO TARDIA: a campanha já está em andamento (ciclo ${late.current_cycle ?? '?'} de ${late.total_cycles}; ${late.done} ciclo(s) encerrado(s); ${late.published} peça(s) publicada(s) e ${late.scheduled} programada(s) SEM ACJ). O plano vale daqui em diante; as fases já vividas devem refletir o que provavelmente foi oferecido, sem reclassificar o histórico. Peças recentes:\n${late.recent.map((t: string) => `- ${t}`).join('\n')}` : '',
    input.instruction ? `\nPEDIDO DE AJUSTE DO MARCOS: "${input.instruction}". Atenda e preserve o resto.${input.current?.target_mix ? ` Mix atual: ${JSON.stringify(input.current.target_mix)}` : ''}` : '',
    '', `BIBLIOTECA ACJ (v0.1, em validação):\n${acjCatalog()}`, '',
    'JSON:',
    '{ "audience_state": "<como a audiência percebe/sente/age hoje>", "desired_state": "<estado desejado ao final>", "journey_needs": ["<necessidade relacional priorizada>"],',
    '  "target_mix": {"ACJ-01":n,"ACJ-02":n,"ACJ-03":n,"ACJ-04":n,"ACJ-05":n}, "mix_roles": {"ACJ-01":"<função na campanha ou por que baixa/ausente>", ...},',
    '  "phases": [ {"label":"<nome curto>","entry_state":"","priority_movement":"","acj_primary":["ACJ-0X"],"bridges":"","exit_state":"","mix":{"ACJ-01":n,...}} ×4 ],',
    '  "sequence_hypotheses": [ {"id":"SEQ-01","hypothesis":"","condition":"","sequence":"ACJ-0X → ACJ-0Y","confidence":"low","observe":"<como observar>"} ],',
    '  "success_signals": {"audience":[""],"journey":[""],"business":[""]}, "recalibration_rules": ["<condição para aumentar/reduzir/alterar>"], "exclusions": ["<ACJ/movimento/CTA que não deve ganhar prioridade e por quê>"],',
    '  "summary": {"journey":"<a jornada proposta, 1–2 frases>","why":"<por que esta composição serve à estratégia>","risk":"<principal risco>","learn":"<o que a Hive deve aprender nesta campanha>"},',
    '  "confidence": "very_low|low|medium|high|very_high", "human_decisions_required": ["<só o que exige julgamento do Marcos>"] }',
  ].filter((l) => l !== '').join('\n');

  const { data, usage, model_used } = await callGeminiJson<Row>(apiKey, sys, usr, { temperature: 0.4, maxOutputTokens: 5000 });
  const target = normMix(data.target_mix);
  const rawPhases = Array.isArray(data.phases) ? data.phases.slice(0, PHASES) : [];
  while (rawPhases.length < PHASES) rawPhases.push(rawPhases[rawPhases.length - 1] ?? { mix: target });
  const phases = rawPhases.map((p: Row, i: number) => ({
    phase: i + 1, label: str(p.label) || `Fase ${i + 1}`, entry_state: str(p.entry_state), priority_movement: str(p.priority_movement),
    acj_primary: list(p.acj_primary, 3).map(normAcj).filter(Boolean), bridges: str(p.bridges), exit_state: str(p.exit_state),
    mix: p.mix ? normMix(p.mix) : target,
  }));
  const roles = (data.mix_roles ?? {}) as Row;
  const plan = {
    audience_state: str(data.audience_state), desired_state: str(data.desired_state), journey_needs: list(data.journey_needs),
    target_mix: target, phases,
    sequence_hypotheses: list(data.sequence_hypotheses, 5).map((h: Row, i: number) => ({
      id: str(h.id) || `SEQ-0${i + 1}`, hypothesis: str(h.hypothesis), condition: str(h.condition), sequence: str(h.sequence),
      confidence: normConfidence(h.confidence), observe: str(h.observe),
    })),
    success_signals: { audience: list(data.success_signals?.audience), journey: list(data.success_signals?.journey), business: list(data.success_signals?.business) },
    recalibration_rules: list(data.recalibration_rules), exclusions: list(data.exclusions),
    summary: {
      journey: str(data.summary?.journey), why: str(data.summary?.why), risk: str(data.summary?.risk), learn: str(data.summary?.learn),
      mix_roles: Object.fromEntries(ACJ_IDS.map((id) => [id, str(roles[id])])),
    },
    confidence: normConfidence(data.confidence), human_decisions_required: list(data.human_decisions_required),
    adoption: late ? 'late' : (input.adoption === 'late' ? 'late' : 'native'),
    adoption_note: late ? `Adoção tardia: plano criado com a campanha em andamento (ciclo ${late.current_cycle ?? '?'} de ${late.total_cycles}); ${late.published} peça(s) publicada(s) antes da ACJ ficam como legado, sem reclassificação.` : null,
    source_acj_version: ACJ_LIBRARY_VERSION,
  };
  return { plan, usage, model_used };
}

async function assign(apiKey: string, userId: string, input: Row) {
  let cycleNeed = '';
  if (input.cycle_id) {
    const [cp] = await fetchRest<Row[]>(`/acj_cycle_plans?cycle_id=eq.${input.cycle_id}&user_id=eq.${userId}&status=eq.active&select=counts,priorities,rationale&order=version.desc&limit=1`).catch(() => []);
    if (cp) cycleNeed = `Composição do ciclo: ${Object.entries(cp.counts ?? {}).map(([k, v]) => `${k}=${v}`).join(', ')}. ${cp.rationale ?? ''}`;
  }
  const sys = 'Você é a ACJ-00 da Hive. Atribui a ACJ PRIMÁRIA que uma ideia realiza NATURALMENTE (e no máximo uma secundária distinta). Nunca ACJ-00. Se a ideia não serve a nenhum movimento com clareza, confiança baixa e human_decision_required=true. JSON puro, pt-BR.';
  const usr = [
    `IDEIA: ${input.title}`, input.summary ? `Direção: ${input.summary}` : '',
    input.strategic_function ? `Função estratégica (outro eixo): ${input.strategic_function}` : '', input.editorial_slug ? `Editorial: ${input.editorial_slug}` : '',
    cycleNeed, '', acjCatalog(), '',
    '{ "acj_primary":"ACJ-0X", "acj_secondary":null, "acj_role":"<papel na sequência: ponto de entrada, ponte para…, sustentação…>", "rationale":"", "alternative_considered":null, "confidence":"low|medium|high", "human_decision_required":false }',
  ].filter(Boolean).join('\n');
  const { data, usage, model_used } = await callGeminiJson<Row>(apiKey, sys, usr, { temperature: 0.25, maxOutputTokens: 600 });
  const primary = normAcj(data.acj_primary) ?? 'ACJ-01';
  const sec = normAcj(data.acj_secondary);
  return {
    assignment: {
      acj_primary: primary, acj_secondary: sec && sec !== primary ? sec : null, acj_role: str(data.acj_role), acj_rationale: str(data.rationale),
      acj_confidence: normConfidence(data.confidence), alternative_considered: normAcj(data.alternative_considered), human_decision_required: data.human_decision_required === true,
    },
    usage, model_used,
  };
}

async function readSignals(apiKey: string, userId: string, input: Row) {
  const [post] = await fetchRest<Row[]>(`/user_posts?id=eq.${input.post_id}&user_id=eq.${userId}&select=id,platform,caption,carousel_text,acj_primary,acj_snapshot,published_at,status&limit=1`);
  if (!post) throw Object.assign(new Error('Peça não encontrada'), { status: 404 });
  const [comments, metrics] = await Promise.all([
    fetchRest<Row[]>(`/post_comments?post_id=eq.${post.id}&is_own=eq.false&select=text,like_count,commented_at&order=commented_at.asc&limit=80`),
    fetchRest<Row[]>(`/post_metrics?post_id=eq.${post.id}&select=reach,likes,comments,saves,shares&order=captured_at.desc&limit=1`),
  ]);
  const acj = normAcj(post.acj_primary) as AcjId | null;
  const m = metrics[0] ?? {};
  const base = { post_id: post.id, acj_primary: acj, comment_count: comments.length };
  if (!acj) {
    return { reading: { ...base, movement_evidence: 'insufficient', probable_causes: [], signals: [], summary: 'Peça sem ACJ atribuída: os sinais ficam como contexto, não como evidência de arquitetura.', limitations: 'Sem contrato ACJ (legado ou avulso).' }, usage: {}, model_used: 'none' };
  }
  if (comments.length === 0) {
    return { reading: { ...base, movement_evidence: 'insufficient', probable_causes: (m.reach ?? 0) < 300 ? ['distribution'] : [], signals: [], summary: 'Ainda não há comentários da audiência para ler o movimento.', limitations: `Sem comentários. Alcance ${m.reach ?? 'desconhecido'}.` }, usage: {}, model_used: 'none' };
  }
  const def = acjDef(acj)!;
  const audience = def.results.find((r) => r.level === 'Audiência');
  const sys = [
    'Você é a leitura de resultados da ACJ-00. Lê os COMENTÁRIOS da audiência de um post e avalia se há sinais do movimento relacional pretendido.',
    'Regras: não declare causalidade; distinga arquitetura, conteúdo, execução, distribuição e contexto; reação, alcance ou concordância NÃO comprovam o movimento por si só.',
    'Nunca cite nomes de pessoas. Trechos curtos (até 15 palavras) como evidência.',
    'JSON puro, pt-BR.',
  ].join('\n');
  const usr = [
    `PEÇA (${post.platform}): ${String(post.carousel_text?.quote ?? '').slice(0, 200)}`,
    `CONTRATO: ${acj} ${def.name}${post.acj_snapshot?.movement_to ? ` · deslocamento pretendido: ${post.acj_snapshot.movement_to}` : ''}`,
    `SINAL ESPERADO NA AUDIÊNCIA: ${audience?.signal ?? ''} Indicadores: ${audience?.indicator ?? ''} Limitação: ${audience?.limitation ?? ''}`,
    `Sinais iniciais do mecanismo: ${def.mechanism_steps.early_signals}`,
    `MÉTRICAS: alcance ${m.reach ?? '?'} · curtidas ${m.likes ?? '?'} · comentários ${m.comments ?? comments.length} · salvamentos ${m.saves ?? '?'} · compartilhamentos ${m.shares ?? '?'}`,
    `COMENTÁRIOS (${comments.length}):\n${comments.map((c, i) => `${i + 1}. ${String(c.text ?? '').replace(/@\w+/g, '@…').slice(0, 300)}`).join('\n')}`,
    '',
    '{ "movement_evidence":"strong|partial|absent|insufficient", "signals":[{"type":"<ex.: adoção de linguagem, autolocalização, pedido de continuidade, reação genérica>","excerpt":"<trecho curto>","reads_as":"ACJ-0X ou genérico"}], "probable_causes":["attribution|content|execution|distribution|context"], "summary":"<1–2 frases>", "limitations":"<o que não dá para concluir>" }',
  ].join('\n');
  const { data, usage, model_used } = await callGeminiJson<Row>(apiKey, sys, usr, { temperature: 0.2, maxOutputTokens: 1200 });
  const ev = ['strong', 'partial', 'absent', 'insufficient'].includes(String(data.movement_evidence)) ? data.movement_evidence : 'insufficient';
  const causes = list(data.probable_causes, 5).map(String).filter((x) => ['attribution', 'content', 'execution', 'distribution', 'context'].includes(x));
  return {
    reading: {
      ...base, movement_evidence: ev, probable_causes: causes,
      signals: list(data.signals, 8).map((s: Row) => ({ type: str(s.type), excerpt: str(s.excerpt).slice(0, 160), reads_as: normAcj(s.reads_as) ?? 'genérico' })),
      summary: str(data.summary), limitations: str(data.limitations), model: model_used,
    },
    usage, model_used,
  };
}

Deno.serve(async (req: Request) => {
  const cors = preflight(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Use POST', 405);
  try {
    const userId = userIdFromAuth(req) ?? internalUserId(req);
    if (!userId) return errorResponse('Nao autenticado', 401);
    const rl = checkRateLimit(userId, 60_000, 30);
    if (!rl.ok) return errorResponse(`Rate limit. Tente em ${Math.ceil(rl.resetIn / 1000)}s`, 429);
    const input = (await req.json().catch(() => ({}))) as Row;
    const apiKey = await getUserGeminiKey(userId);
    if (!apiKey) return errorResponse('Chave Gemini nao configurada', 400);

    let out: { usage: { input?: number; output?: number }; model_used: string } & Row;
    switch (input.action) {
      case 'campaign_plan': out = await campaignPlan(apiKey, userId, input); break;
      case 'assign':
        if (!str(input.title)) return errorResponse('title obrigatório', 400);
        out = await assign(apiKey, userId, input); break;
      case 'validate': {
        const c = input.contract ?? {};
        if (!normAcj(c.acj_primary)) return errorResponse('Contrato sem ACJ primária', 400);
        const r = await validateMovement(apiKey, { ...c, acj_primary: normAcj(c.acj_primary)! }, input.body ?? {});
        out = { validation: r.validation, usage: r.usage, model_used: r.model }; break;
      }
      case 'read_signals':
        if (!input.post_id) return errorResponse('post_id obrigatório', 400);
        out = await readSignals(apiKey, userId, input); break;
      default: return errorResponse('Ação inválida', 400);
    }
    const { usage, model_used, ...rest } = out;
    if (model_used !== 'none') logUsage({ userId, provider: 'gemini', product: 'text', model: model_used, tokens_input: usage?.input, tokens_output: usage?.output, metadata: { fn: 'acj-orchestrator', action: input.action } });
    return jsonResponse({ success: true, ...rest });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    console.error('[acj-orchestrator]', e);
    return errorResponse(status === 404 ? (e as Error).message : 'Erro na orquestração ACJ', status, String(e));
  }
});

export {};
