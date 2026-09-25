import { test, expect } from '@playwright/test';
import { labelFor, scheduleQueue, suggestionsFor } from '../src/lib/campaign/priority';
import type { Campaign, CampaignCycle, UserPost } from '../src/types';

const post = (id: string, o: Partial<UserPost>): UserPost => ({ id, platform: 'linkedin', status: 'approved', created_at: `2026-09-2${id.length}T10:00:00Z`, metadata: {}, is_favorite: false, format: 'image', user_id: 'u', updated_at: '', ...o } as UserPost);

test.describe('unit · fila de agendamento', () => {
  const camp = { id: 'c1', type: 'organica' } as Campaign;
  const cycle = {
    id: 'cy1', campaign_id: 'c1', idx: 1, start_date: '2026-09-28', end_date: '2026-10-04', status: 'ready',
    plan: { needs: [], channels: [], totals: { contents: 0, pieces: 0 }, calendar: [
      { date: '2026-09-29', slots: [{ account_id: 'li', platform: 'linkedin' }] },
      { date: '2026-10-01', slots: [{ account_id: 'li', platform: 'linkedin' }] },
    ] },
  } as unknown as CampaignCycle;

  test('rótulos como na Tela 13 (1 Alta, meio Média, última Menor)', () => {
    expect([1, 2, 3, 4].map((i) => labelFor(i, 4))).toEqual(['Alta', 'Média', 'Média', 'Menor']);
    expect([1, 2].map((i) => labelFor(i, 2))).toEqual(['Alta', 'Média']);
    expect(labelFor(1, 1)).toBe('Alta');
  });

  test('validação antes do desdobramento; janelas nos dias da conta, sem colidir', () => {
    const q = [
      post('unfold1', { campaign_id: 'c1', cycle_id: 'cy1', account_id: 'li', piece_role: 'unfold' }),
      post('val', { campaign_id: 'c1', cycle_id: 'cy1', account_id: 'li', piece_role: 'validation' }),
    ];
    const info = scheduleQueue(q, { campaigns: [camp], cycles: [cycle], scheduled: [], today: new Date('2026-09-25T12:00:00') });
    expect(info.get('val')).toMatchObject({ rank: 1, label: 'Alta', windowStart: '2026-09-29', windowEnd: '2026-10-01' });
    expect(info.get('unfold1')).toMatchObject({ rank: 2, windowStart: '2026-10-01' });
  });

  test('dia já ocupado pela mesma conta é pulado', () => {
    const q = [post('val', { campaign_id: 'c1', cycle_id: 'cy1', account_id: 'li', piece_role: 'validation' })];
    const busy = [post('x', { account_id: 'li', status: 'scheduled', scheduled_date: '2026-09-29T12:00:00Z' })];
    const info = scheduleQueue(q, { campaigns: [camp], cycles: [cycle], scheduled: busy, today: new Date('2026-09-25T12:00:00') });
    expect(info.get('val')?.windowStart).toBe('2026-10-01');
  });

  test('sem campanha: próximos dias a partir de amanhã', () => {
    const info = scheduleQueue([post('solo', {})], { campaigns: [], cycles: [], scheduled: [], today: new Date('2026-09-25T12:00:00') });
    expect(info.get('solo')?.windowStart).toBe('2026-09-26');
  });

  test('sugestões: fora do ciclo e horário longe do recomendado', () => {
    const p = post('s', { platform: 'linkedin', cycle_id: 'cy1', scheduled_date: new Date('2099-10-10T20:00:00').toISOString() });
    const futureCycle = { ...cycle, start_date: '2099-09-28', end_date: '2099-10-04' } as CampaignCycle;
    const s = suggestionsFor(p, futureCycle);
    expect(s.map((x) => x.id)).toEqual(['window', 'time']);
    const ok = suggestionsFor({ ...p, scheduled_date: new Date('2099-09-29T08:00:00').toISOString() }, futureCycle, { time: '08:00', reason: 'x' });
    expect(ok).toHaveLength(0);
  });
});
