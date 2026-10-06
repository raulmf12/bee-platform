import { test, expect } from '@playwright/test';
import { ACJ_META, LEARNING_TRANSITIONS, normalizeAcjMix } from '../src/lib/acj/library';
import { buildAcjCyclePlan, countAcj, phaseIndexForCycle, sumCounts } from '../src/lib/acj/cyclePlan';
import { acjCirculationAlerts } from '../src/lib/acj/circulation';
import { commentRows } from '../supabase/functions/_shared/instagram-map';
import type { AcjMix, AcjPhase, CampaignCycle, UserPost } from '../src/types';

const MIX: AcjMix = { 'ACJ-01': 25, 'ACJ-02': 25, 'ACJ-03': 20, 'ACJ-04': 20, 'ACJ-05': 10 };
const phase = (n: number, mix: AcjMix): AcjPhase => ({ phase: n, label: `F${n}`, entry_state: '', priority_movement: `mov ${n}`, acj_primary: [], bridges: '', exit_state: '', mix });
const PHASES = [
  phase(1, { 'ACJ-01': 60, 'ACJ-02': 20, 'ACJ-03': 10, 'ACJ-04': 10, 'ACJ-05': 0 }),
  phase(2, { 'ACJ-01': 20, 'ACJ-02': 50, 'ACJ-03': 15, 'ACJ-04': 10, 'ACJ-05': 5 }),
  phase(3, { 'ACJ-01': 15, 'ACJ-02': 20, 'ACJ-03': 35, 'ACJ-04': 20, 'ACJ-05': 10 }),
  phase(4, { 'ACJ-01': 20, 'ACJ-02': 25, 'ACJ-03': 15, 'ACJ-04': 15, 'ACJ-05': 25 }),
];

