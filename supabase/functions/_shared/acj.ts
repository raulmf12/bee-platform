// ACJ nas edges: catálogo para prompts, contrato do conteúdo-mãe, portão de
// validação e contexto semântico para os motores visual/fotográfico.
// A Biblioteca vem de acj-library.ts (gerada dos .md em docs/acj).
// Regras (Adendo §11.1): ACJ como contexto ESTRUTURADO; só ACJ-01..05; nunca
// tratar ACJ como editoria, funil ou template; sem equivalência fixa com M/F;
// interromper (confiança baixa + decisão humana) quando faltar dado.
import { ACJ_IDS, ACJ_LIBRARY, ACJ_LIBRARY_VERSION, type AcjId } from './acj-library.ts';
import { callGeminiJson, fetchRest } from './gemini.ts';

export { ACJ_IDS, ACJ_LIBRARY_VERSION, type AcjId };
type Def = (typeof ACJ_LIBRARY)[number];
export const CONFIDENCE = ['very_low', 'low', 'medium', 'high', 'very_high'] as const;
export type Confidence = (typeof CONFIDENCE)[number];

export const acjDef = (id: string): Def | undefined => ACJ_LIBRARY.find((a) => a.id === id);
export const isAcj = (v: unknown): v is AcjId => typeof v === 'string' && (ACJ_IDS as string[]).includes(v);
export const normAcj = (v: unknown): AcjId | null => {
  const m = String(v ?? '').toUpperCase().match(/ACJ-?0?([1-5])/);
  return m ? (`ACJ-0${m[1]}` as AcjId) : null;
};
export const normConfidence = (v: unknown): Confidence => (CONFIDENCE as readonly string[]).includes(String(v)) ? v as Confidence : 'low';

// Mix inteiro que soma 100 (maior resto). Chaves fora de ACJ-01..05 são descartadas.
export function normMix(m: unknown): Record<AcjId, number> {
  const raw = (m && typeof m === 'object' ? m : {}) as Record<string, unknown>;
  const w = Object.fromEntries(ACJ_IDS.map((id) => [id, Math.max(0, Number(raw[id]) || 0)])) as Record<AcjId, number>;
  const sum = ACJ_IDS.reduce((a, id) => a + w[id], 0);
  if (sum <= 0) return { 'ACJ-01': 25, 'ACJ-02': 25, 'ACJ-03': 20, 'ACJ-04': 20, 'ACJ-05': 10 };
  const exact = ACJ_IDS.map((id) => (w[id] / sum) * 100);
  const out = Object.fromEntries(ACJ_IDS.map((id, i) => [id, Math.floor(exact[i])])) as Record<AcjId, number>;
  let rest = 100 - ACJ_IDS.reduce((a, id) => a + out[id], 0);
  ACJ_IDS.map((id, i) => [exact[i] - Math.floor(exact[i]), id] as const).sort((a, b) => b[0] - a[0])
    .forEach(([, id]) => { if (rest > 0) { out[id]++; rest--; } });
  return out;
}

// Catálogo curto das 5 (seleção: plano, pauta, atribuição).
export function acjCatalog(): string {
  return ACJ_LIBRARY.map((a) => [
    `${a.id} ${a.name} — "${a.short}" ${a.purpose}`,
    `  de: ${a.state_from} → para: ${a.state_to}`,
    `  mecanismo: ${a.mechanism}`,
    `  indicada quando: ${a.indications.slice(0, 4).join('; ')}`,
    `  NÃO usar como primária quando: ${a.contraindications.slice(0, 3).join('; ')}`,
    `  caminhos editoriais compatíveis (sugestão, não regra): ${a.paths.join(', ')}`,
  ].join('\n')).join('\n');
}

