import { test, expect } from '@playwright/test';
import { REFERENCE_MANIFEST, manifestKeyOf } from '../supabase/functions/_shared/photo-profile';
import { VARIANTS } from '../supabase/functions/_shared/photo-styles';
import { buildPhotoPrompt, pickReferences, planPhoto, readGates, styleScores, type AvailableRef, type TextReading } from '../supabase/functions/_shared/photo-select';

const sem = (o: Partial<TextReading['semantics']> = {}) => ({ autoria: 0.3, densidade_conceitual: 0.3, relacionalidade: 0.2, orientacao_futuro: 0.2, energia_acao: 0.2, intimidade: 0.3, necessidade_evidencia: 0.1, valor_atmosfera: 0.4, forca_posicionamento: 0.3, ...o });
const reading = (o: Partial<TextReading['semantics']>, intent: TextReading['variant_intent'] = {}, extra: Partial<TextReading> = {}): TextReading => ({ semantics: sem(o), factual_claim: false, variant_intent: intent, ...extra });
const ref = (key: string): AvailableRef => { const m = REFERENCE_MANIFEST.find((x) => x.key === key)!; return { key, priority: m.priority, roles: m.roles, url: `https://x/${key}.jpg` }; };
const HAR = REFERENCE_MANIFEST.filter((m) => m.priority !== 'A0').map((m) => ref(m.key));
const ALL = REFERENCE_MANIFEST.map((m) => ref(m.key));

