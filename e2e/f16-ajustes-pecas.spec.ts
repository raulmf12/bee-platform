import { test, expect } from '@playwright/test';
import { cleanupE2EData, cleanupE2EStorage, seed, sql } from './helpers/admin';
import { mockProduction } from './helpers/mocks';
import { seedAccounts, seedCampaign, seedValidatedContents } from './helpers/fixtures';

// F16 — Ajustes e alternativas de peças (docs/identidade/Hive_Ajustes_e_Alternativas_de_Pecas_v1.md):
// candidato sobre a versão-base, preservação validada NO BANCO, conflito de versão e
// agendamento preso à versão programada.
test.describe('F16 · ajustes de peças (candidatos e versões)', () => {
  test.beforeEach(async () => { await cleanupE2EData(); });
  test.afterAll(async () => { await cleanupE2EData(); await cleanupE2EStorage(); });

  const FABRIC = [{ objects: [{ type: 'Image', src: 'https://x.test/foto-a.png' }] }];
  async function piece(extra: Record<string, unknown> = {}) {
    return seed('user_posts', {
      platform: 'instagram', format: 'image', status: 'pending_approval', caption: 'Legenda original',
      carousel_text: { quote: 'Frase original' }, carousel_fabric_json: FABRIC, rendered_slides: { slide1: 'https://x.test/v1.png' },
      visual_decision: { variant: 'M02-A', image_ref: 'https://x.test/foto-a.png' }, ...extra,
    });
  }
  async function candidate(postId: string, mutable: string[], proposal: Record<string, unknown>, base = 1) {
    return seed('piece_candidates', {
      post_id: postId, operation_id: crypto.randomUUID(), base_version: base, action: 'adjust_text', mutable_paths: `{${mutable.join(',')}}`,
      preserved: {}, proposal, status: 'ready',
    });
  }
  const apply = (id: string) => sql<{ version: number }>(`select (public.apply_piece_candidate('${id}')).version`);

  test('banco: preservação rejeita mudança fora dos componentes autorizados', async () => {
    const pid = await piece();
    // ajuste de legenda que "vazou" para a frase → rejeitado
    const c1 = await candidate(pid, ['caption'], { caption: 'Nova legenda', quote: 'Frase trocada' });
    await expect(apply(c1)).rejects.toThrow(/alterou o texto preservado/);
    // troca de template que trocou a imagem → rejeitada
    const c2 = await candidate(pid, ['visual'], { variant: 'M02-B', image_ref: 'https://x.test/foto-b.png', rendered_slides: { slide1: 'https://x.test/v2.png' } });
    await expect(apply(c2)).rejects.toThrow(/trocou a imagem preservada/);
    const [p] = await sql<{ version: number; quote: string; caption: string }>(`select version, carousel_text->>'quote' quote, caption from user_posts where id='${pid}'`);
    expect(p).toEqual({ version: 1, quote: 'Frase original', caption: 'Legenda original' });
    // o permitido passa: só a legenda muda, a imagem fica
    const c3 = await candidate(pid, ['caption'], { caption: 'Nova legenda' });
    expect((await apply(c3))[0].version).toBe(2);
    const [q] = await sql<{ quote: string; caption: string; slide1: string; img: string }>(`select carousel_text->>'quote' quote, caption, rendered_slides->>'slide1' slide1, public.piece_image_ref(visual_decision, carousel_fabric_json) img from user_posts where id='${pid}'`);
    expect(q).toEqual({ quote: 'Frase original', caption: 'Nova legenda', slide1: 'https://x.test/v1.png', img: 'https://x.test/foto-a.png' });
  });

  test('banco: aplicar sobre versão antiga gera conflito; aprovação afetada é invalidada', async () => {
    const pid = await piece({ status: 'approved', text_approved: true, image_approved: true });
    const a = await candidate(pid, ['caption'], { caption: 'Legenda A' });
    const b = await candidate(pid, ['caption'], { caption: 'Legenda B' });
    expect((await apply(a))[0].version).toBe(2);
    await expect(apply(b)).rejects.toThrow(/Conflito/);
    const [p] = await sql<{ caption: string; status: string; text_approved: boolean; image_approved: boolean }>(`select caption, status, text_approved, image_approved from user_posts where id='${pid}'`);
    expect(p).toEqual({ caption: 'Legenda A', status: 'pending_approval', text_approved: false, image_approved: true }); // imagem não mudou: aprovação mantida
    const vers = await sql<{ version: number; caption: string }>(`select version, components->>'caption' caption from piece_versions where post_id='${pid}' order by version`);
    expect(vers).toEqual([{ version: 1, caption: 'Legenda original' }, { version: 2, caption: 'Legenda A' }]);
  });

  test('banco: peça agendada continua presa à versão programada até atualizar', async () => {
    const pid = await piece({ status: 'scheduled', scheduled_date: new Date(Date.now() + 864e5).toISOString() });
    const [s0] = await sql<{ sv: number }>(`select scheduled_version sv from user_posts where id='${pid}'`);
    expect(s0.sv).toBe(1);                                           // agendar fixa a versão
    await apply(await candidate(pid, ['caption'], { caption: 'Legenda nova' }));
    const [s1] = await sql<{ status: string; v: number; sv: number; out: string }>(`select status, version v, scheduled_version sv, metadata->>'scheduled_outdated' out from user_posts where id='${pid}'`);
    expect(s1).toEqual({ status: 'scheduled', v: 2, sv: 1, out: 'true' });
    const [pkg] = await sql<{ caption: string }>(`select components->>'caption' caption from piece_versions where post_id='${pid}' and version=1`);
    expect(pkg.caption).toBe('Legenda original');                  // é este pacote que a publicação usa
    // Estabilização E4: trocar o conteúdo programado não é mais só trocar o número — o comando
    // replace_package fecha um pacote imutável novo (coberto em f25); o atalho antigo recusa explicitamente.
    await expect(sql(`select public.update_scheduled_package('${pid}')`)).rejects.toThrow(/Atualize o conteúdo programado/);
    const [s2] = await sql<{ sv: number; out: string | null }>(`select scheduled_version sv, metadata->>'scheduled_outdated' out from user_posts where id='${pid}'`);
    expect(s2).toEqual({ sv: 1, out: 'true' });
  });

  test('UI: conflito de versão e "Atualizar agendamento" na revisão do ciclo', async ({ page }) => {
    test.setTimeout(180_000);
    await mockProduction(page);
    const acc = await seedAccounts();
    const camp = await seedCampaign({ weeks: 8, name: 'Presença Marcos', accountIds: [acc.linkedin, acc.instagram] });
    await seedValidatedContents(camp.id, camp.cycleIds[0], [{ title: 'Liderar é sustentar a pergunta', channels: [{ account_id: acc.instagram, platform: 'instagram' }] }]);
    await page.goto(`/producao?campaign=${camp.id}&cycle=${camp.cycleIds[0]}`);
    await expect(page.getByTestId('production-summary')).toBeVisible({ timeout: 120_000 });
    const [p] = await sql<{ id: string }>(`select id from user_posts where cycle_id='${camp.cycleIds[0]}' and piece_role='unfold' and status<>'archived' limit 1`);
    await sql(`update user_posts set status='scheduled', scheduled_date=now() + interval '2 days' where id='${p.id}'`);
    await page.reload();
    await page.getByRole('button', { name: /Revisar produção/ }).click();
    await page.getByTestId('gallery-unit').first().getByRole('button').first().click();
    await expect(page.getByTestId('edit-view')).toBeVisible();

    // conflito: a peça muda (outra aba/pessoa) depois da proposta
    await page.getByTestId('action-adjust_text').click();
    await page.getByRole('button', { name: 'Legenda', exact: true }).click();
    await page.getByRole('button', { name: 'Editar eu mesmo' }).click();
    await page.getByLabel('Novo texto').fill('Legenda da proposta velha');
    await page.getByTestId('generate-proposal').click();
    await expect(page.getByTestId('candidate')).toBeVisible();
    await sql(`update user_posts set version = version + 1 where id='${p.id}'`);
    await page.getByTestId('candidate-apply').click();
    await expect(page.getByTestId('candidate-error')).toContainText('mudou');
    await expect(page.getByTestId('candidate-apply')).toBeDisabled();
    await expect.poll(async () => (await sql<{ s: string }>(`select status s from piece_candidates where post_id='${p.id}'`))[0]?.s).toBe('conflict');
    await page.getByTestId('candidate-discard').click();
    const [cur] = await sql<{ caption: string; v: number }>(`select caption, version v from user_posts where id='${p.id}'`);
    expect(cur.caption).not.toBe('Legenda da proposta velha');

    // novo ajuste sobre a versão atual → agendamento fica na versão programada
    await page.reload();
    await page.getByRole('button', { name: /Revisar produção/ }).click();
    await page.getByTestId('gallery-unit').first().getByRole('button').first().click();
    await page.getByTestId('action-adjust_text').click();
    await page.getByRole('button', { name: 'Legenda', exact: true }).click();
    await page.getByRole('button', { name: 'Editar eu mesmo' }).click();
    await page.getByLabel('Novo texto').fill('Legenda nova aplicada');
    await page.getByTestId('generate-proposal').click();
    await page.getByTestId('candidate-apply').click();
    await expect(page.getByTestId('piece-caption')).toHaveText('Legenda nova aplicada');
    await expect(page.getByTestId('schedule-outdated')).toContainText(`v1`);
    await expect(page.getByTestId('schedule-outdated')).toContainText(`v${cur.v + 1}`);
    await page.getByTestId('update-schedule').click();
    await expect(page.getByTestId('schedule-outdated')).toHaveCount(0);
    const [fin] = await sql<{ v: number; sv: number; status: string }>(`select version v, scheduled_version sv, status from user_posts where id='${p.id}'`);
    expect(fin).toEqual({ v: cur.v + 1, sv: cur.v + 1, status: 'scheduled' });
  });
});
