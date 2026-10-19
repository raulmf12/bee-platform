// MEDIÇÃO DA IA RECUPERÁVEL (Estabilização · doc 02 §12): a aprovação editorial é gravada
// primeiro; medir quanto o humano mexeu (ai_reviews) acontece depois e, se falhar, fica
// PENDENTE com chave única (sem duplicar evento) para ser reprocessada — nunca transforma
// uma aprovação já salva em erro nem some num console.error.
import { aiApi } from './api';
import { db } from './db';
import { sha256Hex } from './approval';
import type { AiVariation } from '@/types';

type ReviewInput = Parameters<typeof aiApi.recordReview>[0];
interface EventRow { id: string; status: string; attempts: number; payload: ReviewInput }

export async function recordReviewSafely(userId: string, input: ReviewInput): Promise<{ state: 'done' | 'pending' | 'skipped'; review?: Awaited<ReturnType<typeof aiApi.recordReview>> }> {
  const key = `review:${await sha256Hex(`${input.quote_final}\u0000${input.caption_final}`)}`;
  const prev = await db.selectOne<EventRow>('ai_measurement_events', { post_id: `eq.${input.post_id}`, event_key: `eq.${key}`, select: 'id,status,attempts,payload' }).catch(() => null);
  if (prev?.status === 'done') return { state: 'skipped' };             // mesma aprovação de novo: não conta duas vezes
  try {
    const review = await aiApi.recordReview(input);
    await db.upsert('ai_measurement_events', { user_id: userId, post_id: input.post_id, event_key: key, payload: input, status: 'done', attempts: (prev?.attempts ?? 0) + 1, error: null }, 'post_id,event_key');
    return { state: 'done', review };
  } catch (e) {
    console.warn('[medição] pendente para reprocessar', e);
    await db.upsert('ai_measurement_events', { user_id: userId, post_id: input.post_id, event_key: key, payload: input, status: 'pending', attempts: (prev?.attempts ?? 0) + 1, error: String((e as Error).message ?? e).slice(0, 400) }, 'post_id,event_key').catch(() => {});
    return { state: 'pending' };
  }
}

// Reprocessa as medições pendentes do usuário (chamado ao abrir o Início; barato quando não há nada).
export async function retryPendingMeasurements(userId: string): Promise<number> {
  const rows = await db.select<EventRow & { post_id: string }>('ai_measurement_events', { user_id: `eq.${userId}`, status: 'eq.pending', attempts: 'lt.6', select: 'id,post_id,status,attempts,payload', limit: '10' }).catch(() => []);
  let ok = 0;
  for (const r of rows) {
    try {
      await aiApi.recordReview({ ...r.payload, variation: r.payload.variation as AiVariation });
      await db.update('ai_measurement_events', { id: `eq.${r.id}` }, { status: 'done', attempts: r.attempts + 1, error: null });
      ok++;
    } catch (e) {
      await db.update('ai_measurement_events', { id: `eq.${r.id}` }, { attempts: r.attempts + 1, error: String((e as Error).message ?? e).slice(0, 400), status: r.attempts + 1 >= 6 ? 'failed' : 'pending' }).catch(() => {});
    }
  }
  return ok;
}
