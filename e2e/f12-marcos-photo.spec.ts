import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { cleanupE2EData, cleanupE2EPhotoFiles, sql } from './helpers/admin';
import { callEdge } from './helpers/edge';
import { mockEdge, mockProduction } from './helpers/mocks';
import { seedAccounts, seedCampaign, seedValidatedContents } from './helpers/fixtures';
import { e2eUser } from './helpers/env';

// Motor fotográfico do Marcos (docs/fotografia/01–06) contra os modelos REAIS.
test.describe('F12 · motor fotográfico do Marcos', () => {
  test.beforeEach(async () => { await cleanupE2EPhotoFiles(); await cleanupE2EData(); });
  test.afterAll(async () => { if (!process.env.KEEP) { await cleanupE2EPhotoFiles(); await cleanupE2EData(); } });

  test('@live plano + geração real F01 com portões e registro completo', async ({ page }) => {
    test.setTimeout(300_000);
    await page.goto('/');
    const text = 'Eu aprendi que liderar não é ter todas as respostas. É sustentar a pergunta certa por tempo suficiente para que o time encontre o próprio caminho.';
    const plan = await callEdge<{ success: boolean; plan: Record<string, unknown>; reading: Record<string, unknown>; references: { refs: Array<{ key: string }> } }>(page, 'marcos-photo', { action: 'plan', text });
    console.log('PLANO', JSON.stringify({ plan: plan.json.plan, refs: plan.json.references?.refs?.map((r) => r.key), reading: plan.json.reading }));
    expect(plan.status).toBe(200);

    const r = await callEdge<{ success: boolean; status: string; generation: Record<string, unknown>; error?: string }>(page, 'marcos-photo', { action: 'generate', text, force_variant: process.env.VARIANT ?? 'F01-B', purpose: 'validation_board' });
    console.log('GERACAO', r.status, JSON.stringify(r.json).slice(0, 1500));
    expect(r.status).toBe(200);
    expect(r.json.status).toBe('generated');
    const g = r.json.generation as Record<string, string>;
    expect(g.image_url).toContain('/design/hive/marcos-photo/');
    expect(g.model).toMatch(/gemini/);
    const [row] = await sql<Record<string, unknown>>(`select origin, producer_profile_version, style_id, variant_id, expression_id, wardrobe_id, environment_id, text_space, aspect, array_length(source_ref_keys,1) refs, auto_status, identity_status, review_status from photo_generations where id='${g.id}'`);
    console.log('REGISTRO', JSON.stringify(row));
    expect(row).toMatchObject({ origin: 'gerada', producer_profile_version: 'marcos_piccini_v1.1', style_id: (process.env.VARIANT ?? 'F01-B').slice(0, 3), review_status: 'pending' });
    const img = await page.request.get(g.image_url);
    if (process.env.SHOTS) writeFileSync(`${process.env.SHOTS}/marcos-${g.variant_id}.png`, await img.body());
    expect(e2eUser().id).toBeTruthy();
  });

  const REF_URL = 'https://djlorvdehedcupeykyes.supabase.co/storage/v1/object/public/design/hive/marcos-1788357859-03.jpg';
  // Simula a edge marcos-photo: grava a geração de verdade (a revisão lê do banco) com uma foto real como imagem.
  async function mockPhotoEngine(page: import('@playwright/test').Page, calls: Array<Record<string, unknown>> = []) {
    const { id: userId } = e2eUser();
    await mockEdge(page, 'marcos-photo', async (b) => {
      if (b.action === 'review') {
        const st = b.decision === 'approve' ? 'approved' : b.decision === 'adjust' ? 'adjust' : 'rejected';
        const [g] = await sql(`update photo_generations set review_status='${st}', reviewer_notes=${b.note ? `'${String(b.note).replace(/'/g, "''")}'` : 'null'} where id='${b.generation_id}' returning *`);
        return { success: true, generation: g };
      }
      const variant = String(b.force_variant ?? 'F01-A');
      const [g] = await sql(`insert into photo_generations (user_id, producer_profile_version, post_id, purpose, origin, source_ref_keys, style_id, variant_id, expression_id, wardrobe_id, environment_id, gaze, crop, text_space, aspect, mother_text, model, image_url, auto_status, identity_status, gates, plan, attempt)
        values ('${userId}', 'marcos_piccini_v1.1', ${b.post_id ? `'${b.post_id}'` : 'null'}, '${b.purpose === 'validation_board' ? 'validation_board' : 'post'}', 'gerada', array['HAR_0472','HAR_0476'], '${variant.slice(0, 3)}', '${variant}', 'E01', 'camiseta_preta', 'janela_luz', 'camera', 'bust', 'left', '4:5', 'texto', 'gemini-3-pro-image (mock)', '${REF_URL}',
          'revisar', 'aprovada', '{"failures":["composição: pouco espaço à esquerda"],"G1_identidade":{"score":0.82}}'::jsonb,
          '{"sufficiency":{"a0":0,"body_allowed":false,"note":"Sem referências A0"},"comparison":{"front":{"key":"HAR_0472","url":"${REF_URL}"},"three_quarter":{"key":"HAR_0476","url":"${REF_URL}"}}}'::jsonb, ${Number(b.attempt ?? 1)}) returning *`);
      return { success: true, status: 'generated', generation: g, plan: {} };
    }, calls);
  }

  test('gestão: referências por nível, falta de A0, prancha de validação e aprovação do estilo', async ({ page }) => {
    const calls: Array<Record<string, unknown>> = [];
    await mockPhotoEngine(page, calls);
    // Envio de referência é interceptado: os testes NUNCA gravam nas referências reais do Marcos.
    let refWrite = 0;
    await page.route('**/storage/v1/object/design/hive/refs/**', (r) => { refWrite++; return r.fulfill({ status: 200, contentType: 'application/json', body: '{"Key":"design/hive/refs/x.jpg"}' }); });
    await page.route('**/rest/v1/photo_references?on_conflict=*', (r) => r.request().method() === 'OPTIONS' ? r.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' } }) : (refWrite++, r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })));
    await page.goto('/hive/fotografia');
    await expect(page.getByTestId('level-A')).toContainText('8 fotos');
    await expect(page.getByTestId('level-D')).toContainText('4 fotos');
    await expect(page.getByTestId('level-A0')).toContainText('0 de 13');
    await expect(page.getByTestId('level-B')).toContainText('23 fotos');
    await expect(page.getByTestId('a0-missing')).toContainText('corpo pelas fotos de meio corpo');
    await expect(page.getByTestId('style-F02')).not.toContainText('precisa');
    await expect(page.getByTestId('board-F04')).toBeEnabled();

    await page.getByTestId('ref-upload').setInputFiles([
      { name: '20260923_152032.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) },
      { name: 'foto_aleatoria.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) },
    ]);
    await expect(page.getByText('1 referência(s) registrada(s).')).toBeVisible();
    await expect(page.getByText('Não reconhecidas pelo nome (fora do manifesto do perfil): foto_aleatoria.jpg')).toBeVisible();
    expect(refWrite).toBe(2);

    await page.getByTestId('board-F01').click();
    await expect(page.getByTestId('style-F01').getByTestId('marcos-photo-review')).toHaveCount(4, { timeout: 30_000 });
    expect(calls.filter((c) => c.action === 'generate').map((c) => c.force_variant)).toEqual(['F01-A', 'F01-B', 'F01-C', 'F01-D']);
    expect(calls.filter((c) => c.action === 'generate').every((c) => c.purpose === 'validation_board')).toBe(true);
    const first = page.getByTestId('style-F01').getByTestId('marcos-photo-review').first();
    await expect(first).toContainText('Portões: revisar');
    await expect(first.getByTestId('photo-failures')).toContainText('pouco espaço à esquerda');
    await expect(first.getByRole('img', { name: 'Referência Frontal' })).toBeVisible();
    if (process.env.SHOTS) { await page.getByTestId('style-F01').scrollIntoViewIfNeeded(); await page.getByTestId('style-F01').screenshot({ path: `${process.env.SHOTS}/f12-engine.png` }); }
    await page.getByTestId('approve-F01').click();
    await expect(page.getByTestId('style-F01').getByTestId('style-status')).toHaveText('Aprovado');
    const { id: userId } = e2eUser();
    const [ap] = await sql<{ status: string; n: number }>(`select status, array_length(board_generation_ids,1) n from photo_style_approvals where user_id='${userId}' and style_id='F01'`);
    expect(ap).toEqual({ status: 'approved', n: 4 });
  });

  test('produção: peça com o Marcos usa o motor, mostra a revisão lado a lado e aprovar registra a foto', async ({ page }) => {
    test.setTimeout(180_000);
    const calls: Array<Record<string, unknown>> = [];
    await mockProduction(page);
    await mockPhotoEngine(page, calls);
    // hive-decide escolhe o modo com o Marcos (M02-A) para o desdobramento do Instagram.
    await mockEdge(page, 'hive-decide', (b) => {
      const seed = b.seed as { variant?: string } | undefined;
      const variant = b.platform === 'linkedin' ? 'M01-A' : (seed?.variant?.startsWith('M02') ? seed.variant : 'M02-A');
      return { success: true, model_used: 'mock', decision: { mode: variant.split('-')[0], variant, highlight: null, subtitle: null, asset: null, diagram: null, explanation: {} } };
    });
    await mockEdge(page, 'generate-content', (b) => {
      const n = Number(b.variations ?? 1);
      const vars = Array.from({ length: n }, (_, i) => ({ quote: `Frase ${i + 1}`, caption: `Legenda ${i + 1}`, virality_score: 70, hive_seed: { variant: 'M02-A', manifestation: 'M02', highlight: null, subtitle: null, poles: null, image_scene_hint: '', human_presence_adds_meaning: true, mode_reason: '', variant_reason: '' } }));
      return { success: true, variations: vars.slice(0, 1), ...vars[0] };
    });
    const acc = await seedAccounts();
    const camp = await seedCampaign({ weeks: 8, name: 'Presença Marcos', accountIds: [acc.linkedin, acc.instagram] });
    await seedValidatedContents(camp.id, camp.cycleIds[0], [{ title: 'Liderar é sustentar a pergunta', channels: [{ account_id: acc.instagram, platform: 'instagram' }] }]);
    await page.goto(`/producao?campaign=${camp.id}&cycle=${camp.cycleIds[0]}`);
    await expect(page.getByTestId('production-summary')).toBeVisible({ timeout: 120_000 });
    expect(calls.filter((c) => c.action === 'generate').length).toBeGreaterThan(0);
    const gen = calls.find((c) => c.action === 'generate')!;
    expect(String(gen.text)).toContain('Legenda');          // lê o texto-mãe (legenda), não só a frase
    const [piece] = await sql<{ id: string; gid: string; variant: string }>(`select id, visual_decision->'asset'->>'photo_generation_id' gid, visual_decision->>'variant' variant from user_posts where cycle_id='${camp.cycleIds[0]}' and piece_role='unfold' and status<>'archived' limit 1`);
    expect(piece.variant).toBe('M02-A');
    expect(piece.gid).toBeTruthy();

    await page.getByRole('button', { name: /Revisar produção/ }).click();
    await page.getByRole('button', { name: /Revisar propostas|Revisar peça|Revisar/ }).first().click();
    // Outras opções de IMAGEM: mesmo design (M02-A) e mesma frase, foto nova pelo motor.
    const gensBefore = calls.filter((c) => c.action === 'generate').length;
    await page.getByTestId('vary-image').click();
    await expect(page.getByTestId('proposal')).toHaveCount(3, { timeout: 60_000 });
    await expect(page.getByTestId('proposal-tag').nth(1)).toHaveText('Nova imagem · mesmo design');
    expect(calls.filter((c) => c.action === 'generate').length).toBe(gensBefore + 2);
    const alts = await sql<{ variant: string; quote: string; gid: string }>(`select visual_decision->>'variant' variant, carousel_text->>'quote' quote, visual_decision->'asset'->>'photo_generation_id' gid from user_posts where cycle_id='${camp.cycleIds[0]}' and piece_role='unfold' and status<>'archived' order by alternative_rank`);
    expect(alts.map((a) => a.variant)).toEqual(['M02-A', 'M02-A', 'M02-A']);
    expect(new Set(alts.map((a) => a.quote)).size).toBe(1);
    expect(new Set(alts.map((a) => a.gid)).size).toBe(3);                 // uma foto diferente por opção
    await page.getByRole('button', { name: 'Escolher opção 1' }).click();
    const review = page.getByTestId('marcos-photo-review');
    await expect(review).toBeVisible();
    await expect(review.getByTestId('photo-candidate')).toBeVisible();
    await review.getByTestId('photo-approve').click();
    await expect.poll(async () => (await sql<{ r: string }>(`select review_status r from photo_generations where id='${piece.gid}'`))[0].r).toBe('approved');
    await expect.poll(async () => (await sql<{ s: string; bg: string }>(`select status s, metadata->>'bg_approved' bg from user_posts where id='${piece.id}'`))[0]).toEqual({ s: 'approved', bg: 'true' });
  });
});
