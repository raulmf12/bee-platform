import { writeFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { cleanupE2EData, cleanupE2EStorage, seed, sql } from './helpers/admin';
import { mockEdge, mockProduction } from './helpers/mocks';
import { seedAccounts, seedCampaign, seedValidatedContents } from './helpers/fixtures';
import { e2eUser } from './helpers/env';
import { loginAs } from './helpers/tenant';

// F20 — Fase 5 · Stories e distribuição (Conteúdos sequenciais, etapa B): Stories Instagram 9:16 sem
// legenda, publicação automática por formato com verificação prévia do pacote aprovado, registro por
// versão/destino e por unidade; o publicador real confere tudo ANTES de chamar qualquer API externa.
test.describe('F20 · Stories e publicação de sequências', () => {
  test.beforeEach(async () => { await cleanupE2EData(); });
  test.afterAll(async () => { await cleanupE2EData(); await cleanupE2EStorage(); });

  async function mocks(page: Page) {
    const { id: uid } = e2eUser();
    const pubCalls: Array<Record<string, unknown>> = [];
    await mockEdge(page, 'sequence-script', async (b) => {
      if (b.action === 'script') {
        const pid = String(b.post_id);
        await sql(`delete from post_units where post_id='${pid}';
          insert into post_units (user_id, post_id, position, function, layout, title, body, interaction) values
          ('${uid}','${pid}',1,'abertura','cover','Você resolve tudo sozinho?','', null),
          ('${uid}','${pid}',2,'virada','text','O time aprende a esperar','Cada resposta pronta ensina a não tentar.', null),
          ('${uid}','${pid}',3,'pergunta','closing','E se você devolvesse a pergunta?','', '{"type":"enquete","text":"Você já tentou?","execution":"manual"}');
          update user_posts set caption='', script_status='draft' where id='${pid}';`);
        return { success: true };
      }
      return { success: true, notes: [], ok: true, plans: [] };
    });
    await mockEdge(page, 'publish-post', async (b) => {
      const pid = String(b.post_id);
      if (b.dry_run) return { success: true, check: { ok: true, issues: [], plan: ['Story 1', 'Story 2', 'Story 3'], version: 1, units: 3 } };
      const [p] = await sql<{ version: number }>(`select version from user_posts where id='${pid}'`);
      await sql(`with pub as (insert into post_publications (user_id, post_id, version, destination, platform, format, status, stage, units_total, units_published, url)
          values ('${uid}','${pid}',${p.version},'instagram:x','instagram','story','published','confirmed',3,3,'https://www.instagram.com/stories/x/') returning id)
        insert into post_unit_publications (publication_id, user_id, post_id, unit_id, position, status)
          select pub.id, '${uid}', '${pid}', u.id, u.position, 'published' from pub, post_units u where u.post_id='${pid}';
        update user_posts set status='published', published_url='https://www.instagram.com/stories/x/', published_at=now() where id='${pid}';`);
      return { success: true, platform: 'instagram', published_url: 'https://www.instagram.com/stories/x/', published_id: 'x' };
    }, pubCalls);
    return pubCalls;
  }

  test('Stories: plano → roteiro sem legenda → telas 9:16 → aprovação → verificar → publicar (registro por unidade)', async ({ page }) => {
    test.setTimeout(240_000);
    await mockProduction(page);
    const pubCalls = await mocks(page);
    const acc = await seedAccounts();
    const camp = await seedCampaign({ weeks: 8, name: 'Presença Marcos', accountIds: [acc.linkedin, acc.instagram] });
    const [c] = await seedValidatedContents(camp.id, camp.cycleIds[0], [{ title: 'Quando o líder resolve tudo', channels: [{ account_id: acc.linkedin, platform: 'linkedin' }], validationPiece: true }]);
    await page.goto(`/producao?campaign=${camp.id}&cycle=${camp.cycleIds[0]}`);
    await expect(page.getByTestId('production-summary')).toBeVisible({ timeout: 120_000 });
    await page.getByRole('button', { name: /Revisar produção/ }).click();
    await page.getByTestId('plan-toggle').click();
    await page.getByLabel('Conta da peça').selectOption(acc.instagram);
    await page.getByLabel('Formato da peça').selectOption('story');
    await page.getByTestId('plan-add').click();
    await page.getByTestId('plan-produce').click();
    await expect(page.getByTestId('production-summary')).toBeVisible({ timeout: 120_000 });
    await page.getByRole('button', { name: /Revisar produção/ }).click();
    await page.getByTestId('gallery-unit').filter({ has: page.getByTestId('unit-format') }).getByRole('button').first().click();

    await expect(page.getByTestId('sequence')).toHaveAttribute('data-stage', 'script');
    await expect(page.getByLabel('Legenda da sequência')).toHaveCount(0);                 // Stories não têm legenda
    await expect(page.getByTestId('script-unit').nth(2)).toContainText('Interação planejada');
    await page.getByTestId('script-approve').click();
    await page.getByTestId('render-start').click();
    await expect.poll(async () => (await sql<{ n: number }>(`select count(*)::int n from post_units u join user_posts p on p.id=u.post_id where p.content_id='${c.contentId}' and p.format='story' and u.visual_status='ready'`))[0].n, { timeout: 120_000 }).toBe(3);
    const [story] = await sql<{ id: string }>(`select id from user_posts where content_id='${c.contentId}' and format='story'`);
    // telas verticais 9:16
    const [u1] = await sql<{ rendered_url: string }>(`select rendered_url from post_units where post_id='${story.id}' and position=2`);
    const img = await page.request.get(u1.rendered_url);
    const buf = await img.body();
    const dims = await page.evaluate(async (b64) => { const i = new Image(); i.src = `data:image/jpeg;base64,${b64}`; await i.decode(); return [i.naturalWidth, i.naturalHeight]; }, buf.toString('base64'));
    expect(dims).toEqual([1080, 1920]);
    if (process.env.SHOTS) {
      const urls = await sql<{ rendered_url: string }>(`select rendered_url from post_units where post_id='${story.id}' order by position`);
      for (const [i, u] of urls.entries()) writeFileSync(`${process.env.SHOTS}/story-${i + 1}.jpg`, await (await page.request.get(u.rendered_url)).body());
    }

    await page.getByTestId('pages-approve-all').click();
    await page.getByTestId('sequence-approve').click();
    await expect(page.getByTestId('piece-approved')).toBeVisible();
    await page.getByRole('button', { name: /Ver produção do ciclo/ }).click();
    await page.getByTestId('gallery-unit').filter({ has: page.getByTestId('unit-format') }).getByRole('button').first().click();
    await expect(page.getByTestId('publish-panel')).toBeVisible();
    await expect(page.getByTestId('publish-now')).toBeDisabled();                      // só depois de verificar
    await page.getByTestId('publish-check').click();
    await expect(page.getByTestId('publish-check-result')).toContainText('Pronto para publicar a v');
    await page.getByTestId('publish-now').click();
    await expect(page.getByTestId('publication')).toHaveAttribute('data-status', 'published');
    await expect(page.getByTestId('unit-publications').locator('[data-status="published"]')).toHaveCount(3);
    expect(pubCalls.map((x) => !!x.dry_run)).toEqual([true, false]);
  });

  test('publicador real: confere o pacote aprovado inteiro antes de qualquer chamada externa', async () => {
    const { email, password, id: uid } = e2eUser();
    const me = await loginAs(email, password, uid);
    const pid = await seed('user_posts', { platform: 'instagram', format: 'carousel', status: 'pending_approval', caption: 'Legenda', script_status: 'approved' });
    await sql(`insert into post_units (user_id, post_id, position, layout, title, rendered_url, visual_status, review_status, rendered_text_version)
      select '${uid}', '${pid}', g, 'text', 'T'||g, 'https://x.test/'||g||'.jpg', 'ready', 'approved', 1 from generate_series(1,3) g`);
    // não aprovada: recusa sem tocar em nada
    const r0 = await me.fn<{ check: { ok: boolean; issues: string[] } }>('publish-post', { post_id: pid, dry_run: true });
    expect(r0.data.check.ok).toBe(false);
    expect(r0.data.check.issues.join(' ')).toMatch(/versão aprovada/);
    // aprovada: confere capacidade, arquivos e credenciais e devolve o plano — sem publicar
    await sql(`select public.approve_sequence('${pid}')`);
    const r1 = await me.fn<{ check: { ok: boolean; issues: string[]; plan: string[]; units: number; version: number } }>('publish-post', { post_id: pid, dry_run: true });
    expect(r1.data.check.units).toBe(3);
    expect(r1.data.check.issues.join(' ')).toMatch(/Arquivos inacessíveis: páginas 1, 2, 3/);
    expect(r1.data.check.plan.join(' ')).toMatch(/3 contêineres de página/);
    const [st] = await sql<{ status: string; attempts: number | null; pubs: number }>(`select status, publish_attempts attempts, (select count(*)::int from post_publications where post_id='${pid}') pubs from user_posts where id='${pid}'`);
    expect({ ...st, attempts: st.attempts ?? 0 }).toEqual({ status: 'approved', attempts: 0, pubs: 0 });   // verificar não publica nem conta tentativa
    // publicar de verdade com pacote inválido: falha antes de qualquer chamada externa, com motivo registrado
    const r2 = await me.fn('publish-post', { post_id: pid });
    expect(r2.status).toBe(500);
    const [after] = await sql<{ err: string; pubs: number }>(`select publish_error err, (select count(*)::int from post_publications where post_id='${pid}') pubs from user_posts where id='${pid}'`);
    expect(after.err).toMatch(/inacessíveis/);
    expect(after.pubs).toBe(0);
  });

  test('banco: Stories aprovam sem legenda; carrossel continua exigindo', async () => {
    const { id: uid } = e2eUser();
    const mk = async (format: string) => {
      const pid = await seed('user_posts', { platform: 'instagram', format, status: 'pending_approval', caption: '', script_status: 'approved' });
      await sql(`insert into post_units (user_id, post_id, position, layout, title, rendered_url, visual_status, review_status, rendered_text_version)
        select '${uid}', '${pid}', g, 'text', 'T'||g, 'https://x.test/'||g||'.jpg', 'ready', 'approved', 1 from generate_series(1,2) g`);
      return pid;
    };
    const s = await mk('story');
    await sql(`select public.approve_sequence('${s}')`);
    expect((await sql<{ status: string }>(`select status from user_posts where id='${s}'`))[0].status).toBe('approved');
    const c = await mk('carousel');
    await expect(sql(`select public.approve_sequence('${c}')`)).rejects.toThrow(/falta a legenda/);
  });
});