// Ficha completa de UMA arquitetura (contrato e portão).
export function acjBrief(id: string): string {
  const a = acjDef(id);
  if (!a) return '';
  return [
    `${a.id} ${a.name} (v${a.version}, em validação) — ${a.central_phrase}`,
    `Definição: ${a.definition}`,
    `Mecanismo: origem "${a.mechanism_steps.origin}" · operação "${a.mechanism_steps.operation}" · experiência "${a.mechanism_steps.experience}" · deslocamento "${a.mechanism_steps.shift}"`,
    `Sinais iniciais: ${a.mechanism_steps.early_signals}`,
    `${a.name} NÃO é: ${a.is_not.join('; ')}`,
    `Fronteiras: ${a.boundaries.map((b) => `${b.acj}: ${b.difference}`).join(' | ')}`,
    `Falhas/simulações: ${a.failure_modes.map((f) => `${f.deviation} (${f.class}) — ${f.alert}`).join(' | ')}`,
    `Riscos de integridade: ${a.integrity_risks.join('; ')}`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Contrato ACJ do conteúdo-mãe (Template Operacional §7 / Adendo §11.4)
// ---------------------------------------------------------------------------
export interface AcjContract {
  acj_primary: AcjId; acj_secondary: AcjId | null; attribution_confidence: Confidence; rationale: string;
  alternative_considered: string | null; alternative_reason: string | null;
  audience_state_from: string; journey_need: string; movement_to: string; connection_mechanism: string;
  authorial_gesture: string; expected_experience: string; expected_response: string[]; failure_modes: string[];
  expression_context: { tone?: string; formats?: string; visual?: string; cta?: string };
  not_to_do: string; source_acj_version: string; assigned_late: boolean; human_decision_required: boolean;
}

export interface IdeaForAcj {
  title: string; summary?: string | null; strategic_function?: string | null; editorial_slug?: string | null;
  acj_primary?: string | null; acj_secondary?: string | null; acj_role?: string | null; acj_rationale?: string | null;
}

export async function buildContract(apiKey: string, idea: IdeaForAcj, ctx: { cycleNeed?: string; campaign?: string }): Promise<{ contract: AcjContract; usage: { input?: number; output?: number }; model: string }> {
  const fixed = normAcj(idea.acj_primary);
  const assignedLate = !fixed;
  const sys = [
    'Você é a ACJ-00 da Hive (Bee Consulting / Marcos Piccini): define o CONTRATO RELACIONAL de um conteúdo-mãe ANTES da redação.',
    'ACJ = movimento relacional que o conteúdo deve produzir na pessoa. Não é editoria, função estratégica, funil ou template.',
    'Regras: uma ACJ primária obrigatória; no máximo uma secundária, só se acrescentar função distinta e não concorrente; nunca ACJ-00.',
    'O mecanismo não pode depender só de linguagem declarativa ("você vai se identificar"). Nada de fabricar casos, clientes ou resultados.',
    'Se a ideia não realiza naturalmente o movimento, diga em rationale e marque human_decision_required=true (não force).',
    'Português do Brasil. Devolva JSON puro.',
  ].join('\n');
  const usr = [
    `IDEIA-MÃE: ${idea.title}`,
    idea.summary ? `Direção: ${idea.summary}` : '',
    idea.strategic_function ? `Função estratégica (outro eixo, não confundir com ACJ): ${idea.strategic_function}` : '',
    idea.editorial_slug ? `Editorial: ${idea.editorial_slug}` : '',
    ctx.campaign ? `CAMPANHA: ${ctx.campaign}` : '',
    ctx.cycleNeed ? `NECESSIDADE RELACIONAL DO CICLO: ${ctx.cycleNeed}` : '',
    fixed ? `ACJ PRIMÁRIA JÁ DEFINIDA NA PAUTA (mantenha): ${fixed}${idea.acj_secondary ? ` · secundária: ${idea.acj_secondary}` : ''}${idea.acj_role ? ` · papel: ${idea.acj_role}` : ''}` : 'A ideia ainda não tem ACJ: escolha a primária que a ideia realiza NATURALMENTE.',
    '',
    fixed ? `FICHA DA ACJ PRIMÁRIA:\n${acjBrief(fixed)}` : `CATÁLOGO ACJ:\n${acjCatalog()}`,
    '',
    'JSON:',
    '{ "acj_primary": "ACJ-0X", "acj_secondary": null, "attribution_confidence": "very_low|low|medium|high|very_high", "rationale": "<por que a ideia realiza naturalmente esta ACJ>", "alternative_considered": null, "alternative_reason": null,',
    '  "audience_state_from": "<de que estado relacional a pessoa parte>", "journey_need": "<de que movimento ela precisa agora>", "movement_to": "<deslocamento que o conteúdo favorece>",',
    '  "connection_mechanism": "<mecanismo específico>", "authorial_gesture": "<gesto do Marcos: nomeia, espelha, acolhe, convida, sustenta…>", "expected_experience": "<o que a pessoa deve poder perceber/sentir/experimentar>",',
    '  "expected_response": ["<sinal observável coerente, sem promessa causal>"], "failure_modes": ["<principal modo de falha>"],',
    '  "expression_context": { "tone": "", "formats": "", "visual": "<o que a imagem deve evitar/favorecer, sem citar template>", "cta": "<convite compatível>" },',
    '  "not_to_do": "<o que este conteúdo não deve tentar fazer>", "human_decision_required": false }',
  ].filter((l) => l !== '').join('\n');
  const { data, usage, model_used } = await callGeminiJson<Record<string, unknown>>(apiKey, sys, usr, { temperature: 0.3, maxOutputTokens: 1800 });
  const primary = fixed ?? normAcj(data.acj_primary) ?? 'ACJ-01';
  const secRaw = fixed && idea.acj_secondary !== undefined ? normAcj(idea.acj_secondary) : normAcj(data.acj_secondary);
  const str = (v: unknown, fb = '') => (typeof v === 'string' && v.trim() ? v.trim() : fb);
  const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, 5) : []);
  const def = acjDef(primary)!;
  const ec = (data.expression_context ?? {}) as Record<string, unknown>;
  return {
    usage, model: model_used,
    contract: {
      acj_primary: primary,
      acj_secondary: secRaw && secRaw !== primary ? secRaw : null,
      attribution_confidence: normConfidence(data.attribution_confidence),
      rationale: str(data.rationale, idea.acj_rationale ?? ''),
      alternative_considered: normAcj(data.alternative_considered) ?? null,
      alternative_reason: str(data.alternative_reason) || null,
      audience_state_from: str(data.audience_state_from, def.state_from),
      journey_need: str(data.journey_need, def.purpose),
      movement_to: str(data.movement_to, def.state_to),
      connection_mechanism: str(data.connection_mechanism, def.mechanism),
      authorial_gesture: str(data.authorial_gesture),
      expected_experience: str(data.expected_experience, def.effect),
      expected_response: list(data.expected_response),
      failure_modes: list(data.failure_modes),
      expression_context: { tone: str(ec.tone), formats: str(ec.formats), visual: str(ec.visual), cta: str(ec.cta) },
      not_to_do: str(data.not_to_do),
      source_acj_version: `${primary}@${def.version}`,
      assigned_late: assignedLate,
      human_decision_required: data.human_decision_required === true,
    },
  };
}

