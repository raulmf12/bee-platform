import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { addDays, format } from 'date-fns';
import { cleanupE2EData, cleanupE2EStorage, seed, sql, uploadE2EImage } from './helpers/admin';
import { mockEdge } from './helpers/mocks';
import { e2eUser } from './helpers/env';
import { loginAs, type Tenant } from './helpers/tenant';

// F24 — Estabilização E3: aprovação durável (merge no servidor, impressão digital do texto), "Aprovar
// peça" sem desagendar, invalidação só do componente editado, agendamento pelo comando único em
// editor/agenda e plano em lote que sobrevive a recarregar a página.
test.describe('F24 · Aprovação e agenda (E3)', () => {
  let me: Tenant;
  let acc: string;
  const sha = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex');
  const tomorrowKey = format(addDays(new Date(), 1), 'yyyy-MM-dd');

  test.beforeAll(async () => {
    const { email, password, id } = e2eUser();
    me = await loginAs(email, password, id);
  });
  test.beforeEach(async () => {
    await cleanupE2EData();
    const { id } = e2eUser();
    await sql(`delete from social_accounts where user_id='${id}' and label='E2E E3'`);
    [{ id: acc }] = await sql<{ id: string }>(`insert into social_accounts (user_id, platform, label, status, linkedin_token, linkedin_author_urn)
      values ('${id}', 'linkedin', 'E2E E3', 'connected', 'tok-falso', 'urn:li:person:e2e-e3') returning id`);
  });
  test.afterAll(async () => {
    await cleanupE2EData();
    await sql(`delete from social_accounts where label='E2E E3'`);
    await cleanupE2EStorage();
  });

  const piece = (o: { status?: string; url?: string; extra?: Record<string, unknown> } = {}) => seed('user_posts', {
    platform: 'linkedin', format: 'image', status: o.status ?? 'pending_approval', title: 'Peça E3', caption: 'Legenda original',
    carousel_text: { quote: 'Frase original' }, rendered_slides: { slide1: o.url ?? 'https://example.com/x.jpg' }, account_id: acc,
    metadata: { editorial_slug: 'diagnostico-sistemico' }, ...(o.extra ?? {}),
  });

  test('aprovação de campo: grava mesclando, não apaga a outra decisão e recusa texto que mudou (02/T03–T05)', async () => {
    const pid = await piece({ extra: { metadata: { editorial_slug: 'diagnostico-sistemico', review_stage: 'texto' } } });
    // título e legenda aprovados "ao mesmo tempo" (duas abas / cliques rápidos)
    const [a, b] = await Promise.all([
      me.rpc('merge_post_review', { p_post: pid, p_patch: { titulo_status: 'approved' }, p_expect: { titulo: sha('Frase original') } }),
      me.rpc('merge_post_review', { p_post: pid, p_patch: { legenda_status: 'approved' }, p_expect: { legenda: sha('Legenda original') } }),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const [m] = await sql<{ metadata: Record<string, unknown> }>(`select metadata from user_posts where id='${pid}'`);
    expect(m.metadata).toMatchObject({ titulo_status: 'approved', legenda_status: 'approved', review_stage: 'texto', editorial_slug: 'diagnostico-sistemico' });
    // outra aba mudou a legenda: aprovar com a impressão digital antiga é recusado
    await sql(`update user_posts set caption='Legenda nova' where id='${pid}'`);
    const stale = await me.rpc<{ message: string }>('merge_post_review', { p_post: pid, p_patch: { legenda_status: 'approved' }, p_expect: { legenda: sha('Legenda original') } });
    expect(stale.status).toBe(409);
    expect(stale.data.message).toMatch(/mudou enquanto você aprovava/);
  });

  test('Aprovar peça: confere o visual apresentado, não desagenda e editar volta só o componente (02/T25, T30; decisão 1)', async () => {
    const when = addDays(new Date(), 2).toISOString();
    const sched = await piece({ status: 'scheduled', extra: { scheduled_date: when } });
    const r = await me.rpc<{ status: string; scheduled_date: string }>('approve_piece', { p_post: sched, p_rendered: 'https://example.com/x.jpg' });
    expect(r.status).toBe(200);
    expect(r.data.status).toBe('scheduled');                                          // continua agendada
    expect(new Date(r.data.scheduled_date).toISOString()).toBe(when);
    // render diferente do apresentado: recusa
    const pid = await piece();
    const wrong = await me.rpc<{ message: string }>('approve_piece', { p_post: pid, p_rendered: 'https://example.com/outra.jpg' });
    expect(wrong.status).toBe(409);
    // imagem de IA sem aprovação: recusa com o motivo
    const ai = await piece({ extra: { visual_decision: { variant: 'M01-D' } } });
    const noAi = await me.rpc<{ message: string }>('approve_piece', { p_post: ai, p_rendered: 'https://example.com/x.jpg' });
    expect(noAi.status).toBe(422);
    expect(noAi.data.message).toMatch(/imagem gerada por IA/);
    // aprovada → editar SÓ a legenda: legenda pendente, frase e imagem preservadas, peça volta a pendente
    expect((await me.rpc('approve_piece', { p_post: pid, p_rendered: 'https://example.com/x.jpg' })).status).toBe(200);
    await sql(`update user_posts set caption='Legenda revista' where id='${pid}'`);
    const [p] = await sql<{ status: string; image_approved: boolean; metadata: Record<string, string> }>(`select status, image_approved, metadata from user_posts where id='${pid}'`);
    expect(p.status).toBe('pending_approval');
    expect(p.image_approved).toBe(true);
    expect(p.metadata).toMatchObject({ legenda_status: 'pending', titulo_status: 'approved' });
    // agendada → editar: continua agendada, marcada com alterações fora do agendamento
    await sql(`update user_posts set caption='Mudou depois de agendar' where id='${sched}'`);
    const [s] = await sql<{ status: string; metadata: Record<string, unknown> }>(`select status, metadata from user_posts where id='${sched}'`);
    expect(s.status).toBe('scheduled');
    expect(s.metadata).toMatchObject({ scheduled_outdated: true, legenda_status: 'pending' });
  });

  test('editor: aprovar e agendar pelo comando único; o painel da agenda abre a peça agendada (02/T28, T27)', async ({ page }) => {
    const fabric = { version: '6.0.0', background: '#ffffff', objects: [{ type: 'Rect', version: '6.0.0', left: 100, top: 100, width: 400, height: 300, fill: '#e89a3c' }] };
    const pid = await piece({ url: undefined, extra: { rendered_slides: null, carousel_fabric_json: [fabric] } });
    await page.goto(`/posts/${pid}`);
    // o editor prepara a imagem final sozinho quando o canvas renderiza (sem isso, aprovar recusa)
    await expect.poll(async () => (await sql<{ s: string | null }>(`select rendered_slides->>'slide1' s from user_posts where id='${pid}'`))[0].s, { timeout: 30_000 }).not.toBeNull();
    await page.getByRole('button', { name: /Aprovar · Stand-by/ }).click();
    await expect(page.getByText(/Peça aprovada · sem data/)).toBeVisible({ timeout: 30_000 });
    const [a] = await sql<{ status: string; image_approved: boolean; slide: string | null }>(`select status, image_approved, rendered_slides->>'slide1' slide from user_posts where id='${pid}'`);
    expect(a).toMatchObject({ status: 'approved', image_approved: true });
    expect(a.slide).toMatch(/\/render-[0-9a-f-]+\.png$/);
    await page.locator('#sched').fill(`${tomorrowKey}T15:00`);
    await expect(page.getByText(/Programado para .*Esta é a versão que será publicada/).first()).toBeVisible({ timeout: 30_000 });
    const [s] = await sql<{ status: string; pkg: string | null; d: string }>(`select status, scheduled_package_id pkg, scheduled_date::text d from user_posts where id='${pid}'`);
    expect(s.status).toBe('scheduled');
    expect(s.pkg).not.toBeNull();                                                      // pacote imutável fechado ao agendar
    await page.getByRole('button', { name: 'Ver na agenda' }).click();
    await expect(page.getByTestId('piece-panel')).toBeVisible();
    await expect(page.getByTestId('panel-move')).toBeVisible();
  });

  test('edição imediata: frase, legenda e imagem aprovadas chegam ao pacote agendado', async ({ page }) => {
    const fabric = { version: '6.0.0', background: '#ffffff', objects: [{
      type: 'Textbox', version: '6.0.0', name: 'bee-quote', text: 'Frase original',
      left: 100, top: 100, width: 700, fontSize: 48, fontFamily: 'Arial', fill: '#111111',
    }] };
    const pid = await piece({ extra: { rendered_slides: null, carousel_fabric_json: [fabric] } });
    await page.goto(`/posts/${pid}`);
    await expect.poll(async () => (await sql<{ s: string | null }>(`select rendered_slides->>'slide1' s from user_posts where id='${pid}'`))[0].s, { timeout: 30_000 }).not.toBeNull();
    const [before] = await sql<{ s: string }>(`select rendered_slides->>'slide1' s from user_posts where id='${pid}'`);
    await page.locator('#caption').fill('Legenda completamente revisada');
    const canvas = page.locator('canvas.upper-canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas não encontrado');
    // Ponto sobre a primeira linha do Textbox; coordenadas ajustadas ao zoom CSS.
    const scale = box.width / 1080;
    await canvas.dblclick({ position: { x: 200 * scale, y: 125 * scale } });
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.insertText('Frase revisada para publicação');
    // Sai da edição e salva sem aguardar o debounce de onChange.
    await page.getByRole('button', { name: /^Salvar$|^Salvo$/ }).click();
    await expect(page.getByText('Texto e arte salvos', { exact: true })).toBeVisible();
    const [saved] = await sql<{ quote: string; caption: string; image: string }>(`select carousel_text->>'quote' quote, caption, rendered_slides->>'slide1' image from user_posts where id='${pid}'`);
    expect(saved.quote).toBe('Frase revisada para publicação');
    expect(saved.caption).toBe('Legenda completamente revisada');
    expect(saved.image).not.toBe(before.s);
    await page.getByRole('button', { name: /Aprovar · Stand-by/ }).click();
    await expect(page.getByText(/Peça aprovada · sem data/)).toBeVisible({ timeout: 30_000 });
    await page.reload();
    await expect(page.getByRole('combobox').first()).toContainText('Aprovado');
    await page.locator('#sched').fill(`${tomorrowKey}T15:00`);
    await expect(page.getByText(/Programado para .*Esta é a versão que será publicada/).first()).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Ver na agenda' }).click();
    await expect(page.getByTestId('piece-panel')).toBeVisible();
    const [pkg] = await sql<{ manifest: { texts: { quote: string; caption: string }; files: Array<{ source_url: string; url: string; sha256: string }> } }>(`select p.manifest from publication_packages p join user_posts u on u.scheduled_package_id=p.id where u.id='${pid}'`);
    expect(pkg.manifest.texts).toMatchObject({ quote: saved.quote, caption: saved.caption });
    expect(pkg.manifest.files[0].source_url).toBe(saved.image);
    const image = await page.request.get(pkg.manifest.files[0].url);
    expect(image.ok()).toBeTruthy();
    expect(createHash('sha256').update(await image.body()).digest('hex')).toBe(pkg.manifest.files[0].sha256);
  });

  test('plano em lote durável: recarregar a página mostra as pendências e retoma só elas (02/T19)', async ({ page }) => {
    const urlA = await uploadE2EImage('e3-plano.jpg', readFileSync('e2e/fixtures/peca-a.jpg'));
    const ok = await piece({ status: 'approved', url: urlA, extra: { title: 'Linha boa', carousel_text: { quote: 'Linha boa' } } });
    const late = await piece({ status: 'approved', url: urlA, extra: { title: 'Linha vencida', carousel_text: { quote: 'Linha vencida' } } });
    await mockEdge(page, 'distribute-schedule', () => ({ success: true, summary: 'Plano E3.', plan: [
      { post_id: ok, date: tomorrowKey, time: '12:00', reason: 'ok' },
      { post_id: late, date: format(addDays(new Date(), -1), 'yyyy-MM-dd'), time: '12:00', reason: 'vencida' },
    ] }));
    await page.goto('/agenda');
    await expect(page.getByTestId('queue-count')).toHaveText('2');
    await page.getByRole('button', { name: 'IA distribuir' }).click();
    await page.getByRole('button', { name: 'Aplicar (2)' }).click();
    await expect(page.getByTestId('plan-row').filter({ hasText: 'Linha boa' })).toHaveAttribute('data-result', 'ok');
    await page.reload();
    await expect(page.getByTestId('queue-count')).toHaveText('1');
    await expect(page.getByTestId('open-plan-banner')).toContainText('1 de 2');
    await page.getByRole('button', { name: 'Retomar pendências' }).click();
    await expect(page.getByTestId('plan-row').filter({ hasText: 'Linha boa' })).toHaveAttribute('data-result', 'ok');
    const lateRow = page.getByTestId('plan-row').filter({ hasText: 'Linha vencida' });
    await lateRow.getByLabel('Nova data e hora').fill(`${tomorrowKey}T16:00`);
    await page.getByRole('button', { name: 'Aplicar pendentes (1)' }).click();
    await expect(page.getByText(/1 agendamento\(s\) confirmado\(s\)\./)).toBeVisible();
    const st = await sql<{ status: string; n: number }>(`select status, count(*)::int n from user_posts where id in ('${ok}','${late}') group by status`);
    expect(st).toEqual([{ status: 'scheduled', n: 2 }]);
    // o mesmo comando da linha boa não foi reaplicado (um comando por linha)
    expect((await sql<{ n: number }>(`select count(*)::int n from schedule_commands where post_id='${ok}'`))[0].n).toBe(1);
    expect((await sql<{ status: string }>(`select status from schedule_plans order by created_at desc limit 1`))[0].status).toBe('done');
    void randomUUID;
  });
});
