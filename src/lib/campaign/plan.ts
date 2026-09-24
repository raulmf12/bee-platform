// Planejamento do ciclo (determinístico — D15). A partir da estratégia (mix +
// intensidade da fase da semana) e da cadência de cada conta, decide:
//   - quantos conteúdos-mãe e peças o ciclo precisa;
//   - quantos conteúdos por função estratégica ("Necessidades deste ciclo");
//   - quantas peças por conta ("Contas e canais");
//   - em que dias cada conta publica ("Frequência sugerida").
// Sem IA: previsível, explicável e barato. A IA entra depois, na pauta.
import { addDays, parseISO } from 'date-fns';
import { PLATFORM_GUIDE } from '@/lib/schedule';
import { toISODate } from './dates';
import { blocksForWeeks } from './strategy';
import {
  FUNCTION_SHORT, STRATEGIC_FUNCTIONS,
  type Campaign, type CampaignCycle, type CyclePlan, type CyclePlanDay, type IntensityLevel,
  type SocialAccount, type StrategicFunction,
} from '@/types';

// Peso da intensidade da fase sobre o mix: forte o bastante pra matriz mudar
// de fato o ciclo (ex.: autoridade "Alto" no fim da campanha ganha espaço).
const LEVEL_WEIGHT: Record<IntensityLevel, number> = { muito_baixo: 0.2, baixo: 0.5, medio: 1, alto: 1.8 };

// Intensidade de cada função na semana do ciclo (bloco da matriz que contém o ciclo).
export function levelsForCycle(campaign: Campaign, cycleIdx: number): Partial<Record<StrategicFunction, IntensityLevel>> {
  const matrix = campaign.strategy?.matrix ?? [];
  if (!matrix.length) return {};
  const blocks = blocksForWeeks(campaign.duration_weeks ?? matrix.length);
  const i = blocks.findIndex(([a, b]) => cycleIdx >= a && cycleIdx <= b);
  return matrix[Math.max(0, Math.min(matrix.length - 1, i))]?.levels ?? {};
}

// Distribui `total` entre chaves por peso (maior resto), inteiros ≥ 0.
export function apportion<K extends string>(weights: Record<K, number>, total: number): Record<K, number> {
  const keys = Object.keys(weights) as K[];
  const sum = keys.reduce((a, k) => a + Math.max(0, weights[k]), 0);
  const out = Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
  if (sum <= 0 || total <= 0) return out;
  const exact = keys.map((k) => (Math.max(0, weights[k]) / sum) * total);
  keys.forEach((k, i) => { out[k] = Math.floor(exact[i]); });
  let rest = total - keys.reduce((a, k) => a + out[k], 0);
  const order = keys.map((k, i) => [exact[i] - Math.floor(exact[i]), k] as const).sort((a, b) => b[0] - a[0]);
  for (const [, k] of order) { if (rest <= 0) break; out[k]++; rest--; }
  return out;
}

// Nº de conteúdos-mãe: a conta mais ativa define o piso; cada conteúdo rende em
// média ~1,6 peças (a maioria vira LinkedIn + Instagram). 3+3+1 peças → 5 conteúdos.
export function contentsFor(pieces: number, maxPerAccount: number): number {
  if (pieces <= 0) return 0;
  return Math.min(pieces, Math.max(maxPerAccount, Math.ceil(pieces / 1.6)));
}

// Dias da semana (0=dom…6=sáb) em que uma conta publica, espaçados entre os
// recomendados da plataforma (e completando com os demais dias úteis/fim de semana).
export function publishingDays(platform: 'linkedin' | 'instagram', perWeek: number): number[] {
  if (perWeek <= 0) return [];
  const guide = PLATFORM_GUIDE[platform];
  const order = [1, 2, 3, 4, 5, 6, 0];
  const rec = order.filter((d) => guide?.weekdays.find((w) => w.dow === d)?.recommended);
  const pool = [...rec, ...order.filter((d) => !rec.includes(d))];
  if (perWeek >= 7) return order;
  if (perWeek <= rec.length) {
    // espalha dentro dos recomendados (ex.: 2 de [ter,qua,qui] → ter, qui)
    if (perWeek === 1) return [rec[Math.floor((rec.length - 1) / 2)]];
    const step = (rec.length - 1) / (perWeek - 1);
    return Array.from({ length: perWeek }, (_, i) => rec[Math.round(i * step)]);
  }
  return pool.slice(0, perWeek).sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

export function buildCyclePlan(campaign: Campaign, cycle: CampaignCycle, accounts: SocialAccount[]): CyclePlan {
  const campaignAccounts = accounts.filter((a) => campaign.account_ids.includes(a.id));
  const channels = campaignAccounts
    .map((a) => ({ account_id: a.id, platform: a.platform, label: a.label, contents: Math.max(0, Number(campaign.cadence?.[a.id] ?? 0)) }))
    .filter((c) => c.contents > 0);
  const pieces = channels.reduce((a, c) => a + c.contents, 0);
  const contents = contentsFor(pieces, Math.max(0, ...channels.map((c) => c.contents)));

  const mix = campaign.strategy?.mix;
  const levels = levelsForCycle(campaign, cycle.idx);
  const weights = Object.fromEntries(STRATEGIC_FUNCTIONS.map((f) => [
    f, (mix?.[f] ?? 20) * LEVEL_WEIGHT[levels[f] ?? 'medio'],
  ])) as Record<StrategicFunction, number>;
  const byFn = apportion(weights, contents);
  const needs = STRATEGIC_FUNCTIONS.filter((f) => byFn[f] > 0)
    .map((f) => ({ function: f, count: byFn[f] }))
    .sort((a, b) => b.count - a.count || STRATEGIC_FUNCTIONS.indexOf(a.function) - STRATEGIC_FUNCTIONS.indexOf(b.function));

  const start = parseISO(cycle.start_date);
  const calendar: CyclePlanDay[] = Array.from({ length: 7 }, (_, i) => ({ date: toISODate(addDays(start, i)), slots: [] }));
  for (const ch of channels) {
    for (const dow of publishingDays(ch.platform, ch.contents)) {
      const day = calendar.find((d) => parseISO(d.date).getDay() === dow);
      day?.slots.push({ account_id: ch.account_id, platform: ch.platform });
    }
  }

  const top = needs.slice(0, 2).map((n) => FUNCTION_SHORT[n.function].toLowerCase());
  const rest = needs.slice(2).map((n) => FUNCTION_SHORT[n.function].toLowerCase());
  const summary = needs.length
    ? `Seu ciclo ideal deve priorizar ${top.join(' e ')}${rest.length ? `, com um toque de ${rest.join(', ')}` : ''}, considerando sua frequência e as contas escolhidas.`
    : 'Defina a cadência das contas desta campanha para planejar o ciclo.';

  return { needs, channels, calendar, totals: { contents, pieces }, summary };
}