// Bloco de contexto que a geração de texto recebe (o contrato orienta a escrita).
export function contractPromptBlock(c: Pick<AcjContract, 'acj_primary' | 'acj_secondary' | 'audience_state_from' | 'movement_to' | 'connection_mechanism' | 'authorial_gesture' | 'expected_experience' | 'failure_modes' | 'not_to_do' | 'expression_context'>): string {
  const a = acjDef(c.acj_primary);
  return [
    `MOVIMENTO RELACIONAL (ACJ) deste conteúdo — orienta a escrita, não aparece no texto: ${c.acj_primary} ${a?.name ?? ''} ("${a?.short ?? ''}")${c.acj_secondary ? ` · secundária ${c.acj_secondary} ${acjDef(c.acj_secondary)?.name ?? ''}` : ''}.`,
    `A pessoa parte de: ${c.audience_state_from}. O texto deve favorecer: ${c.movement_to}.`,
    `Mecanismo: ${c.connection_mechanism}.${c.authorial_gesture ? ` Gesto do autor: ${c.authorial_gesture}.` : ''}`,
    c.expected_experience ? `Experiência a favorecer: ${c.expected_experience}.` : '',
    `${a?.name ?? 'Esta ACJ'} NÃO é: ${(a?.is_not ?? []).slice(0, 5).join('; ')}.`,
    c.failure_modes?.length ? `Evite: ${c.failure_modes.join('; ')}.` : '',
    c.not_to_do ? `Não tente: ${c.not_to_do}.` : '',
    c.expression_context?.cta ? `Convite compatível: ${c.expression_context.cta}.` : '',
    'Nunca escreva o nome da ACJ, nem frases declarativas do tipo "você vai se identificar". O movimento acontece pela forma, não pelo anúncio.',
  ].filter(Boolean).join('\n');
}

