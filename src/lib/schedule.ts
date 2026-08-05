// Distribuição automática da Agenda — funções PURAS e determinísticas (dado o
// `from`), pra serem fáceis de testar e não esconderem regra de negócio na UI.
//
// NADA aqui é fixo/imutável: os DEFAULTS abaixo são só o ponto de partida que o
// usuário sobrescreve em user_settings.distribution_prefs (diálogo de config da
// Agenda). Cor de editoria vem do banco; ritmo vem do frequency_hint da editoria.

import { differenceInCalendarDays, getDay, set, startOfDay } from 'date-fns';
import type { DistributionPrefs, Platform } from '@/types';

export type MergedPrefs = {
  platform_times: Partial<Record<Platform, string>>;
  default_time: string;
  skip_weekends: boolean;
  per_day_limit: number;
  start_offset_days: number;
};

// Defaults editáveis (seed do diálogo de config). Não são regra fixa: o que
// vale é o que estiver salvo em distribution_prefs.
export const DEFAULT_DISTRIBUTION: MergedPrefs = {
  platform_times: {
    linkedin: '10:00',
    instagram: '18:30',
    facebook: '12:00',
    tiktok: '19:00',
    youtube: '17:00',
  },
  default_time: '12:00',
  skip_weekends: true,
  per_day_limit: 1,
  start_offset_days: 1,
};

export function mergePrefs(prefs?: DistributionPrefs | null): MergedPrefs {
  return {
    platform_times: { ...DEFAULT_DISTRIBUTION.platform_times, ...(prefs?.platform_times ?? {}) },
    default_time: prefs?.default_time ?? DEFAULT_DISTRIBUTION.default_time,
    skip_weekends: prefs?.skip_weekends ?? DEFAULT_DISTRIBUTION.skip_weekends,
    per_day_limit: Math.max(1, prefs?.per_day_limit ?? DEFAULT_DISTRIBUTION.per_day_limit),
    start_offset_days: Math.max(0, prefs?.start_offset_days ?? DEFAULT_DISTRIBUTION.start_offset_days),
  };
}

// 'HH:mm' -> {h, m}. Tolerante a lixo (cai em 12:00).
export function parseTime(hhmm: string): { h: number; m: number } {
  const [h, m] = (hhmm ?? '').split(':').map((x) => parseInt(x, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return { h: 12, m: 0 };
  }
  return { h, m };
}

export function timeForPlatform(prefs: MergedPrefs, platform: Platform): string {
  return prefs.platform_times[platform] ?? prefs.default_time;
}

// Aplica o horário 'HH:mm' num dia (zera segundos/ms).
export function atTime(day: Date, hhmm: string): Date {
  const { h, m } = parseTime(hhmm);
  return set(startOfDay(day), { hours: h, minutes: m, seconds: 0, milliseconds: 0 });
}

// Ritmo mínimo (em dias) entre dois posts da MESMA editoria, lido do texto livre
// `frequency_hint`. Interpretação suave — não força nada, só espaça.
export function editorialGapDays(frequencyHint?: string | null): number {
  const h = (frequencyHint ?? '').toLowerCase();
  if (!h) return 2;
  if (/\bdi[aá]ri|todo dia|todos os dias|1x ?\/ ?dia\b/.test(h)) return 1;
  if (/quinzenal|a cada 15|de 15 em 15/.test(h)) return 14;
  if (/mensal|1x ?\/ ?m[eê]s|por m[eê]s/.test(h)) return 30;
  if (/semana/.test(h)) {
    // "3x por semana" -> ~2 dias; "2x" -> ~3; "1x/1-2" -> ~4
    if (/[3-9]x|3 ?a ?5|v[aá]rias/.test(h)) return 2;
    if (/2x|2 ?a ?3/.test(h)) return 3;
    return 4;
  }
  return 2;
}

export interface DistributionInput {
  // Posts em stand-by a agendar, JÁ na ordem de prioridade desejada (ex: melhor
  // nota primeiro). Cada um traz o mínimo necessário.
  standby: Array<{ id: string; platform: Platform; editorialSlug?: string }>;
  // Ritmo por editoria (derivado do frequency_hint via editorialGapDays).
  gapForEditorial: (slug?: string) => number;
  // Última data já agendada por editoria (posts que já estão no calendário) —
  // pra não empilhar a mesma editoria colada.
  lastByEditorial: Record<string, Date>;
  // Quantos posts JÁ existem agendados por dia (respeita o per_day_limit).
  countByDay: Record<string, number>;
  prefs: MergedPrefs;
  // "Hoje". A distribuição começa em from + start_offset_days.
  from: Date;
  horizonDays?: number;
}

export interface DistributionResult {
  postId: string;
  date: Date;
}

const dayKey = (d: Date): string => startOfDay(d).toISOString().slice(0, 10);

// Espalha os posts em stand-by pelos próximos dias respeitando:
// pular fim de semana, limite por dia e o ritmo (gap) de cada editoria.
export function distributeStandby(input: DistributionInput): DistributionResult[] {
  const { standby, gapForEditorial, prefs, from, horizonDays = 180 } = input;
  const result: DistributionResult[] = [];
  const queue = [...standby];
  const lastByEd: Record<string, Date> = { ...input.lastByEditorial };
  const perDay: Record<string, number> = { ...input.countByDay };

  const base = startOfDay(from);
  for (let offset = prefs.start_offset_days; offset <= prefs.start_offset_days + horizonDays; offset++) {
    if (queue.length === 0) break;
    const day = new Date(base);
    day.setDate(day.getDate() + offset);

    const dow = getDay(day); // 0=Dom, 6=Sáb
    if (prefs.skip_weekends && (dow === 0 || dow === 6)) continue;

    const key = dayKey(day);
    let assignedToday = perDay[key] ?? 0;

    while (assignedToday < prefs.per_day_limit && queue.length > 0) {
      // Primeiro post da fila cujo ritmo de editoria permite entrar HOJE.
      const idx = queue.findIndex((p) => {
        const slug = p.editorialSlug ?? '__none__';
        const last = lastByEd[slug];
        if (!last) return true;
        return differenceInCalendarDays(day, last) >= gapForEditorial(p.editorialSlug);
      });
      if (idx === -1) break; // nada elegível hoje; anda pro próximo dia

      const [post] = queue.splice(idx, 1);
      const time = timeForPlatform(prefs, post.platform);
      result.push({ postId: post.id, date: atTime(day, time) });
      lastByEd[post.editorialSlug ?? '__none__'] = day;
      assignedToday++;
    }
    perDay[key] = assignedToday;
  }

  return result;
}
