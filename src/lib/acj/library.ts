// Biblioteca ACJ no app: rótulos, cores e vocabulário (gerado de docs/acj).
// Sempre exibir com o prefixo "ACJ-0X" — evita confusão com M01–M04 e F01–F04.
import { ACJ_LIBRARY_FRONT } from './library.generated';
import { ACJ_IDS, type AcjConfidence, type AcjId, type AcjLearningStatus, type AcjMix, type AcjPlanStatus } from '@/types';

export type AcjMeta = (typeof ACJ_LIBRARY_FRONT)[number];
export const ACJ_META = Object.fromEntries(ACJ_LIBRARY_FRONT.map((a) => [a.id, a])) as Record<AcjId, AcjMeta>;
export const ACJ_LIBRARY_VERSION = ACJ_LIBRARY_FRONT.map((a) => `${a.id}@${a.version}`).join(',');

export const isAcj = (v: unknown): v is AcjId => typeof v === 'string' && (ACJ_IDS as string[]).includes(v);
export const acjName = (id?: string | null) => (isAcj(id) ? ACJ_META[id].name : '');
export const acjLabel = (id?: string | null) => (isAcj(id) ? `${id} ${ACJ_META[id].name}` : 'Sem ACJ');
export const acjColor = (id?: string | null) => (isAcj(id) ? ACJ_META[id].color : '#94A3B8');

export const emptyMix = (): AcjMix => ({ 'ACJ-01': 0, 'ACJ-02': 0, 'ACJ-03': 0, 'ACJ-04': 0, 'ACJ-05': 0 });

// Mix inteiro que soma 100 (maior resto).
export function normalizeAcjMix(m: Partial<Record<string, number>> | null | undefined): AcjMix {
  const w = ACJ_IDS.map((id) => Math.max(0, Number(m?.[id]) || 0));
  const sum = w.reduce((a, b) => a + b, 0);
  if (sum <= 0) return { 'ACJ-01': 20, 'ACJ-02': 20, 'ACJ-03': 20, 'ACJ-04': 20, 'ACJ-05': 20 };
  const exact = w.map((x) => (x / sum) * 100);
  const out = exact.map(Math.floor);
  let rest = 100 - out.reduce((a, b) => a + b, 0);
  exact.map((x, i) => [x - Math.floor(x), i] as const).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (rest > 0) { out[i]++; rest--; } });
  return Object.fromEntries(ACJ_IDS.map((id, i) => [id, out[i]])) as AcjMix;
}

export const PLAN_STATUS_LABELS: Record<AcjPlanStatus, string> = {
  draft: 'Rascunho', recommended: 'Aguardando aprovação', approved: 'Aprovado', active: 'Em execução',
  recalibration_needed: 'Precisa recalibrar', completed: 'Concluído', archived: 'Versão anterior',
};
export const CONFIDENCE_LABELS: Record<AcjConfidence, string> = {
  very_low: 'Muito baixa', low: 'Baixa', medium: 'Média', high: 'Alta', very_high: 'Muito alta',
};
export const LEARNING_STATUS_LABELS: Record<AcjLearningStatus, string> = {
  open: 'Observação aberta', hypothesis: 'Hipótese formulada', testing: 'Em teste', provisional: 'Aprendizagem provisória',
  validated: 'Validada', consolidated: 'Consolidada', rejected: 'Rejeitada', inconclusive: 'Inconclusiva', suspended: 'Suspensa',
};
// Registro Vivo §5.1 — o banco também recusa transições fora desta tabela.
export const LEARNING_TRANSITIONS: Record<AcjLearningStatus, AcjLearningStatus[]> = {
  open: ['hypothesis', 'inconclusive'],
  hypothesis: ['testing', 'suspended', 'rejected', 'inconclusive'],
  testing: ['provisional', 'rejected', 'inconclusive', 'suspended'],
  provisional: ['testing', 'validated', 'rejected', 'inconclusive'],
  validated: ['consolidated'],
  suspended: ['hypothesis', 'testing'],
  consolidated: [], rejected: ['open', 'hypothesis'], inconclusive: ['open', 'hypothesis'],
};
export const CHANGE_CLASS_LABELS = {
  no_change: 'Sem mudança', execution_adjustment: 'Ajuste de execução', architecture_adjustment: 'Ajuste de arquitetura',
  new_variant: 'Nova variante', possible_new_architecture: 'Possível nova arquitetura',
} as const;
export const CAUSE_LABELS = {
  attribution: 'Atribuição', content: 'Conteúdo', execution: 'Execução', distribution: 'Distribuição', context: 'Contexto',
} as const;
export const EVIDENCE_LABELS = {
  strong: 'Sinal forte do movimento', partial: 'Sinal parcial', absent: 'Sem sinal do movimento', insufficient: 'Dados insuficientes',
} as const;
export const REALIZED_LABELS = { yes: 'Movimento realizado', partial: 'Movimento parcial', no: 'Movimento não realizado' } as const;