// ---------------------------------------------------------------------------
// Portão G3/G4: o conteúdo realizou o movimento? (avisa; não reescreve)
// ---------------------------------------------------------------------------
export interface AcjValidation {
  realized: 'yes' | 'partial' | 'no'; score: number; issues: string[]; main_risk: string;
  boundary_conflict: AcjId | null; suggestion: string; checked_at: string;
}

export async function validateMovement(apiKey: string, c: Pick<AcjContract, 'acj_primary' | 'acj_secondary' | 'audience_state_from' | 'movement_to' | 'connection_mechanism'>, body: { frase?: string; texto?: string }): Promise<{ validation: AcjValidation; usage: { input?: number; output?: number }; model: string }> {
  const sys = [
    'Você é o portão ACJ da Hive. Avalia SE um conteúdo realiza o movimento relacional do seu contrato — não avalia estilo nem qualidade geral.',
    'Seja rigoroso com simulação: linguagem declarativa, choque sem distinção, rótulo genérico (efeito Barnum), vulnerabilidade performática, convite sem experiência real.',
    'Não reescreva o conteúdo. Devolva JSON puro.',
  ].join('\n');
  const usr = [
    `CONTRATO: ${c.acj_primary}${c.acj_secondary ? ` (+${c.acj_secondary})` : ''} · de "${c.audience_state_from}" → para "${c.movement_to}" · mecanismo "${c.connection_mechanism}"`,
    '', `FICHA:\n${acjBrief(c.acj_primary)}`, '',
    `CONTEÚDO:\nFrase: ${body.frase ?? ''}\nTexto:\n${(body.texto ?? '').slice(0, 4000)}`, '',
    '{ "realized": "yes|partial|no", "score": 0-100, "issues": ["<falha concreta, citando o trecho>"], "main_risk": "<principal risco>", "boundary_conflict": null|"ACJ-0X (se o texto produz outro movimento)", "suggestion": "<ajuste curto que preservaria o movimento, sem reescrever>" }',
  ].join('\n');
  const { data, usage, model_used } = await callGeminiJson<Record<string, unknown>>(apiKey, sys, usr, { temperature: 0.2, maxOutputTokens: 900 });
  const realized = ['yes', 'partial', 'no'].includes(String(data.realized)) ? data.realized as 'yes' | 'partial' | 'no' : 'partial';
  const conflict = normAcj(data.boundary_conflict);
  return {
    usage, model: model_used,
    validation: {
      realized, score: Math.max(0, Math.min(100, Math.round(Number(data.score) || 0))),
      issues: Array.isArray(data.issues) ? data.issues.map(String).filter(Boolean).slice(0, 4) : [],
      main_risk: String(data.main_risk ?? '').trim(),
      boundary_conflict: conflict && conflict !== c.acj_primary && conflict !== c.acj_secondary ? conflict : null,
      suggestion: String(data.suggestion ?? '').trim(),
      checked_at: new Date().toISOString(),
    },
  };
}

// ---------------------------------------------------------------------------
// Contexto semântico para M01–M04 / F01–F04 (compatibilidade, não equivalência)
// ---------------------------------------------------------------------------
export interface AcjSnapshot { acj_primary?: string; acj_secondary?: string | null; movement_to?: string; connection_mechanism?: string; audience_state_from?: string }

export async function loadPostAcj(postId: string | undefined | null, userId: string): Promise<AcjSnapshot | null> {
  if (!postId) return null;
  const [p] = await fetchRest<Array<{ acj_snapshot: AcjSnapshot | null }>>(`/user_posts?id=eq.${postId}&user_id=eq.${userId}&select=acj_snapshot&limit=1`).catch(() => []);
  return p?.acj_snapshot?.acj_primary ? p.acj_snapshot : null;
}

export function acjVisualContext(s: AcjSnapshot | null): string {
  if (!s?.acj_primary) return '';
  const a = acjDef(s.acj_primary);
  return [
    `CONTEXTO RELACIONAL (ACJ) — mais uma dimensão de leitura, NUNCA determina sozinha a escolha (não existe "ACJ X = template/estilo Y"): ${s.acj_primary} ${a?.name ?? ''} — ${a?.short ?? ''}`,
    s.movement_to ? `Deslocamento pretendido: ${s.movement_to}.` : '',
    s.connection_mechanism ? `Mecanismo: ${s.connection_mechanism}.` : '',
    'A imagem pode reforçar o movimento, mas não simulá-lo nem fabricar clientes, eventos, relações ou resultados.',
  ].filter(Boolean).join('\n');
}
