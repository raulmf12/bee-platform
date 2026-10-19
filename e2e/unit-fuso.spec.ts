import { test, expect } from '@playwright/test';
import { atTime, isoToLocalInput, localInputToIso, setScheduleTimeZone, toZoned, wallTimeToInstant } from '../src/lib/schedule';

// Fuso da operação (Estabilização · doc 02 §9.3 · T29): o banco guarda o instante; entrada e exibição
// usam o fuso do produtor, não o do navegador — sem deslocar o horário.
test.describe('unit · fuso da agenda', () => {
  test.afterAll(() => setScheduleTimeZone('America/Sao_Paulo'));

  test('São Paulo: 13h no input vira 16h UTC e volta como 13h', () => {
    setScheduleTimeZone('America/Sao_Paulo');
    expect(localInputToIso('2026-10-20T13:00')).toBe('2026-10-20T16:00:00.000Z');
    expect(isoToLocalInput('2026-10-20T16:00:00.000Z')).toBe('2026-10-20T13:00');
    expect(atTime(new Date(2026, 9, 20), '09:30').toISOString()).toBe('2026-10-20T12:30:00.000Z');
    const z = toZoned(new Date('2026-10-20T16:00:00.000Z'));
    expect([z.getHours(), z.getMinutes()]).toEqual([13, 0]);
  });

  test('outro fuso (Lisboa, com horário de verão): mesmo instante em UTC, apresentação coerente', () => {
    setScheduleTimeZone('Europe/Lisbon');
    expect(localInputToIso('2026-07-01T13:00')).toBe('2026-07-01T12:00:00.000Z');   // verão: UTC+1
    expect(localInputToIso('2026-12-01T13:00')).toBe('2026-12-01T13:00:00.000Z');   // inverno: UTC+0
    expect(isoToLocalInput('2026-07-01T12:00:00.000Z')).toBe('2026-07-01T13:00');
    // hora inexistente na troca (29/03/2026 01:30 em Lisboa) cai num instante bem definido
    const gap = wallTimeToInstant(2026, 2, 29, 1, 30, 'Europe/Lisbon');
    expect(Number.isNaN(gap.getTime())).toBe(false);
  });

  test('fuso inválido é ignorado (mantém o atual)', () => {
    setScheduleTimeZone('America/Sao_Paulo');
    setScheduleTimeZone('Fuso/Inexistente');
    expect(localInputToIso('2026-10-20T13:00')).toBe('2026-10-20T16:00:00.000Z');
  });
});
