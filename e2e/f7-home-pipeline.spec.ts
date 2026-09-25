import { test, expect } from '@playwright/test';
import { addDays } from 'date-fns';
import { cleanupE2EData, cleanupE2EStorage, sql } from './helpers/admin';
import { mockDevelop, mockProduction } from './helpers/mocks';
import { seedAccounts, seedCampaign } from './helpers/fixtures';
import { e2eUser } from './helpers/env';

// F7 — Home regente, Pipeline por ideia/conteúdo, menu novo e "Um conteúdo".
test.describe('F7 · home, pipeline e navegação', () => {
  test.beforeEach(async () => { await cleanupE2EData(); });
  test.afterAll(async () => { await cleanupE2EData(); await cleanupE2EStorage(); });

  const q = (s: string) => s.replace(/'/g, "''");
  const GROUP = '11111111-1111-4111-8111-111111111111'; // alternative_group (uuid)

  async function piece(o: Record<string, string | null | undefined>) {
    const { id: userId } = e2eUser();
    const cols = Object.keys(o).filter((k) => o[k] !== undefined);
    const vals = cols.map((k) => (o[k] === null ? 'null' : k.endsWith('::jsonb') ? `'${o[k]}'::jsonb` : `'${q(o[k]!)}'`));
    const [r] = await sql<{ id: string }>(`insert into user_posts (user_id, format, ${cols.map((c) => c.replace('::jsonb', '')).join(', ')})
      values ('${userId}', 'image', ${vals.join(', ')}) returning id`);
    return r.id;
  }
  async function content(campaignId: string, cycleId: string, title: string, status: string, ideaChannels?: string) {
    const { id: userId } = e2eUser();
    let ideaId = 'null';
    if (ideaChannels) {
      const [i] = await sql<{ id: string }>(`insert into ideas (user_id, campaign_id, cycle_id, title, strategic_function, editorial_slug, channels, suggested_pieces, status, position)
        values ('${userId}','${campaignId}','${cycleId}','${q(title)}','autoridade','diagnostico-sistemico','${ideaChannels}'::jsonb, 2, 'developed', 0) returning id`);
      ideaId = `'${i.id}'`;
    }
    const [c] = await sql<{ id: string }>(`insert into contents (user_id, idea_id, campaign_id, cycle_id, title, strategic_function, editorial_slug, body, status, position)
      values ('${userId}', ${ideaId}, '${campaignId}','${cycleId}','${q(title)}','autoridade','diagnostico-sistemico','{"frase":"Frase de ${q(title)}","texto":"Texto."}'::jsonb,'${status}',0) returning id`);
    return c.id;
  }

  test('home regente: acontecendo, precisa de você (com prazo), próximas publicações; menu novo', async ({ page }) => {
    const acc = await seedAccounts();
    const a = await seedCampaign({ weeks: 8, name: 'Presença Marcos', accountIds: [acc.linkedin, acc.instagram] });
    const b = await seedCampaign({ weeks: 4, name: 'Lançamento Imersão', accountIds: [acc.instagram] });
    const [c1, c2] = a.cycleIds;
    await sql(`update campaign_cycles set status='producing' where id='${c1}'`);
    await sql(`update campaign_cycles set status='pauta_ready' where id='${c2}'`);
    const k = await content(a.id, c1, 'Por que bons líderes repetem velhos padrões?', 'validated', JSON.stringify([{ account_id: acc.linkedin, platform: 'linkedin' }, { account_id: acc.instagram, platform: 'instagram' }]));
    await piece({ platform: 'instagram', status: 'pending_approval', content_id: k, campaign_id: a.id, cycle_id: c1, account_id: acc.instagram, piece_role: 'unfold', alternative_group: GROUP, title: 'Alt 1' });
    await piece({ platform: 'instagram', status: 'pending_approval', content_id: k, campaign_id: a.id, cycle_id: c1, account_id: acc.instagram, piece_role: 'unfold', alternative_group: GROUP, title: 'Alt 2' });
    const t = addDays(new Date(), 1);
    await piece({ platform: 'linkedin', status: 'scheduled', content_id: k, campaign_id: a.id, cycle_id: c1, account_id: acc.linkedin, piece_role: 'validation', title: 'Validação',
      scheduled_date: new Date(t.getFullYear(), t.getMonth(), t.getDate(), 9, 0).toISOString(), 'carousel_text::jsonb': '{"quote":"Frase agendada amanhã"}' });

    await page.goto('/');
    await expect(page.getByTestId('home-greeting')).toContainText('Olá');
    await expect(page.getByTestId('stat-campaigns')).toContainText('2campanhas ativas');
    await expect(page.getByTestId('stat-scheduled')).toContainText('1conteúdo programado');
    await expect(page.getByTestId('stat-production')).toContainText('1em produção');

    const items = page.getByTestId('pending-item');
    await expect(page.getByTestId('pending-count')).toHaveText('3 pendências');
    await expect(items.filter({ hasText: 'Lançamento Imersão' })).toHaveAttribute('data-kind', 'start');
    await expect(page.locator('[data-kind="review"]')).toContainText('1 peça pronta espera sua revisão.');
    await expect(page.locator('[data-kind="pauta"]')).toContainText('A Hive preparou as ideias recomendadas para a próxima semana.');
    await expect(page.locator('[data-kind="pauta"]').getByTestId('pending-due')).toBeVisible();
    await expect(page.getByTestId('upcoming-item')).toHaveCount(1);
    await expect(page.getByTestId('upcoming-item')).toContainText('Amanhã');
    await expect(page.getByTestId('upcoming-item')).toContainText('LinkedIn E2E');
    await expect(page.getByTestId('upcoming-item')).toContainText('Frase agendada amanhã');
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/f7-home.png` });

    // Menu: fluxo principal solto; antigos fora.
    const nav = page.locator('aside nav');
    for (const label of ['Início', 'Campanhas', 'Produção', 'Pipeline', 'Agenda', 'Base Hive', 'Inteligência', 'Configurações']) {
      await expect(nav.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(nav.getByText('Post individual')).toHaveCount(0);
    await expect(nav.getByText('Campanha de conteúdo')).toHaveCount(0);

    // CTA da pendência leva direto ao ponto certo.
    await items.filter({ hasText: 'Lançamento Imersão' }).getByRole('link', { name: /Iniciar produção/ }).click();
    await expect(page).toHaveURL(new RegExp(`/producao\\?campaign=${b.id}&cycle=${b.cycleIds[0]}`));
    await page.getByTestId('nav-create').click();
    await expect(page).toHaveURL(/\/criar$/);
  });

  test('pipeline: 1 card por ideia/conteúdo, colunas, filtros, banner e manifestações', async ({ page }) => {
    const acc = await seedAccounts();
    const a = await seedCampaign({ weeks: 8, name: 'Presença Marcos', accountIds: [acc.linkedin, acc.instagram] });
    const [c1, c2] = a.cycleIds;
    const { id: userId } = e2eUser();
    await sql(`update campaign_cycles set status='producing' where id='${c1}'`);
    await sql(`insert into ideas (user_id, campaign_id, cycle_id, title, strategic_function, editorial_slug, channels, suggested_pieces, origin, status, position)
      values ('${userId}','${a.id}','${c2}','A pergunta que ficou de uma reunião','relacionamento','diagnostico-sistemico','[{"platform":"instagram"}]'::jsonb,1,'hive','proposed',0)`);
    await content(a.id, c1, 'Conteúdo esperando validação', 'pending_validation');
    const both = JSON.stringify([{ account_id: acc.linkedin, platform: 'linkedin' }, { account_id: acc.instagram, platform: 'instagram' }]);
    const kp = await content(a.id, c1, 'A cultura da sua empresa não é o que está no quadro', 'validated', both);
    await piece({ platform: 'linkedin', status: 'approved', content_id: kp, campaign_id: a.id, cycle_id: c1, account_id: acc.linkedin, piece_role: 'validation' });
    await piece({ platform: 'instagram', status: 'pending_approval', content_id: kp, campaign_id: a.id, cycle_id: c1, account_id: acc.instagram, piece_role: 'unfold', alternative_group: GROUP });
    await piece({ platform: 'instagram', status: 'pending_approval', content_id: kp, campaign_id: a.id, cycle_id: c1, account_id: acc.instagram, piece_role: 'unfold', alternative_group: GROUP });
    await piece({ platform: 'instagram', status: 'archived', content_id: kp, campaign_id: a.id, cycle_id: c1, account_id: acc.instagram, piece_role: 'unfold', alternative_group: GROUP });
    const ks = await content(a.id, c1, 'Sua pesquisa de clima mede o quê?', 'validated', JSON.stringify([{ account_id: acc.linkedin, platform: 'linkedin' }]));
    await piece({ platform: 'linkedin', status: 'scheduled', content_id: ks, campaign_id: a.id, cycle_id: c1, account_id: acc.linkedin, scheduled_date: addDays(new Date(), 3).toISOString() });
    await piece({ platform: 'instagram', status: 'published', published_at: new Date().toISOString(), title: 'Post antigo publicado' });

    await page.goto('/pipeline');
    const count = (col: string) => page.getByTestId(`col-${col}`).getByTestId('col-count');
    await expect(count('ideias')).toHaveText('1');
    await expect(count('rascunho')).toHaveText('0');
    await expect(count('pendente')).toHaveText('2');
    await expect(count('aprovado')).toHaveText('0');
    await expect(count('agendado')).toHaveText('1');
    await expect(count('publicado')).toHaveText('1');
    const multi = page.getByTestId('pipeline-card').filter({ hasText: 'A cultura da sua empresa' });
    await expect(multi).toContainText('1 peça para revisar');
    await expect(multi).toContainText('Imagem · Instagram · 2 opções');
    await expect(page.getByTestId('col-ideias')).toContainText('Sugerida pela Hive');
    await expect(page.getByTestId('pipeline-banner')).toContainText('1 peça pronta espera sua revisão.');
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/f7-pipeline.png` });

    // Filtros
    await page.getByLabel('Campanha').selectOption({ label: 'Presença Marcos' });
    await expect(page).toHaveURL(new RegExp(`campaign=${a.id}`));
    await expect(count('publicado')).toHaveText('0');
    await page.getByLabel('Campanha').selectOption({ label: 'Sem campanha' });
    await expect(count('publicado')).toHaveText('1');
    await expect(count('pendente')).toHaveText('0');
    await page.getByLabel('Campanha').selectOption({ label: 'Todas' });
    await page.getByLabel('Canal').selectOption('linkedin');
    await expect(count('ideias')).toHaveText('0');
    await expect(count('agendado')).toHaveText('1');
    await page.getByLabel('Canal').selectOption('all');

    // Descartar uma ideia do backlog direto do card.
    await page.getByTestId('col-ideias').getByTestId('pipeline-card').getByRole('button').first().click();
    page.once('dialog', (d) => void d.accept());
    await page.getByTestId('drawer-discard').click();
    await expect(count('ideias')).toHaveText('0');
    expect((await sql<{ status: string }>(`select status from ideas where title='A pergunta que ficou de uma reunião'`))[0].status).toBe('discarded');

    // Manifestações do conteúdo (sem as alternativas arquivadas) e ida à revisão.
    await multi.getByRole('button').first().click();
    const drawer = page.getByTestId('card-drawer');
    await expect(drawer.getByTestId('drawer-piece')).toHaveCount(3);
    await expect(drawer).toContainText('Frase de A cultura da sua empresa');
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/f7-drawer.png` });
    await drawer.getByRole('link', { name: /Revisar/ }).click();
    await expect(page).toHaveURL(new RegExp(`/producao\\?campaign=${a.id}&cycle=${c1}`));
  });

  test('Criar → Um conteúdo → desenvolver → validar → peças, sempre "Sem campanha"', async ({ page }) => {
    test.setTimeout(180_000);
    await mockDevelop(page);
    await mockProduction(page);
    const acc = await seedAccounts();

    async function createOne(title: string) {
      await page.goto('/criar');
      await page.getByTestId('create-content').click();
      await expect(page).toHaveURL(/\/criar\/conteudo$/);
      await page.getByTestId('one-image').click();
      await page.getByLabel('Título da ideia').fill(title);
      await page.getByLabel('Direção do pensamento').fill('Quem lidera sistemas enxerga padrões antes de pessoas.');
      await expect(page.getByRole('button', { name: /LinkedIn · E2E/ })).toHaveAttribute('aria-pressed', 'true');
      await page.getByRole('button', { name: 'Desenvolver com a Hive' }).click();
      await expect(page).toHaveURL(/\/producao\?campaign=.+&cycle=.+/);
    }

    await createOne('O líder que não delega, controla');
    await expect(page.getByTestId('avulso-card')).toContainText('O líder que não delega, controla');
    await expect(page.getByTestId('step-3')).toContainText('Ideia');
    await expect(page.getByTestId('step-5')).toContainText('Revisão');
    await expect(page.getByTestId('develop-intro')).toContainText('Ideia registrada');
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/f7-avulso.png` });
    await page.getByRole('button', { name: /Desenvolver conteúdos/ }).click();
    await expect(page.getByTestId('validate-counter')).toHaveText('Conteúdo 01 de 01');
    await expect(page.getByTestId('validate-step')).toContainText('Origem: Conteúdo avulso');
    await page.getByRole('button', { name: 'Aprovar conteúdo' }).click();
    await page.getByRole('button', { name: /^Ver resumo/ }).click();
    await page.getByRole('button', { name: /Desenvolver desdobramentos/ }).click();
    await expect(page.getByTestId('review-overview')).toBeVisible({ timeout: 120_000 });

    const camps = await sql<{ id: string; name: string; start_date: string | null }>(`select id, name, start_date from campaigns where metadata->>'kind'='avulso'`);
    expect(camps).toHaveLength(1);
    expect(camps[0]).toMatchObject({ name: 'Sem campanha', start_date: null });
    const [idea] = await sql<{ origin: string; status: string; channels: unknown[] }>(`select origin, status, channels from ideas where campaign_id='${camps[0].id}'`);
    expect(idea).toMatchObject({ origin: 'user', status: 'developed' });
    expect(idea.channels).toHaveLength(2);
    const pieces = await sql<{ platform: string; piece_role: string; account_id: string }>(`select platform, piece_role, account_id from user_posts where campaign_id='${camps[0].id}' and status<>'archived' order by piece_role`);
    expect(pieces.find((p) => p.piece_role === 'validation')).toMatchObject({ platform: 'linkedin', account_id: acc.linkedin });
    expect(pieces.some((p) => p.piece_role === 'unfold' && p.platform === 'instagram')).toBe(true);

    // Não aparece como campanha; no Pipeline, é "Sem campanha".
    await page.goto('/campanhas');
    await expect(page.getByText('Sem campanha')).toHaveCount(0);
    await page.goto('/pipeline');
    await page.getByLabel('Campanha').selectOption({ label: 'Sem campanha' });
    await expect(page.getByTestId('pipeline-card').filter({ hasText: 'O líder que não delega, controla' })).toBeVisible();

    // Um segundo conteúdo reusa o mesmo contêiner (novo "ciclo" só dele).
    await createOne('Reunião boa termina com decisão');
    const again = await sql<{ n: number; cycles: number }>(`select count(distinct c.id)::int as n, count(cy.id)::int as cycles from campaigns c join campaign_cycles cy on cy.campaign_id=c.id where c.metadata->>'kind'='avulso'`);
    expect(again[0]).toEqual({ n: 1, cycles: 2 });
  });
});
