import { test, expect } from '@playwright/test';
import { apportion, buildCyclePlan, contentsFor, publishingDays } from '../src/lib/campaign/plan';
import type { Campaign, CampaignCycle, SocialAccount } from '../src/types';

// Testes de unidade do planejador determinístico do ciclo (D15).
test.describe('unit · planejamento do ciclo', () => {
  test('nº de conteúdos: exemplo da maquete (3+3+1 peças → 5 conteúdos)', () => {
    expect(contentsFor(7, 3)).toBe(5);
    expect(contentsFor(5, 3)).toBe(4);
    expect(contentsFor(2, 2)).toBe(2);
    expect(contentsFor(0, 0)).toBe(0);
  });

  test('apportion distribui exatamente o total pelos pesos', () => {
    const r = apportion({ a: 35, b: 30, c: 20, d: 10, e: 5 }, 5);
    expect(Object.values(r).reduce((x, y) => x + y, 0)).toBe(5);
    expect(r.a).toBeGreaterThanOrEqual(r.e);
  });

  test('dias de publicação respeitam a cadência e ficam espaçados', () => {
    expect(publishingDays('linkedin', 2)).toHaveLength(2);
    expect(new Set(publishingDays('instagram', 3)).size).toBe(3);
    expect(publishingDays('linkedin', 0)).toEqual([]);
    expect(publishingDays('instagram', 7)).toHaveLength(7);
  });

  test('plano completo: necessidades somam os conteúdos; canais somam as peças; calendário tem as peças', () => {
    const acc = (id: string, platform: 'linkedin' | 'instagram', label: string) => ({ id, platform, label, status: 'connected' }) as SocialAccount;
    const accounts = [acc('li', 'linkedin', 'Marcos'), acc('ig', 'instagram', 'Marcos'), acc('bee', 'instagram', 'Bee Consulting')];
    const campaign = {
      account_ids: ['li', 'ig', 'bee'], cadence: { li: 3, ig: 3, bee: 1 }, duration_weeks: 8,
      strategy: {
        mix: { presenca: 35, posicionamento: 30, autoridade: 20, relacionamento: 10, produtos: 5 }, rationale: '',
        matrix: [
          { weeks: '1–2', levels: { presenca: 'alto', posicionamento: 'alto', autoridade: 'baixo', relacionamento: 'medio', produtos: 'muito_baixo' } },
          { weeks: '3–4', levels: { presenca: 'alto', posicionamento: 'alto', autoridade: 'medio', relacionamento: 'medio', produtos: 'baixo' } },
          { weeks: '5–6', levels: { presenca: 'medio', posicionamento: 'alto', autoridade: 'alto', relacionamento: 'medio', produtos: 'baixo' } },
          { weeks: '7–8', levels: { presenca: 'medio', posicionamento: 'medio', autoridade: 'alto', relacionamento: 'medio', produtos: 'medio' } },
        ],
      },
    } as unknown as Campaign;
    const cycle = { idx: 1, start_date: '2026-09-21', end_date: '2026-09-27' } as CampaignCycle;
    const plan = buildCyclePlan(campaign, cycle, accounts);
    expect(plan.totals).toEqual({ contents: 5, pieces: 7 });
    expect(plan.needs.reduce((a, n) => a + n.count, 0)).toBe(5);
    expect(plan.channels.reduce((a, c) => a + c.contents, 0)).toBe(7);
    expect(plan.calendar).toHaveLength(7);
    expect(plan.calendar[0].date).toBe('2026-09-21');
    expect(plan.calendar.flatMap((d) => d.slots)).toHaveLength(7);
    // semana 1: autoridade baixa, presença/posicionamento altos → presença lidera
    expect(plan.needs[0].function).toBe('presenca');
    // semana 7: autoridade alta passa a pesar mais
    const late = buildCyclePlan(campaign, { ...cycle, idx: 7 }, accounts);
    const aut = (p: typeof plan) => p.needs.find((n) => n.function === 'autoridade')?.count ?? 0;
    expect(aut(late)).toBeGreaterThan(aut(plan));
  });
});
