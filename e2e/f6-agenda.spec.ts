import { test, expect, type Locator, type Page } from '@playwright/test';
import { addDays, format } from 'date-fns';
import { cleanupE2EData, sql } from './helpers/admin';
import { mockEdge } from './helpers/mocks';
import { seedAccounts, seedCampaign } from './helpers/fixtures';
import { e2eUser } from './helpers/env';

// F6 — Tela 13: Agenda orquestradora (timeline, lente, barras, fila priorizada,
// arrasto, painel lateral com sugestões da Hive, IA distribuir por campanha).
test.describe('F6 · agenda orquestradora', () => {
  test.beforeEach(async () => { await cleanupE2EData(); });
  test.afterAll(async () => { await cleanupE2EData(); });

  const tomorrow = addDays(new Date(), 1);
  const tomorrowKey = format(tomorrow, 'yyyy-MM-dd');

  async function piece(o: { campaignId?: string; cycleId?: string; accountId?: string; platform: string; role?: string; quote: string; virality?: number; scheduled?: string }) {
    const { id: userId } = e2eUser();
    const [r] = await sql<{ id: string }>(`insert into user_posts (user_id, platform, format, status, title, caption, carousel_text, text_approved, image_approved,
        campaign_id, cycle_id, account_id, piece_role, virality_score, scheduled_date, rendered_slides, metadata)
      values ('${userId}', '${o.platform}', 'image', '${o.scheduled ? 'scheduled' : 'approved'}', 'Peça', 'Legenda da peça ${o.quote}', '{"quote":"${o.quote}"}'::jsonb, true, true,
        ${o.campaignId ? `'${o.campaignId}'` : 'null'}, ${o.cycleId ? `'${o.cycleId}'` : 'null'}, ${o.accountId ? `'${o.accountId}'` : 'null'},
        ${o.role ? `'${o.role}'` : 'null'}, ${o.virality ?? 'null'}, ${o.scheduled ? `'${o.scheduled}'` : 'null'},
        '{"slide1":"https://example.com/x.jpg"}'::jsonb, '{"editorial_slug":"diagnostico-sistemico"}'::jsonb) returning id`);
    return r.id;
  }

  async function setup() {
    const acc = await seedAccounts();
    const camp = await seedCampaign({ weeks: 8, name: 'Presença Marcos', accountIds: [acc.linkedin, acc.instagram], cadence: [2, 3] });
    const other = await seedCampaign({ weeks: 4, name: 'Lançamento Imersão', accountIds: [acc.instagram] });
    await sql(`update campaigns set color='#8B5CF6', type='vendas' where id='${other.id}'`);
    const c1 = camp.cycleIds[0];
    const unfoldA = await piece({ campaignId: camp.id, cycleId: c1, accountId: acc.instagram, platform: 'instagram', role: 'unfold', quote: 'Desdobramento A', virality: 60 });
    const validation = await piece({ campaignId: camp.id, cycleId: c1, accountId: acc.linkedin, platform: 'linkedin', role: 'validation', quote: 'Peça de validação', virality: 40 });
    const unfoldB = await piece({ campaignId: camp.id, cycleId: c1, accountId: acc.instagram, platform: 'instagram', role: 'unfold', quote: 'Desdobramento B', virality: 90 });
    const unfoldC = await piece({ campaignId: camp.id, cycleId: c1, accountId: acc.instagram, platform: 'instagram', role: 'unfold', quote: 'Desdobramento C', virality: 10 });
    const loose = await piece({ platform: 'instagram', quote: 'Peça avulsa' });
    // Peça do ciclo 3 agendada amanhã às 22h: fora do ciclo e fora do melhor horário.
    const late = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 22, 0).toISOString();
    const misplaced = await piece({ campaignId: camp.id, cycleId: camp.cycleIds[2], accountId: acc.linkedin, platform: 'linkedin', role: 'validation', quote: 'Peça fora do ciclo', scheduled: late });
    return { acc, camp, other, ids: { unfoldA, validation, unfoldB, unfoldC, loose, misplaced } };
  }

  // Arrasto como um usuário: vários movimentos (o 1º dragover re-renderiza a grade).
  async function dragInto(page: Page, src: Locator, dst: Locator) {
    const a = (await src.boundingBox())!, b = (await dst.boundingBox())!;
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
    await page.mouse.move(b.x + b.width / 2 + 4, b.y + b.height / 2 + 4, { steps: 4 });
    await page.mouse.up();
  }

  async function showDay(page: Page, key: string) {
    const cell = page.getByTestId(`day-${key}`);
    if (!(await cell.isVisible())) await page.getByRole('button').filter({ has: page.locator('.lucide-chevron-right') }).last().click();
    await expect(cell).toBeVisible();
    return cell;
  }

  test('lente de campanha, fila priorizada, arrasto, painel e sugestões', async ({ page }) => {
    const { camp, ids } = await setup();
    await page.goto(`/agenda?campaign=${camp.id}`);

    // Lente: cabeçalho, timeline com as 2 campanhas (a outra esmaecida), só as peças da campanha.
    await expect(page.getByTestId('lens-name')).toHaveText('Presença Marcos');
    await expect(page.getByTestId('timeline-campaign')).toHaveCount(2);
    await expect(page.getByTestId('timeline-campaign').filter({ hasText: 'Presença Marcos' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('queue-count')).toHaveText('4');
    await expect(page.getByTestId('queue-group')).toHaveCount(1);

    // Prioridade: a validação abre (Alta), depois viralidade; a última é Menor.
    const items = page.getByTestId('queue-item');
    await expect(items.nth(0)).toContainText('Peça de validação');
    await expect(items.nth(0).getByTestId('queue-priority')).toHaveText('● Alta prioridade');
    await expect(items.nth(1)).toContainText('Desdobramento B');
    await expect(items.nth(1).getByTestId('queue-priority')).toHaveText('● Média prioridade');
    await expect(items.nth(3)).toContainText('Desdobramento C');
    await expect(items.nth(3).getByTestId('queue-priority')).toHaveText('● Menor prioridade');
    await expect(items.nth(0).getByTestId('queue-window')).toContainText('Hive sugere:');

    // Barras da campanha no calendário (só a da lente).
    await expect(page.getByTestId('campaign-bar').first()).toBeVisible();
    expect(await page.getByTestId('campaign-bar').filter({ hasText: 'Lançamento Imersão' }).count()).toBe(0);

    // Sem lente: aparecem a outra campanha e o grupo "Sem campanha".
    await page.getByTestId('lens-all').click();
    await expect(page).not.toHaveURL(/campaign=/);
    await expect(page.getByTestId('queue-count')).toHaveText('5');
    await expect(page.getByTestId('queue-group').last()).toContainText('Sem campanha');
    await page.getByTestId('timeline-campaign').filter({ hasText: 'Presença Marcos' }).click();
    await expect(page).toHaveURL(new RegExp(`campaign=${camp.id}`));

    // Arrastar a 1ª da fila pro dia de amanhã.
    const cell = await showDay(page, tomorrowKey);
    await dragInto(page, items.nth(0), cell);
    await expect(page.getByTestId('queue-count')).toHaveText('3');
    await expect.poll(async () => (await sql<{ status: string; d: string }>(`select status, to_char(scheduled_date at time zone 'America/Sao_Paulo','YYYY-MM-DD') as d from user_posts where id='${ids.validation}'`))[0])
      .toEqual({ status: 'scheduled', d: tomorrowKey });

    // Painel lateral da peça mal posicionada: contexto + sugestões da Hive.
    await cell.getByRole('button', { name: /Peça fora do ciclo/ }).click();
    const panel = page.getByTestId('piece-panel');
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId('panel-campaign')).toHaveText('Presença Marcos');
    await expect(panel).toContainText('Ciclo 03');
    const tips = panel.getByTestId('panel-suggestion');
    await expect(tips).toHaveCount(2);
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/f6-panel.png` });
    await expect(tips.filter({ hasText: 'Publicar às 08:00' })).toBeVisible();
    await tips.filter({ hasText: 'Publicar às 08:00' }).getByRole('button', { name: 'Aplicar' }).click();
    await expect.poll(async () => (await sql<{ t: string }>(`select to_char(scheduled_date at time zone 'America/Sao_Paulo','HH24:MI') as t from user_posts where id='${ids.misplaced}'`))[0].t).toBe('08:00');
    await expect(panel.getByTestId('panel-suggestion')).toHaveCount(1);
    await panel.getByTestId('panel-suggestion').getByRole('button', { name: 'Aplicar' }).click();
    const [cyc3] = await sql<{ start_date: string }>(`select start_date::text from campaign_cycles where id='${camp.cycleIds[2]}'`);
    await expect.poll(async () => (await sql<{ d: string }>(`select to_char(scheduled_date at time zone 'America/Sao_Paulo','YYYY-MM-DD') as d from user_posts where id='${ids.misplaced}'`))[0].d).toBe(cyc3.start_date);
    await expect(panel.getByTestId('panel-suggestions')).toHaveCount(0);
    await panel.getByTestId('panel-full').click();
    await expect(panel.getByTestId('panel-full')).toHaveText('Ver resumo');
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);

    // Remover da agenda devolve pra fila.
    await cell.getByRole('button', { name: /Peça de validação/ }).click();
    await page.getByTestId('panel-unschedule').click();
    await expect(page.getByTestId('queue-count')).toHaveText('4');
    const [back] = await sql<{ status: string; scheduled_date: string | null }>(`select status, scheduled_date from user_posts where id='${ids.validation}'`);
    expect(back).toEqual({ status: 'approved', scheduled_date: null });
    if (process.env.SHOTS) {
      await page.getByRole('button', { name: 'Semana', exact: true }).click();
      await page.screenshot({ path: `${process.env.SHOTS}/f6-week.png` });
    }
  });

  test('IA distribuir envia prioridade/janela/campanha e aplica o plano', async ({ page }) => {
    const { camp, ids } = await setup();
    const calls: Array<Record<string, unknown>> = [];
    await mockEdge(page, 'distribute-schedule', (body) => {
      const standby = body.standby as Array<{ id: string; window_start: string }>;
      return {
        success: true, summary: 'Plano por prioridade.',
        plan: standby.map((s) => ({ post_id: s.id, date: s.window_start > tomorrowKey ? s.window_start : tomorrowKey, time: '12:00', reason: 'Dentro da janela sugerida' })),
      };
    }, calls);
    await page.goto(`/agenda?campaign=${camp.id}`);
    await expect(page.getByTestId('queue-count')).toHaveText('4');
    await page.getByRole('button', { name: 'IA distribuir' }).click();
    await expect(page.getByRole('button', { name: 'Aplicar (4)' })).toBeVisible();

    expect(calls).toHaveLength(1);
    const standby = calls[0].standby as Array<Record<string, unknown>>;
    expect(standby).toHaveLength(4); // a lente limita à campanha
    const v = standby.find((s) => s.id === ids.validation)!;
    expect(v).toMatchObject({ campaign_name: 'Presença Marcos', priority: 1, priority_label: 'Alta' });
    expect(v.window_start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(v.window_end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(standby.find((s) => s.id === ids.unfoldC)).toMatchObject({ priority_label: 'Menor' });

    await page.getByRole('button', { name: 'Aplicar (4)' }).click();
    await expect(page.getByTestId('queue-count')).toHaveText('0');
    const rows = await sql<{ n: number }>(`select count(*)::int as n from user_posts where campaign_id='${camp.id}' and status='scheduled'`);
    expect(rows[0].n).toBe(5); // 4 da fila + a já agendada
    const [loose] = await sql<{ status: string }>(`select status from user_posts where id='${ids.loose}'`);
    expect(loose.status).toBe('approved'); // fora da lente, intocada
  });
});
