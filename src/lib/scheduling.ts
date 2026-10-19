// AGENDAMENTO — um comando para todas as telas (Estabilização · doc 02 §9, 03 §8–§11).
// Agenda (arraste, painel, sugestão, lote), editor, wizard e produção chamam só isto; o
// servidor (schedule-piece) confere prontidão, fecha o pacote imutável e grava de forma
// atômica. Cada pedido tem um command_id: repetir o MESMO pedido (retentativa, clique duplo)
// devolve o resultado já gravado; um timeout NÃO vira "falhou" — conferimos pelo comando.
import { SUPABASE_KEY, SUPABASE_URL, supabase } from './supabase';
import { db } from './db';

export type ScheduleIntent = 'schedule' | 'reschedule' | 'unschedule' | 'replace_package';
export interface ScheduleResult {
  intent: ScheduleIntent; post_id: string; status: string; scheduled_date: string | null;
  scheduled_package_id: string | null; scheduled_version: number | null; version: number; replayed?: boolean;
}
export class ScheduleError extends Error {
  constructor(message: string, readonly code: string | null = null, readonly commandId?: string, readonly missing?: Array<{ component: string; reason: string }>) { super(message); }
  get unconfirmed() { return this.code === 'UNCONFIRMED'; }
}

const TIMEOUT_MS = 45_000;

async function lookup(commandId: string): Promise<ScheduleResult | null> {
  const row = await db.selectOne<{ result: ScheduleResult }>('schedule_commands', { command_id: `eq.${commandId}`, select: 'result' }).catch(() => null);
  return row?.result ?? null;
}

export async function runScheduleCommand(input: {
  postId: string; intent: ScheduleIntent; when?: string | null; commandId?: string; expectedVersion?: number | null; planId?: string | null;
}): Promise<ScheduleResult> {
  const commandId = input.commandId ?? crypto.randomUUID();
  const { data } = await supabase.auth.getSession();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/schedule-piece`, {
      method: 'POST', signal: ctrl.signal,
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${data.session?.access_token ?? SUPABASE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ command_id: commandId, post_id: input.postId, intent: input.intent, when: input.when ?? null, expected_version: input.expectedVersion ?? null, plan_id: input.planId ?? null }),
    });
  } catch {
    // Sem resposta: pode ter gravado. Confere pelo comando antes de dizer qualquer coisa (02 §9.4).
    for (const wait of [800, 2000, 4000]) {
      await new Promise((r) => setTimeout(r, wait));
      const found = await lookup(commandId);
      if (found) return found;
    }
    throw new ScheduleError('Agendamento ainda não confirmado — confira em instantes (o mesmo pedido pode ser repetido com segurança).', 'UNCONFIRMED', commandId);
  } finally {
    clearTimeout(timer);
  }
  const body = await res.json().catch(() => ({})) as { success?: boolean; result?: ScheduleResult; error?: string; code?: string; missing?: Array<{ component: string; reason: string }> };
  if (!res.ok || !body.success || !body.result) throw new ScheduleError(body.error || `Não foi possível agendar (HTTP ${res.status}).`, body.code ?? null, commandId, body.missing);
  return body.result;
}

// Agendar ou reagendar conforme o estado: peça já agendada só muda a data (o pacote programado continua).
export const scheduleAt = (post: { id: string; status: string; version?: number | null }, whenIso: string, opts: { commandId?: string; planId?: string | null } = {}) =>
  runScheduleCommand({ postId: post.id, intent: post.status === 'scheduled' ? 'reschedule' : 'schedule', when: whenIso, expectedVersion: post.version ?? null, ...opts });

export const unschedule = (postId: string) => runScheduleCommand({ postId, intent: 'unschedule' });
