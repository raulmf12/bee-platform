// Datas da estrutura de campanhas. Ciclos são SEMANAIS (seg–dom), D9.
import { addDays, format, parseISO, startOfWeek, differenceInCalendarDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export const toISODate = (d: Date): string => format(d, 'yyyy-MM-dd');

export function mondayOf(d: Date): Date {
  return startOfWeek(d, { weekStartsOn: 1 });
}

export interface CycleRange { idx: number; start_date: string; end_date: string }

// N ciclos semanais a partir da segunda-feira de `start`.
export function buildCycleRanges(start: Date, weeks: number): CycleRange[] {
  const monday = mondayOf(start);
  return Array.from({ length: weeks }, (_, i) => ({
    idx: i + 1,
    start_date: toISODate(addDays(monday, i * 7)),
    end_date: toISODate(addDays(monday, i * 7 + 6)),
  }));
}

// "Semana X de Y" (X limitado a [1, Y]; null se ainda não começou/terminou).
export function campaignWeek(startISO: string | null | undefined, weeks: number | null | undefined, today = new Date()):
  { current: number; total: number; state: 'upcoming' | 'running' | 'finished' } | null {
  if (!startISO || !weeks) return null;
  const diff = differenceInCalendarDays(today, parseISO(startISO));
  if (diff < 0) return { current: 0, total: weeks, state: 'upcoming' };
  const current = Math.floor(diff / 7) + 1;
  if (current > weeks) return { current: weeks, total: weeks, state: 'finished' };
  return { current, total: weeks, state: 'running' };
}

// "02–08 set" / "28 set – 04 out"
export function formatRange(startISO: string, endISO: string): string {
  const s = parseISO(startISO), e = parseISO(endISO);
  const sameMonth = s.getMonth() === e.getMonth();
  return sameMonth
    ? `${format(s, 'dd')}–${format(e, 'dd MMM', { locale: ptBR })}`
    : `${format(s, 'dd MMM', { locale: ptBR })} – ${format(e, 'dd MMM', { locale: ptBR })}`;
}

export function formatDay(iso: string): string {
  return format(parseISO(iso), "dd 'de' MMM", { locale: ptBR });
}