test.describe('unit · Biblioteca ACJ', () => {
  test('biblioteca gerada dos .md: só ACJ-01..05, com movimento e fronteiras', () => {
    expect(Object.keys(ACJ_META)).toEqual(['ACJ-01', 'ACJ-02', 'ACJ-03', 'ACJ-04', 'ACJ-05']);
    expect(ACJ_META['ACJ-02'].name).toBe('Identificação');
    expect(ACJ_META['ACJ-03'].short).toBe('Eu me aproximo.');
    for (const a of Object.values(ACJ_META)) {
      expect(a.state_from.length).toBeGreaterThan(10);
      expect(a.boundaries).toHaveLength(4);
      expect(a.boundaries.map((b) => b.acj)).not.toContain(a.id);
    }
    expect(JSON.stringify(ACJ_META)).not.toContain('"id":"ACJ-00"');
  });

  test('mix normalizado soma 100 e descarta chaves inválidas', () => {
    const m = normalizeAcjMix({ 'ACJ-01': 1, 'ACJ-02': 1, 'ACJ-03': 1, 'ACJ-00': 50 } as Record<string, number>);
    expect(Object.values(m).reduce((a, b) => a + b, 0)).toBe(100);
    expect(m['ACJ-04']).toBe(0);
    expect((m as Record<string, number>)['ACJ-00']).toBeUndefined();
  });

  test('fase do ciclo segue a matriz da estratégia (8 semanas → 4 fases)', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((i) => phaseIndexForCycle(8, i))).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    expect(phaseIndexForCycle(1, 1)).toBe(0);
    expect(phaseIndexForCycle(2, 2)).toBe(3);
  });

  test('plano do ciclo: soma = conteúdos, segue a fase e reforça lacunas', () => {
    const plan = { target_mix: MIX, phases: PHASES, status: 'approved' as const };
    const c1 = buildAcjCyclePlan({ plan, weeks: 8, cycleIdx: 1, contents: 5, realized: {}, lastCycle: {} });
    expect(sumCounts(c1.counts)).toBe(5);
    expect(c1.counts['ACJ-01']).toBe(3);                 // fase 1 = Reconhecimento
    expect(c1.counts['ACJ-05'] ?? 0).toBe(0);            // ausência intencional na fase 1
    expect(c1.rationale).toContain('Fase 1');
    expect(c1.rationale).not.toContain('não aprovado');
    // Ciclo 5 (fase 3) com Conexão nunca feita → lacuna explícita e reforço.
    const c5 = buildAcjCyclePlan({ plan, weeks: 8, cycleIdx: 5, contents: 5, realized: { 'ACJ-01': 6, 'ACJ-02': 4 }, lastCycle: { 'ACJ-02': 3 } });
    expect(sumCounts(c5.counts)).toBe(5);
    expect(c5.gaps.join(' ')).toContain('ACJ-03');
    expect(c5.counts['ACJ-03']).toBeGreaterThanOrEqual(2);
    expect(c5.saturation_flags.join(' ')).toContain('ACJ-02');
  });

  test('plano ainda não aprovado: recomenda e avisa', () => {
    const c = buildAcjCyclePlan({ plan: { target_mix: MIX, phases: [], status: 'recommended' }, weeks: 4, cycleIdx: 1, contents: 4, realized: {}, lastCycle: {} });
    expect(sumCounts(c.counts)).toBe(4);
    expect(c.rationale).toContain('não aprovado');
  });

  test('realizado conta só ideias aprovadas/desenvolvidas', () => {
    expect(countAcj([
      { acj_primary: 'ACJ-01', status: 'approved' }, { acj_primary: 'ACJ-01', status: 'developed' },
      { acj_primary: 'ACJ-02', status: 'discarded' }, { acj_primary: 'ACJ-03', status: 'proposed' }, { acj_primary: null, status: 'approved' },
    ])).toEqual({ 'ACJ-01': 2 });
  });

  test('transições do Registro Vivo (§5.1)', () => {
    expect(LEARNING_TRANSITIONS.open).toEqual(['hypothesis', 'inconclusive']);
    expect(LEARNING_TRANSITIONS.open).not.toContain('validated');
    expect(LEARNING_TRANSITIONS.validated).toEqual(['consolidated']);
    expect(LEARNING_TRANSITIONS.consolidated).toEqual([]);
  });

  test('circulação: saturação, espaçamento e lacuna (por conteúdo-mãe, não por peça)', () => {
    const today = '2026-10-05';
    const p = (id: string, content: string, acj: string, day: string, extra: Partial<UserPost> = {}) =>
      ({ id, content_id: content, campaign_id: 'c1', cycle_id: 'cy1', acj_primary: acj, status: 'scheduled', scheduled_date: `${day}T12:00:00Z`, ...extra }) as UserPost;
    const posts = [
      p('a', 'k1', 'ACJ-01', '2026-10-06'), p('a2', 'k1', 'ACJ-01', '2026-10-06', { platform: 'instagram' } as Partial<UserPost>),
      p('b', 'k2', 'ACJ-01', '2026-10-07'), p('c', 'k3', 'ACJ-01', '2026-10-08'),
      p('d', 'k4', 'ACJ-04', '2026-10-09'), p('e', 'k5', 'ACJ-05', '2026-10-09'),
    ];
    const cycles = [{ id: 'cy1', campaign_id: 'c1', idx: 2, start_date: '2026-10-05', end_date: '2026-10-11' } as CampaignCycle];
    const alerts = acjCirculationAlerts(posts, { cycles, cyclePlans: [{ cycle_id: 'cy1', counts: { 'ACJ-01': 3, 'ACJ-03': 1 } }], today });
    const sat = alerts.find((a) => a.kind === 'saturation');
    expect(sat?.title).toContain('3 conteúdos seguidos de ACJ-01');   // k1 tem 2 peças: conta 1
    expect(alerts.some((a) => a.kind === 'spacing')).toBe(true);
    expect(alerts.find((a) => a.kind === 'gap')?.title).toContain('ACJ-03');
    expect(alerts.some((a) => a.kind === 'gap' && a.title.includes('ACJ-01'))).toBe(false);
  });

  test('comentários do Instagram → linhas (respostas da própria conta não são audiência)', () => {
    const rows = commentRows([
      { id: '1', text: 'Isso acontece comigo toda semana', username: 'leitor', like_count: 2, timestamp: '2026-10-01T10:00:00Z',
        replies: { data: [{ id: '2', text: 'Obrigado!', username: 'MarcosBee' }] } },
    ], { userId: 'u', postId: 'p', accountId: 'a', ownUsername: '@marcosbee' });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ external_id: '1', is_own: false, parent_external_id: null, platform: 'instagram', post_id: 'p' });
    expect(rows[1]).toMatchObject({ external_id: '2', is_own: true, parent_external_id: '1' });
  });
});
