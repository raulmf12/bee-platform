import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { addDays } from 'date-fns';
import { cleanupE2EData, cleanupE2EStorage, overwritePackageFile, seed, sql, uploadE2EImage } from './helpers/admin';
import { e2eUser } from './helpers/env';
import { loginAs, type Tenant } from './helpers/tenant';

// F25 — Estabilização E4: publicação exclusiva consumindo o PACOTE programado. Nenhuma publicação real:
// a conta tem token falso (a LinkedIn recusa no 1º passo, antes da chamada que cria o post).
test.describe('F25 · Publicação exclusiva e versão programada (E4)', () => {
  test.describe.configure({ mode: 'serial' });
  let me: Tenant;
  let acc: string;
  let IMG = '';
  const A = readFileSync('e2e/fixtures/peca-a.jpg');
  const B = readFileSync('e2e/fixtures/peca-b.jpg');
  const inDays = (n: number) => addDays(new Date(), n).toISOString();

  test.beforeAll(async () => {
    await cleanupE2EData();
    const { email, password, id } = e2eUser();
    me = await loginAs(email, password, id);
    await sql(`delete from social_accounts where label='E2E E4'`);
    [{ id: acc }] = await sql<{ id: string }>(`insert into social_accounts (user_id, platform, label, status, linkedin_token, linkedin_author_urn)
      values ('${id}', 'linkedin', 'E2E E4', 'connected', 'tok-falso', 'urn:li:person:e2e-e4') returning id`);
    IMG = await uploadE2EImage('e4-peca.jpg', A);
  });
  test.afterAll(async () => { await cleanupE2EData(); await sql(`delete from social_accounts where label='E2E E4'`); await cleanupE2EStorage(); });

  const piece = (o: { status?: string; extra?: Record<string, unknown> } = {}) => seed('user_posts', {
    platform: 'linkedin', format: 'image', status: o.status ?? 'approved', title: 'Peça E4', caption: 'Legenda programada',
    carousel_text: { quote: 'Frase E4' }, rendered_slides: { slide1: IMG }, account_id: acc, metadata: { editorial_slug: 'diagnostico-sistemico' }, ...(o.extra ?? {}),
  });
  const schedule = async (pid: string, when = inDays(3)) => {
    const r = await me.fn<{ success: boolean; result: { scheduled_package_id: string } }>('schedule-piece', { command_id: randomUUID(), post_id: pid, intent: 'schedule', when });
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    return r.data.result.scheduled_package_id;
  };
  const check = (pid: string) => me.fn<{ check: { ok: boolean; issues: string[]; package_id: string | null; version: number } }>('publish-post', { post_id: pid, dry_run: true });

  test('publicar agora: fecha o pacote, reserva e, com falha antes do envio, libera nova tentativa (01/T10)', async () => {
    const pid = await piece();
    const r = await me.fn<{ details?: string }>('publish-post', { post_id: pid });
    expect(r.status).toBe(500);                                                   // token falso: LinkedIn recusa no registerUpload
    const [op] = await sql<{ stage: string; failure_class: string; package_id: string }>(`select stage, failure_class, package_id from post_publications where post_id='${pid}'`);
    expect(op.stage).toBe('failed_before_send');
    const [pk] = await sql<{ origin: string }>(`select origin from publication_packages where id='${op.package_id}'`);
    expect(pk.origin).toBe('publish_now');
    const [p] = await sql<{ status: string; attempts: number; err: string }>(`select status, publish_attempts attempts, publish_error err from user_posts where id='${pid}'`);
    expect(p).toMatchObject({ status: 'approved', attempts: 1 });
    expect(p.err).toMatch(/LinkedIn/);
  });

  test('em andamento e resultado incerto: nenhuma nova execução (01/T06, T09); conferência pelo produtor', async () => {
    const { id: uid } = e2eUser();
    const pid = await piece({ status: 'scheduled', extra: { scheduled_date: inDays(1) } });
    await sql(`insert into post_publications (user_id, post_id, version, destination, platform, format, status, stage, attempt_id, lease_expires_at)
      values ('${uid}','${pid}',1,'linkedin:urn:li:person:e2e-e4','linkedin','image','in_progress','sending','${randomUUID()}', now() + interval '5 minutes')`);
    // sem pacote (agendamento antigo) a peça nem chega a reservar; com pacote, a reserva ativa barra
    const pkg = await sql<{ id: string }>(`select id from publication_packages limit 0`); void pkg;
    await sql(`update post_publications set lease_expires_at = now() + interval '5 minutes' where post_id='${pid}'`);
    const legacy = await me.fn<{ details?: string }>('publish-post', { post_id: pid });
    expect(JSON.stringify(legacy.data)).toMatch(/confirme o material programado/i);
    // dá um pacote à peça (como a confirmação faria) e tenta de novo: em andamento
    await sql(`delete from post_publications where post_id='${pid}'`);
    const pid2 = await piece();
    const pk2 = await schedule(pid2);
    await sql(`insert into post_publications (user_id, post_id, version, destination, platform, format, status, stage, package_id, attempt_id, lease_expires_at)
      values ('${uid}','${pid2}',1,'linkedin:urn:li:person:e2e-e4','linkedin','image','in_progress','sending','${pk2}','${randomUUID()}', now() + interval '5 minutes')`);
    const busy = await me.fn<{ state: string }>('publish-post', { post_id: pid2 });
    expect(busy.status).toBe(409);
    expect(busy.data.state).toBe('in_progress');
    // o envio "morreu" (prazo vencido durante o envio): vira conferir, nunca reenviar
    await sql(`update post_publications set lease_expires_at = now() - interval '1 minute' where post_id='${pid2}'`);
    const unk = await me.fn<{ state: string; publication_id: string }>('publish-post', { post_id: pid2 });
    expect(unk.status).toBe(409);
    expect(unk.data.state).toBe('needs_reconciliation');
    const resolved = await me.rpc('reconcile_publication', { p_pub: unk.data.publication_id, p_published: true, p_url: 'https://www.linkedin.com/feed/update/conferido/' });
    expect(resolved.status).toBe(200);
    const [p] = await sql<{ status: string; published_url: string }>(`select status, published_url from user_posts where id='${pid2}'`);
    expect(p).toEqual({ status: 'published', published_url: 'https://www.linkedin.com/feed/update/conferido/' });
  });

  test('agendado: editar depois não muda o pacote; verificação usa o pacote e detecta arquivo adulterado (03/T01, T04, T07, T08, T20)', async () => {
    const pid = await piece();
    const pk = await schedule(pid);
    await sql(`update user_posts set caption='Legenda editada depois' where id='${pid}'`);
    const c1 = await check(pid);
    expect(c1.data.check.package_id).toBe(pk);
    expect(c1.data.check.issues).toEqual([]);
    // bytes do arquivo programado trocados (mesma URL): bloqueia antes de qualquer envio
    const [m] = await sql<{ path: string }>(`select manifest->'files'->0->>'path' path from publication_packages where id='${pk}'`);
    await overwritePackageFile(m.path, B);
    const c2 = await check(pid);
    expect(c2.data.check.ok).toBe(false);
    expect(c2.data.check.issues.join(' ')).toMatch(/não corresponde à versão escolhida/);
    const pub = await me.fn('publish-post', { post_id: pid });
    expect(pub.status).toBe(500);
    const [op] = await sql<{ stage: string }>(`select stage from post_publications where post_id='${pid}'`);
    expect(op.stage).toBe('failed_before_send');                                   // nada saiu
    // pacote programado sumiu: interrompe, sem cair na versão atual (EST-06 / 03/T04)
    await sql(`update user_posts set scheduled_package_id = null where id='${pid}'`);
    expect((await check(pid)).data.check.issues.join(' ')).toMatch(/confirme o material programado/i);
  });

  test('editor: alteração fora do agendamento, aprovar a edição e atualizar o conteúdo programado (03/T11–T12, T19)', async ({ page }) => {
    const fabric = { version: '6.0.0', background: '#ffffff', objects: [{ type: 'Rect', version: '6.0.0', left: 100, top: 100, width: 400, height: 300, fill: '#e89a3c' }] };
    const pid = await piece({ extra: { carousel_fabric_json: [fabric] } });
    const pk = await schedule(pid);
    await sql(`update user_posts set caption='Legenda revista' where id='${pid}'`);
    await page.goto(`/posts/${pid}`);
    const card = page.getByTestId('scheduled-package');
    await expect(card.getByTestId('outdated-package')).toBeVisible();
    await card.getByTestId('compare-package').click();
    await expect(card.getByTestId('package-compare')).toContainText('Legenda programada');
    await expect(card.getByTestId('package-compare')).toContainText('Legenda revista');
    await expect(card.getByTestId('replace-package')).toBeDisabled();              // edição ainda não aprovada
    await expect(card).toContainText('Há alterações ainda não aprovadas');
    await expect(page.locator('canvas').first()).toBeVisible();
    await page.waitForTimeout(2500);                                               // canvas hidratado (o aprovar exporta a imagem final)
    await page.getByRole('button', { name: /^Aprovar$/ }).click();
    await expect(page.getByText(/continua agendada/)).toBeVisible({ timeout: 30_000 });
    await expect(card.getByTestId('replace-package')).toBeEnabled();
    await card.getByTestId('replace-package').click();
    await expect(page.getByText('O agendamento agora usa a versão revisada.')).toBeVisible({ timeout: 30_000 });
    const [p] = await sql<{ pkg: string; status: string; caption: string }>(`select scheduled_package_id pkg, status, (select manifest->'texts'->>'caption' from publication_packages where id=scheduled_package_id) caption from user_posts where id='${pid}'`);
    expect(p.pkg).not.toBe(pk);
    expect(p).toMatchObject({ status: 'scheduled', caption: 'Legenda revista' });
    await expect(card.getByTestId('outdated-package')).toHaveCount(0);
  });

  test('agenda: agendamento antigo pede confirmação do material e só então ganha pacote (03/T37–T38)', async ({ page }) => {
    const pid = await piece({ status: 'scheduled', extra: { scheduled_date: inDays(2), title: 'Peça legada', carousel_text: { quote: 'Peça legada' } } });
    await page.goto(`/agenda?focus=${pid}`);
    const panel = page.getByTestId('piece-panel');
    await expect(panel.getByTestId('legacy-package')).toBeVisible();
    await panel.getByTestId('confirm-legacy').click();
    await expect(page.getByText(/Material confirmado/)).toBeVisible({ timeout: 30_000 });
    const [p] = await sql<{ origin: string }>(`select k.origin from user_posts u join publication_packages k on k.id=u.scheduled_package_id where u.id='${pid}'`);
    expect(p.origin).toBe('legacy_confirmed');
  });
});
