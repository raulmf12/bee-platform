import { writeFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { cleanupE2EData, cleanupE2EStorage, seed, sql } from './helpers/admin';
import { mockEdge, mockProduction } from './helpers/mocks';
import { seedAccounts, seedCampaign, seedValidatedContents } from './helpers/fixtures';
import { e2eUser } from './helpers/env';

// F18 — Fase 4 · Conteúdos sequenciais, etapa A (docs/identidade/Hive_Conteudos_Sequenciais_v1.md §12):
// plano de peças (imagem + carrossel na MESMA conta LinkedIn, sem duplicar ao retomar), roteiro aprovado
// antes do visual, reordenar preservando IDs, página editada invalida só o próprio visual, falha retomada
// sem refazer as prontas, aprovação só com a sequência completa, PDF da versão aprovada; regras no banco.
test.describe('F18 · conteúdos sequenciais (carrossel)', () => {
  test.beforeEach(async () => { await cleanupE2EData(); });
  test.afterAll(async () => { await cleanupE2EData(); await cleanupE2EStorage(); });

  // Emula a função sequence-script (inclusive a gravação do roteiro, como o servidor faz).
  async function mockSequence(page: Page) {
    const calls: Array<Record<string, unknown>> = [];
    const { id: uid } = e2eUser();
    await mockEdge(page, 'sequence-script', async (b) => {
      if (b.action === 'script') {
        const pid = String(b.post_id);
        await sql(`delete from post_units where post_id='${pid}';
          insert into post_units (user_id, post_id, position, function, layout, title, body) values
          ('${uid}','${pid}',1,'abertura','cover','Quando o líder resolve tudo, o time aprende a esperar',''),
          ('${uid}','${pid}',2,'situação','text','O pedido chega e já tem dono','Toda dúvida sobe. Toda decisão desce pronta.'),
          ('${uid}','${pid}',3,'comportamento','text','O time para de arriscar','Quem pensa diferente aprende que não vale a pena.'),
          ('${uid}','${pid}',4,'efeito','text','O ciclo se reforça','Quanto mais o líder resolve, menos o time tenta.'),
          ('${uid}','${pid}',5,'síntese','closing','Outra possibilidade','Devolver a pergunta antes de devolver a resposta.');
          update user_posts set caption='Legenda do carrossel.', script_status='draft', narrative_architecture='caso' where id='${pid}';`);
        return { success: true };
      }
      if (b.action === 'adjust_units') {
        const ids = b.unit_ids as string[];
        const rows = await sql<{ id: string; title: string; body: string }>(`select id, title, body from post_units where id in (${ids.map((i) => `'${i}'`).join(',')})`);
        return { success: true, unit_ids: ids, coherence: 'Confira a passagem para a página seguinte.', proposal: { units: rows.map((r) => ({ id: r.id, title: `${r.title} (ajustado)`, body: r.body })) } };
      }
      if (b.action === 'recommend_plan') return { success: true, plans: [] };
      return { success: true, notes: [], ok: true };
    }, calls);
    return calls;
  }

  async function setup() {
    const acc = await seedAccounts();
    const camp = await seedCampaign({ weeks: 8, name: 'Presença Marcos', accountIds: [acc.linkedin, acc.instagram] });
    const [c] = await seedValidatedContents(camp.id, camp.cycleIds[0], [
      { title: 'Quando o líder resolve tudo', channels: [{ account_id: acc.linkedin, platform: 'linkedin' }, { account_id: acc.instagram, platform: 'instagram' }], validationPiece: true },
    ]);
    return { acc, camp, c, cycleId: camp.cycleIds[0] };
  }

  test('plano → roteiro → páginas → retomada → aprovação completa → PDF da versão aprovada', async ({ page }) => {
    test.setTimeout(300_000);
    await mockProduction(page);
    const seqCalls = await mockSequence(page);
    const { acc, camp, c, cycleId } = await setup();

    await page.goto(`/producao?campaign=${camp.id}&cycle=${cycleId}`);
    await expect(page.getByTestId('production-summary')).toBeVisible({ timeout: 120_000 });
    await page.getByRole('button', { name: /Revisar produção/ }).click();

    // plano: o desdobramento padrão (imagem Instagram) virou item de plano com ID próprio
    await page.getByTestId('plan-toggle').click();
    await expect(page.getByTestId('plan-item')).toHaveCount(1);
    // carrossel na MESMA conta LinkedIn da peça de imagem (abordagem diferente)
    await page.getByLabel('Conta da peça').selectOption(acc.linkedin);
    await page.getByLabel('Formato da peça').selectOption('carousel');
    await page.getByLabel('Abordagem da peça').fill('A dinâmica organizacional');
    await page.getByTestId('plan-add').click();
    await expect(page.getByTestId('plan-item')).toHaveCount(2);
    await page.getByTestId('plan-produce').click();
    await expect(page.getByTestId('production-summary')).toBeVisible({ timeout: 120_000 });
    expect(seqCalls.filter((x) => x.action === 'script')).toHaveLength(1);

    // retomar o ciclo não omite nem duplica
    await page.reload();
    await expect(page.getByTestId('production-summary')).toBeVisible({ timeout: 60_000 });
    const pieces = await sql<{ platform: string; format: string; role: string; plan_id: string | null }>(`select platform, format, piece_role role, plan_id from user_posts where content_id='${c.contentId}' and status<>'archived' order by platform, format`);
    expect(pieces).toEqual([
      { platform: 'instagram', format: 'image', role: 'unfold', plan_id: expect.any(String) },
      { platform: 'linkedin', format: 'carousel', role: 'unfold', plan_id: expect.any(String) },
      { platform: 'linkedin', format: 'image', role: 'validation', plan_id: null },
    ]);
    const [carousel] = await sql<{ id: string; account_id: string }>(`select id, account_id from user_posts where content_id='${c.contentId}' and format='carousel'`);
    expect(carousel.account_id).toBe(acc.linkedin);

    // roteiro (antes de qualquer visual)
    await page.getByRole('button', { name: /Revisar produção/ }).click();
    await page.getByTestId('gallery-unit').filter({ has: page.getByTestId('unit-format') }).getByRole('button').first().click();
    await expect(page.getByTestId('sequence')).toHaveAttribute('data-stage', 'script');
    await expect(page.getByTestId('script-unit')).toHaveCount(5);
    const idsBefore = await sql<{ id: string; position: number }>(`select id, position from post_units where post_id='${carousel.id}' order by position`);
    await page.getByLabel('Subir página 3').click();                          // reordenar: IDs preservados
    await expect(page.getByLabel('Título da página 2')).toHaveValue('O time para de arriscar');
    const idsAfter = await sql<{ id: string; position: number }>(`select id, position from post_units where post_id='${carousel.id}' order by position`);
    expect(idsAfter.map((x) => x.id)).toEqual([idsBefore[0].id, idsBefore[2].id, idsBefore[1].id, idsBefore[3].id, idsBefore[4].id]);
    const [noVisual] = await sql<{ n: number }>(`select count(*)::int n from post_units where post_id='${carousel.id}' and rendered_url is not null`);
    expect(noVisual.n).toBe(0);
    // texto que não cabe numa página: a produção falha SÓ nela (retomada depois)
    await sql(`update post_units set body = repeat('Texto longo demais para uma página legível. ', 40) where post_id='${carousel.id}' and position=4`);
    await page.reload();
    await page.getByRole('button', { name: /Revisar produção/ }).click();
    await page.getByTestId('gallery-unit').filter({ has: page.getByTestId('unit-format') }).getByRole('button').first().click();
    await page.getByTestId('script-approve').click();
    await expect(page.getByTestId('sequence')).toHaveAttribute('data-stage', 'visual');

    // direção visual do conjunto antes de renderizar
    await page.getByLabel('Template da capa').selectOption('M01-A');
    await page.getByLabel('Fundo das páginas').selectOption('escuro');
    await page.getByTestId('render-start').click();
    await expect(page.getByTestId('pending-pages')).toContainText('1 página(s) a produzir (4)', { timeout: 120_000 });
    const ready1 = await sql<{ id: string; position: number; rendered_url: string | null; visual_status: string }>(`select id, position, rendered_url, visual_status from post_units where post_id='${carousel.id}' order by position`);
    expect(ready1.map((u) => u.visual_status)).toEqual(['ready', 'ready', 'ready', 'failed', 'ready']);
    await page.getByTestId('page-thumb').nth(3).getByRole('button').click();
    await expect(page.getByTestId('page-error')).toContainText('não cabe');

    // corrigir a página 4 (proposta → aplicar) e produzir SÓ as pendentes
    await page.getByTestId('adjust-open').click();
    await page.getByTestId('adjust-manual').click();
    await page.getByLabel('Novo texto da página').fill('Quanto mais o líder resolve, menos o time tenta.');
    await page.getByTestId('adjust-generate').click();
    await page.getByTestId('candidate-apply').click();
    await expect(page.getByTestId('unit-candidate')).toHaveCount(0);
    await page.getByTestId('render-pending').click();
    await expect.poll(async () => (await sql<{ n: number }>(`select count(*)::int n from post_units where post_id='${carousel.id}' and visual_status<>'ready'`))[0].n, { timeout: 120_000 }).toBe(0);
    await expect(page.getByTestId('render-progress')).toHaveCount(0, { timeout: 30_000 });
    const ready2 = await sql<{ id: string; rendered_url: string; visual_status: string }>(`select id, rendered_url, visual_status from post_units where post_id='${carousel.id}' order by position`);
    expect(ready2.every((u) => u.visual_status === 'ready')).toBe(true);
    for (const i of [0, 1, 2, 4]) expect(ready2[i].rendered_url).toBe(ready1[i].rendered_url);  // prontas não foram refeitas

    // ajustar uma página com a Hive: só ela fica desatualizada; demais preservadas
    await page.getByTestId('page-thumb').nth(1).getByRole('button').click();
    await page.getByTestId('adjust-open').click();
    await page.getByLabel('Pedido de ajuste da sequência').fill('mais concreto');
    await page.getByTestId('adjust-generate').click();
    await expect(page.getByTestId('candidate-unit-title')).toHaveText('O time para de arriscar (ajustado)');
    const [beforeApply] = await sql<{ title: string }>(`select title from post_units where id='${ready2[1].id}'`);
    expect(beforeApply.title).toBe('O time para de arriscar');                // proposta não muda a peça ativa
    await page.getByTestId('candidate-apply').click();
    await expect(page.getByTestId('coherence-flag')).toBeVisible();
    const st = await sql<{ visual_status: string }>(`select visual_status from post_units where post_id='${carousel.id}' order by position`);
    expect(st.map((x) => x.visual_status)).toEqual(['ready', 'stale', 'ready', 'ready', 'ready']);
    await page.getByTestId('render-pending').click();
    await expect.poll(async () => (await sql<{ n: number }>(`select count(*)::int n from post_units where post_id='${carousel.id}' and visual_status<>'ready'`))[0].n, { timeout: 120_000 }).toBe(0);
    await expect(page.getByTestId('render-progress')).toHaveCount(0, { timeout: 30_000 });

    if (process.env.SHOTS) {
      await page.screenshot({ path: `${process.env.SHOTS}/seq-pages.png`, fullPage: true });
      const urls = await sql<{ rendered_url: string }>(`select rendered_url from post_units where post_id='${carousel.id}' order by position`);
      for (const [i, u] of urls.entries()) writeFileSync(`${process.env.SHOTS}/seq-p${i + 1}.jpg`, await (await page.request.get(u.rendered_url)).body());
    }
    // aprovação: incompleta é recusada no banco; completa vincula a versão
    await expect(page.getByTestId('sequence-approve')).toBeDisabled();
    await expect(sql(`select public.approve_sequence('${carousel.id}')`)).rejects.toThrow(/incompleta/);
    await page.getByTestId('pages-approve-all').click();
    await expect(page.getByTestId('sequence-approve')).toBeEnabled();
    await page.getByTestId('sequence-approve').click();
    await expect(page.getByTestId('piece-approved')).toBeVisible();
    const [ap] = await sql<{ status: string; version: number; approved_version: number; slides: number }>(`select status, version, approved_version, (select count(*) from jsonb_object_keys(rendered_slides))::int slides from user_posts where id='${carousel.id}'`);
    expect(ap.status).toBe('approved');
    expect(ap.approved_version).toBe(ap.version);
    expect(ap.slides).toBe(5);                                                  // projeção = sequência completa

    // exportação: PDF (LinkedIn) da versão aprovada, na ordem
    await page.getByRole('button', { name: /Ver produção do ciclo/ }).click();
    await page.getByTestId('gallery-unit').filter({ has: page.getByTestId('unit-format') }).getByRole('button').first().click();
    await expect(page.getByTestId('sequence')).toHaveAttribute('data-stage', 'export');
    await expect(page.getByTestId('publish-panel')).toContainText('documento PDF');   // publicação automática (Fase 5)
    await page.getByTestId('export-run').click();
    await expect(page.getByTestId('export-link')).toContainText(`Baixar PDF · v${ap.version}`, { timeout: 60_000 });
    const [pkg] = await sql<{ kind: string; version: number; pdf_url: string; files: string[] }>(`select export_package->>'kind' kind, (export_package->>'version')::int version, export_package->>'pdf_url' pdf_url, export_package->'files' files from user_posts where id='${carousel.id}'`);
    expect(pkg).toMatchObject({ kind: 'pdf', version: ap.version });
    const order = await sql<{ rendered_url: string }>(`select rendered_url from post_units where post_id='${carousel.id}' order by position`);
    expect(pkg.files).toEqual(order.map((o) => o.rendered_url));
    const pdf = await (await page.request.get(pkg.pdf_url)).body();
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect((pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBe(5);
  });

  test('banco: escopo e preservação dos candidatos, reordenação, invalidação e agendamento', async () => {
    const { id: uid } = e2eUser();
    const pid = await seed('user_posts', { platform: 'instagram', format: 'carousel', status: 'pending_approval', caption: 'Legenda', script_status: 'approved', visual_direction: { numbering: true } });
    const units = await sql<{ id: string }>(`insert into post_units (user_id, post_id, position, layout, title, body, rendered_url, visual_status, review_status, rendered_text_version)
      select '${uid}', '${pid}', g, case when g=1 then 'cover' when g=3 then 'closing' else 'text' end, 'T'||g, 'B'||g, 'https://x.test/'||g||'.jpg', 'ready', 'approved', 1 from generate_series(1,3) g returning id`);
    const [a, b, c] = units.map((u) => u.id);
    const cand = (unitIds: string[], paths: string[], proposal: object) => seed('piece_candidates', {
      post_id: pid, operation_id: crypto.randomUUID(), base_version: 1, action: 'adjust_text', scope: 'units', unit_ids: `{${unitIds.join(',')}}`, mutable_paths: `{${paths.join(',')}}`, preserved: {}, proposal, status: 'ready' });
    const apply = (id: string) => sql(`select (public.apply_unit_candidate('${id}')).version`);

    // página fora da seleção → rejeitada; texto com permissão só de imagem → rejeitada
    await expect(apply(await cand([a], ['text'], { units: [{ id: b, title: 'X' }] }))).rejects.toThrow(/fora da seleção/);
    await expect(apply(await cand([a], ['image'], { units: [{ id: a, title: 'X' }] }))).rejects.toThrow(/texto preservado/);
    // aprovação completa e depois um ajuste válido: só a página A muda e fica desatualizada; aprovação final cai
    await sql(`select public.approve_sequence('${pid}')`);
    expect((await sql<{ status: string }>(`select status from user_posts where id='${pid}'`))[0].status).toBe('approved');
    await apply(await cand([a], ['text'], { units: [{ id: a, title: 'Nova capa' }] }));
    const after = await sql<{ id: string; title: string; visual_status: string; review_status: string; rendered_url: string }>(`select id, title, visual_status, review_status, rendered_url from post_units where post_id='${pid}' order by position`);
    expect(after.map((u) => [u.title, u.visual_status, u.review_status])).toEqual([['Nova capa', 'stale', 'pending'], ['T2', 'ready', 'approved'], ['T3', 'ready', 'approved']]);
    expect(after[0].rendered_url).toBe('https://x.test/1.jpg');               // a imagem não é trocada por reacomodar texto
    const [p1] = await sql<{ status: string; version: number; approved_version: number | null }>(`select status, version, approved_version from user_posts where id='${pid}'`);
    expect(p1).toEqual({ status: 'pending_approval', version: 2, approved_version: null });
    // conflito: proposta sobre a versão antiga
    await expect(apply(await cand([b], ['text'], { units: [{ id: b, title: 'Y' }] }))).rejects.toThrow(/Conflito/);
    // reordenar: IDs e recursos preservados; com numeração, só as páginas que mudaram de posição
    await sql(`select public.reorder_units('${pid}', array['${a}','${c}','${b}']::uuid[])`);
    const ro = await sql<{ id: string; position: number; rendered_url: string; visual_status: string }>(`select id, position, rendered_url, visual_status from post_units where post_id='${pid}' order by position`);
    expect(ro.map((u) => u.id)).toEqual([a, c, b]);
    expect(ro.map((u) => u.rendered_url)).toEqual(['https://x.test/1.jpg', 'https://x.test/3.jpg', 'https://x.test/2.jpg']);
    expect(ro.map((u) => u.visual_status)).toEqual(['stale', 'stale', 'stale']); // capa já estava desatualizada; 2 e 3 trocaram de número
    await expect(sql(`select public.reorder_units('${pid}', array['${a}','${b}']::uuid[])`)).rejects.toThrow(/exatamente as páginas/);
    // peça agendada: mudança posterior não substitui em silêncio o pacote programado
    await sql(`update post_units set rendered_text_version = text_version, visual_status='ready', review_status='approved' where post_id='${pid}'`);
    await sql(`select public.approve_sequence('${pid}')`);
    await sql(`update user_posts set status='scheduled', scheduled_date=now() + interval '3 days' where id='${pid}'`);
    await sql(`update post_units set body='mudou' where id='${b}'`);
    const [sch] = await sql<{ status: string; out: string; sv: number; v: number }>(`select status, metadata->>'scheduled_outdated' out, scheduled_version sv, version v from user_posts where id='${pid}'`);
    expect(sch).toMatchObject({ status: 'scheduled', out: 'true' });
    expect(sch.sv).toBe(sch.v);
  });
});