test.describe('unit · motor fotográfico do Marcos', () => {
  test('manifesto: 30 referências (13 A0, 8 A, 3 B, 4 C, 2 D) e nomes de arquivo reais', () => {
    const count = (p: string) => REFERENCE_MANIFEST.filter((m) => m.priority === p).length;
    expect([count('A0'), count('A'), count('B'), count('C'), count('D')]).toEqual([13, 8, 3, 4, 2]);
    expect(manifestKeyOf('HAR_0476(1).jpg')).toBe('HAR_0476');
    expect(manifestKeyOf('marcos_05_HAR_0476.jpg')).toBe('HAR_0476');
    expect(manifestKeyOf('Open Hive_foto- Leandro Viola-62 (1)(2).jpg')).toBe('OPENHIVE_62');
    expect(manifestKeyOf('20260923_153339.jpg')).toBe('20260923_153339');
    expect(manifestKeyOf('HAR_0470.jpg')).toBeNull();
    expect(VARIANTS).toHaveLength(18);
  });

  test('regra de verdade: texto que afirma fato real → foto real, não gera', () => {
    const p = planPhoto({ text: 'Hoje estivemos com a equipe da empresa X', reading: reading({}, {}, { factual_claim: true, factual_reason: 'menciona reunião real' }), recent: [], refs: ALL });
    expect(p).toMatchObject({ status: 'needs_real_photo', origin: 'real' });
    expect(planPhoto({ text: 'x', reading: reading({ necessidade_evidencia: 0.7 }), recent: [], refs: ALL }).status).toBe('needs_real_photo');
  });

  test('seleção de estilo pelas dimensões do texto', () => {
    expect(planPhoto({ text: 'Eu acredito que liderança é presença.', reading: reading({ autoria: 0.9, forca_posicionamento: 0.8 }, { F01: 'F01-A' }), recent: [], refs: ALL })).toMatchObject({ style: 'F01', variant: 'F01-A', gaze: 'camera' });
    expect(planPhoto({ text: 'Estudar um padrão até compreender o método.', reading: reading({ densidade_conceitual: 0.9 }, { F02: 'F02-A' }), recent: [], refs: ALL })).toMatchObject({ style: 'F02', variant: 'F02-A' });
    expect(planPhoto({ text: 'Escutar a equipe muda a cultura.', reading: reading({ relacionalidade: 0.9 }, { F03: 'F03-A' }), recent: [], refs: ALL })).toMatchObject({ style: 'F03', variant: 'F03-A' });
    expect(planPhoto({ text: 'O próximo passo começa ao atravessar o medo.', reading: reading({ orientacao_futuro: 0.9 }, { F04: 'F04-B' }), recent: [], refs: ALL })).toMatchObject({ style: 'F04', variant: 'F04-B', crop: 'full_body' });
    const sc = styleScores(sem({ autoria: 0.9 }), 'eu acho');
    expect(sc.F01).toBeGreaterThan(sc.F02);
  });

  test('regra de insuficiência: sem A0 só rosto/busto (F01-A/B/C), nunca corpo', () => {
    const p = planPhoto({ text: 'O próximo passo', reading: reading({ orientacao_futuro: 0.95 }, { F04: 'F04-A' }), recent: [], refs: HAR });
    expect(p.sufficiency).toMatchObject({ a0: 0, body_allowed: false });
    expect(p.style).toBe('F01');
    expect(['F01-A', 'F01-B', 'F01-C']).toContain(p.variant);
    expect(['bust', 'close']).toContain(p.crop);
  });

  test('antirrepetição: F01 em 2 dos 3 últimos perde força; variação, expressão e roupa variam', () => {
    const recent = [{ style: 'F01', variant: 'F01-A', expression: 'E01', wardrobe: 'camiseta_preta', environment: 'parede_texturizada', text_space: 'left' }, { style: 'F01', variant: 'F01-B', expression: 'E04' }, { style: 'F02', variant: 'F02-A' }];
    const p = planPhoto({ text: 'eu', reading: reading({ autoria: 0.75, densidade_conceitual: 0.6 }, { F01: 'F01-A', F02: 'F02-A' }), recent, refs: ALL });
    expect(p.penalties).toContain('F01 usado em 2 dos 3 últimos');
    expect(p.variant).not.toBe('F01-A');
    const q = planPhoto({ text: 'eu', reading: reading({ autoria: 0.95, forca_posicionamento: 0.9 }, { F01: 'F01-A' }), recent: [{ style: 'F02', variant: 'F02-A', expression: 'E01', wardrobe: 'camiseta_preta', text_space: 'left' }], refs: ALL });
    expect(q).toMatchObject({ variant: 'F01-A', expression: 'E02', text_space: 'right' });
    expect(q.wardrobe).not.toBe('camiseta_preta');
  });

  test('só estilos aprovados entram em produção', () => {
    const p = planPhoto({ text: 'estudar o método', reading: reading({ densidade_conceitual: 0.95 }, { F02: 'F02-B' }), recent: [], refs: ALL, approvedStyles: ['F01'] });
    expect(p.style).toBe('F01');
    expect(() => planPhoto({ text: 'x', reading: reading({}), recent: [], refs: ALL, approvedStyles: [] })).toThrow('Nenhuma variação disponível');
  });

  test('referências: A0 primeiro, expressão pedida, corpo do mesmo enquadramento; comparação lado a lado', () => {
    const withA0 = pickReferences({ crop: 'full_body', expression: 'E01', gaze: 'path' }, ALL);
    expect(withA0.refs.map((r) => r.key)).toEqual(['20260923_152032', '20260923_152113', '20260923_153259', 'HAR_0472', 'HAR_0476']);
    expect(withA0.comparison.body?.key).toBe('20260923_153259');
    const noA0 = pickReferences({ crop: 'bust', expression: 'E04', gaze: 'off_camera' }, HAR);
    expect(noA0.refs.map((r) => r.key)).toEqual(['HAR_0472', 'HAR_0720', 'HAR_0721', 'HAR_0476', 'OPENHIVE_61']);
    expect(noA0.comparison).toMatchObject({ front: { key: 'HAR_0472' }, three_quarter: { key: 'HAR_0476' }, expression: { key: 'HAR_0720' }, body: null });
  });

  test('prompt segue o contrato do estilo + identidade travada', () => {
    const plan = planPhoto({ text: 'eu', reading: reading({ autoria: 0.9 }, { F01: 'F01-B' }), recent: [], refs: HAR });
    const prompt = buildPhotoPrompt(plan, pickReferences(plan, HAR).refs, { adjustNote: 'luz mais quente' });
    for (const s of ['CROP: bust portrait', 'no current full-body references', 'Style: F01 Presença autoral', 'Variant: F01-B', 'IDENTITY LOCK (strict)', 'marcos_piccini_v1.1', 'Expression:', 'Avoid:', 'hand on chin', 'Reviewer adjustment request', 'aspect ratio 4:5', 'no text']) expect(prompt).toContain(s);
  });

  test('portões: verdade/identidade são hard fail; diversidade medida por código', () => {
    const plan = { variant: 'F01-A', wardrobe: 'camiseta_preta', environment: 'parede_texturizada' };
    const good = { G0_verdade: { ok: true }, G1_identidade: { ok: true, score: 0.85, answers: [true, true, true, true, true, true, true] }, G2_realismo: { ok: true }, G3_coerencia: { ok: true }, G4_composicao: { ok: true }, style_gates: [{ q: 'x', ok: true }], hard_reject_hits: [] };
    expect(readGates(good, plan, [])).toMatchObject({ status: 'aprovada', hard_fail: 'nenhum', identity_status: 'aprovada' });
    expect(readGates([good], plan, [])).toMatchObject({ status: 'aprovada', identity_status: 'aprovada' }); // resposta embrulhada em lista
    expect(readGates({ ...good, G1_identidade: { ok: true, score: 0.5, answers: [true, false, true, true, true, true, true] } }, plan, [])).toMatchObject({ status: 'rejeitada', hard_fail: 'identidade' });
    expect(readGates({ ...good, G0_verdade: { ok: false, notes: 'plateia' } }, plan, [])).toMatchObject({ status: 'rejeitada', hard_fail: 'verdade' });
    expect(readGates({ ...good, G2_realismo: { ok: false, notes: 'dedos deformados' } }, plan, [])).toMatchObject({ status: 'rejeitada', hard_fail: 'realismo_critico' });
    expect(readGates({ ...good, G3_coerencia: { ok: false, notes: 'literal' } }, plan, []).status).toBe('revisar');
    const rep = readGates(good, plan, [{ style: 'F01', variant: 'F01-A', wardrobe: 'camiseta_preta', environment: 'parede_texturizada' }]);
    expect(rep.status).toBe('revisar');
    expect(rep.failures[0]).toContain('diversidade');
  });
});

test('catálogo do app espelha o manifesto e os estilos do motor', async () => {
  const app = await import('../src/lib/hive/photoCatalog');
  expect(app.REFERENCE_MANIFEST).toEqual(REFERENCE_MANIFEST);
  expect(Object.keys(app.VARIANT_NAMES)).toEqual(VARIANTS.map((v) => v.id));
  for (const v of VARIANTS) expect(app.VARIANT_NAMES[v.id]).toBe(v.name);
  expect(app.manifestKeyOf('HAR_0476(1).jpg')).toBe('HAR_0476');
});
