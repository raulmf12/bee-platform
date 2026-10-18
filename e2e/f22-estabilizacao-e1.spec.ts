import { test, expect, type Locator, type Page } from '@playwright/test';
import { addDays, format } from 'date-fns';
import { cleanupE2EData, seed, sql } from './helpers/admin';
import { mockEdge } from './helpers/mocks';
import { e2eUser } from './helpers/env';
import { loginAs } from './helpers/tenant';

// F22 — Estabilização E1 (docs 01/02 · HIVE-EST-01/02/03/05): publicado é histórico; verificar nunca
// publica; render nulo não aprova; o lote confirma só o que foi gravado.
test.describe('F22 · Estabilização E1', () => {
  test.beforeEach(async () => { await cleanupE2EData(); });
  test.afterAll(async () => { await cleanupE2EData(); });

  const tomorrow = addDays(new Date(), 1);
  const tomorrowKey = format(tomorrow, 'yyyy-MM-dd');

  async function piece(o: { status: string; quote: string; scheduled?: string | null; published_at?: string; extra?: Record<string, unknown> }) {
    return seed('user_posts', {
      platform: 'linkedin', format: 'image', status: o.status, title: o.quote, caption: `Legenda ${o.quote}`,
      carousel_text: { quote: o.quote }, rendered_slides: { slide1: 'https://example.com/x.jpg' },
      scheduled_date: o.scheduled ?? null, published_at: o.published_at ?? null,
      published_url: o.published_at ? 'https://www.linkedin.com/feed/update/x/' : null,
      metadata: { editorial_slug: 'diagnostico-sistemico' }, ...(o.extra ?? {}),
    });
  }

  async function dragInto(page: Page, src: Locator, dst: Locator) {
    const a = (await src.boundingBox())!, b = (await dst.boundingBox())!;
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
    await page.mouse.move(b.x + b.width / 2 + 4, b.y + b.height / 2 + 4, { steps: 4 });
    await page.mouse.up();
  }

  test('banco: publicado não volta a aprovado/agendado nem muda de data; arquivar continua (01/T03)', async () => {
    const { email, password, id } = e2eUser();
    const me = await loginAs(email, password, id);
    const pid = await piece({ status: 'published', quote: 'Já publicada', published_at: new Date().toISOString() });
    for (const patch of [{ status: 'approved' }, { status: 'scheduled', scheduled_date: tomorrow.toISOString() }, { scheduled_date: tomorrow.toISOString() }]) {
      const r = await me.rest<{ message: string }>(`/user_posts?id=eq.${pid}`, { method: 'PATCH', body: JSON.stringify(patch) });
      expect(r.status, JSON.stringify(patch)).toBe(409);
      expect(r.data.message).toMatch(/permanece no histórico/);
    }
    const ar = await me.rest(`/user_posts?id=eq.${pid}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'archived' }) });
    expect(ar.status).toBe(204);
    // arquivado que foi publicado também não volta à fila
    const back = await me.rest(`/user_posts?id=eq.${pid}`, { method: 'PATCH', body: JSON.stringify({ status: 'approved' }) });
    expect(back.status).toBe(409);
  });

  test('agenda: publicado não arrasta para a fila nem abre edição de data (01/T01–T02)', async ({ page }) => {
    const pubAt = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 12, 0).toISOString();
    const pid = await piece({ status: 'published', quote: 'Peça publicada', scheduled: pubAt, published_at: pubAt });
    await page.goto('/agenda');
    await expect(page.getByTestId('queue-count')).toBeVisible();
    await expect(page.getByTestId('agenda-chip').first()).toBeVisible();
    const cell = page.getByTestId(`day-${tomorrowKey}`);
    if (!(await cell.isVisible())) await page.getByRole('button').filter({ has: page.locator('.lucide-chevron-right') }).last().click();
    const chip = cell.getByTestId('agenda-chip').filter({ hasText: 'Peça publicada' });
    await expect(chip).toHaveAttribute('data-locked', 'true');
    await expect(chip).toHaveAttribute('draggable', 'false');
    await dragInto(page, chip, page.getByTestId('queue-count'));
    const [p] = await sql<{ status: string; scheduled_date: string }>(`select status, scheduled_date from user_posts where id='${pid}'`);
    expect(p.status).toBe('published');
    expect(new Date(p.scheduled_date).toISOString()).toBe(pubAt);
    await chip.click();
    await expect(page.getByTestId('panel-history')).toContainText('permanece no histórico');
    await expect(page.getByTestId('panel-move')).toHaveCount(0);
    await expect(page.getByTestId('panel-unschedule')).toHaveCount(0);
  });

  test('verificar não publica: imagem única, publicada e formato sem verificação (01/T11, T13; T04 parcial)', async () => {
    const { email, password, id: uid } = e2eUser();
    const me = await loginAs(email, password, uid);
    // Conta própria com token FALSO: a verificação lê credenciais, mas não chama a rede.
    const [acc] = await sql<{ id: string }>(`insert into social_accounts (user_id, platform, label, status, linkedin_token, linkedin_author_urn)
      values ('${uid}', 'linkedin', 'E2E verificação', 'connected', 'tok-falso', 'urn:li:person:e2e') returning id`);
    const pid = await piece({ status: 'approved', quote: 'Para verificar', extra: { account_id: acc.id } });
    const r = await me.fn<{ check: { ok: boolean; issues: string[]; plan: string[]; units: number } }>('publish-post', { post_id: pid, dry_run: true });
    expect(r.status).toBe(200);
    expect(r.data.check.units).toBe(1);
    expect(r.data.check.issues.join(' ')).toMatch(/inacessível/);       // example.com/x.jpg não existe
    expect(r.data.check.plan.join(' ')).toMatch(/publicar o post/);
    const [st] = await sql<{ status: string; attempts: number | null; err: string | null }>(`select status, publish_attempts attempts, publish_error err from user_posts where id='${pid}'`);
    expect({ ...st, attempts: st.attempts ?? 0 }).toEqual({ status: 'approved', attempts: 0, err: null });   // zero efeitos

    // já publicada: verificar recusa; publicar devolve o resultado conhecido sem nova tentativa
    const done = await piece({ status: 'published', quote: 'Feita', published_at: new Date().toISOString(), extra: { account_id: acc.id } });
    const v = await me.fn<{ check: { ok: boolean; issues: string[] } }>('publish-post', { post_id: done, dry_run: true });
    expect(v.data.check.issues.join(' ')).toMatch(/já foi publicada/);
    const again = await me.fn<{ reused: boolean; published_url: string }>('publish-post', { post_id: done });
    expect(again.status).toBe(200);
    expect(again.data).toMatchObject({ reused: true, published_url: 'https://www.linkedin.com/feed/update/x/' });
    const [d] = await sql<{ attempts: number | null }>(`select publish_attempts attempts from user_posts where id='${done}'`);
    expect(d.attempts ?? 0).toBe(0);
    await sql(`delete from user_posts where account_id='${acc.id}'; delete from social_accounts where id='${acc.id}'`);
  });

  test('editor: Stand-by com imagem final indisponível não aprova (02/T08, T10)', async ({ page }) => {
    // Imagem de IA (M01-D) ainda não aprovada: o export devolve nulo — antes, aprovava assim mesmo.
    const pid = await piece({ status: 'pending_approval', quote: 'Fundo de IA pendente', extra: { rendered_slides: null, visual_decision: { variant: 'M01-D' } } });
    await page.goto(`/posts/${pid}`);
    await page.getByRole('button', { name: /Stand-by/ }).click();
    await expect(page.getByText(/Stand-by não concluído/)).toBeVisible();
    const [p] = await sql<{ status: string }>(`select status from user_posts where id='${pid}'`);
    expect(p.status).toBe('pending_approval');
  });

  test('lote: só conta o que foi gravado; linha vencida fica pendente e é retomada (02/T17–T18)', async ({ page }) => {
    const ok = await piece({ status: 'approved', quote: 'Linha boa' });
    const late = await piece({ status: 'approved', quote: 'Linha vencida' });
    const yesterday = format(addDays(new Date(), -1), 'yyyy-MM-dd');
    await mockEdge(page, 'distribute-schedule', () => ({
      success: true, summary: 'Plano de teste.',
      plan: [{ post_id: ok, date: tomorrowKey, time: '12:00', reason: 'ok' }, { post_id: late, date: yesterday, time: '12:00', reason: 'vencida' }],
    }));
    await page.goto('/agenda');
    await page.getByRole('button', { name: 'IA distribuir' }).click();
    await page.getByRole('button', { name: 'Aplicar (2)' }).click();
    await expect(page.getByText(/1 agendamento\(s\) confirmado\(s\) · 1 precisa\(m\) de nova data/)).toBeVisible();
    await expect(page.getByTestId('plan-row').filter({ hasText: 'Linha boa' })).toHaveAttribute('data-result', 'ok');
    const lateRow = page.getByTestId('plan-row').filter({ hasText: 'Linha vencida' });
    await expect(lateRow).toHaveAttribute('data-result', 'skipped');
    const st = async () => Object.fromEntries((await sql<{ id: string; status: string }>(`select id, status from user_posts where id in ('${ok}','${late}')`)).map((r) => [r.id, r.status]));
    expect(await st()).toEqual({ [ok]: 'scheduled', [late]: 'approved' });
    // ajusta a data da pendente e aplica só ela
    await lateRow.getByLabel('Nova data e hora').fill(`${tomorrowKey}T15:00`);
    await page.getByRole('button', { name: 'Aplicar pendentes (1)' }).click();
    await expect(page.getByText(/1 agendamento\(s\) confirmado\(s\)\./)).toBeVisible();
    expect(await st()).toEqual({ [ok]: 'scheduled', [late]: 'scheduled' });
  });
});
