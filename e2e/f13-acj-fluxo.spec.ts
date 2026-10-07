import { test, expect } from '@playwright/test';
import { cleanupE2EData, sql } from './helpers/admin';
import { e2eUser } from './helpers/env';
import { mockAcj, mockCampaignAI, mockDevelop, mockPauta, mockProduction } from './helpers/mocks';
import { seedAccounts, seedAcjPlan, seedApprovedPauta, seedCampaign } from './helpers/fixtures';

// F13 — ACJ ponta a ponta: plano da campanha (aprovação separada) → plano do ciclo →
// pauta com ACJ escolhida antes da ideia → contrato do conteúdo-mãe → herança na peça
// → Registro Vivo. IA mockada; banco, regras e telas reais.
test.describe('F13 · ACJ — fluxo', () => {
  test.beforeEach(async () => { await cleanupE2EData(); });
  test.afterAll(async () => { await cleanupE2EData(); });

  test('wizard: plano ACJ preparado na estratégia definida, aprovação é um clique separado', async ({ page }) => {
    const acjCalls: Array<Record<string, unknown>> = [];
    await mockCampaignAI(page);
    await mockAcj(page, acjCalls);
    await seedAccounts();
    await page.goto('/campanhas/nova');
    await page.getByLabel('Conte para a Hive o que você pretende fazer.').fill('Quero ser referência em liderança sistêmica.');
    await page.getByRole('button', { name: 'Continuar →' }).click();
    await page.getByRole('button', { name: 'Sim, continuar →' }).click();
    await page.getByRole('button', { name: 'Usar estratégia recomendada →' }).click();
    await page.getByRole('button', { name: 'Continuar →' }).click();

    const card = page.getByTestId('wizard-acj');
    await expect(card).toContainText('Esta campanha também possui uma arquitetura relacional');
    await expect(card.getByTestId('acj-plan-status')).toHaveText('Aguardando aprovação');
    await expect(card.getByTestId('acj-mix-ACJ-01')).toContainText('35%');
    expect(acjCalls[0]).toMatchObject({ action: 'campaign_plan', adoption: 'native' });
    expect((acjCalls[0].draft as { strategy: { mix: Record<string, number> } }).strategy.mix.presenca).toBe(35);
    await card.getByTestId('wizard-acj-approve').click();
    await expect(card.getByTestId('acj-plan-status')).toHaveText('Aprovado');
    await page.getByRole('button', { name: 'Ativar campanha →' }).click();
    await expect(page.getByText('Sua campanha começou.')).toBeVisible();

    const { id: uid } = e2eUser();
    const [p] = await sql<{ status: string; approved_by: string; version: number; target_mix: Record<string, number> }>(
      `select p.status, p.approved_by, p.version, p.target_mix from acj_campaign_plans p join campaigns c on c.id=p.campaign_id where c.user_id='${uid}'`);
    expect(p).toMatchObject({ status: 'approved', approved_by: uid, version: 1 });
    expect(Object.values(p.target_mix).reduce((a, b) => a + b, 0)).toBe(100);
  });

  test('detalhe da campanha em andamento: gerar plano (adoção tardia) → ajustar → aprovar', async ({ page }) => {
    const calls = await mockAcj(page);
    const acc = await seedAccounts();
    const camp = await seedCampaign({ weeks: 8, accountIds: [acc.linkedin], cadence: [2] });
    await sql(`update campaigns set start_date = (now() - interval '14 days')::date where id='${camp.id}'`);
    await page.goto(`/campanhas/${camp.id}`);
    const panel = page.getByTestId('acj-campaign-panel');
    await expect(panel.getByTestId('acj-plan-empty')).toContainText('adoção tardia');
    await panel.getByRole('button', { name: /Gerar plano ACJ/ }).click();
    await expect(panel.getByTestId('acj-plan-status')).toHaveText('Aguardando aprovação');
    await expect(panel.getByTestId('acj-plan-late')).toBeVisible();
    expect(calls[0]).toMatchObject({ action: 'campaign_plan', campaign_id: camp.id, adoption: 'late' });

    await panel.getByRole('button', { name: 'Pedir ajuste' }).click();
    await panel.getByLabel('Ajuste do plano ACJ').fill('Mais Conexão antes da abertura');
    await panel.getByRole('button', { name: /Reorganizar/ }).click();
    await expect(panel.getByTestId('acj-plan-journey')).toHaveText('Jornada ajustada com mais Conexão.');
    await expect(panel.getByTestId('acj-plan-versions')).toContainText('v2');

    await panel.getByTestId('acj-approve').click();
    await expect(panel.getByTestId('acj-plan-status')).toHaveText('Aprovado');
    const rows = await sql<{ version: number; status: string; adoption: string; instruction: string | null }>(`select version, status, adoption, instruction from acj_campaign_plans where campaign_id='${camp.id}' order by version`);
    expect(rows).toEqual([
      { version: 1, status: 'archived', adoption: 'late', instruction: null },
      { version: 2, status: 'approved', adoption: 'late', instruction: 'Mais Conexão antes da abertura' },
    ]);
    await panel.getByTestId('acj-plan-toggle').click();
    await expect(panel.getByTestId('acj-phase')).toHaveCount(4);
  });

  test('ciclo: composição ACJ no planejamento → pauta gerada para os movimentos → selos na pauta', async ({ page }) => {
    const calls: Array<Record<string, unknown>> = [];
    await mockPauta(page, calls);
    const acc = await seedAccounts();
    const camp = await seedCampaign({ weeks: 8, accountIds: [acc.linkedin, acc.instagram], cadence: [2, 3] });
    await seedAcjPlan(camp.id);
    await page.goto(`/producao?campaign=${camp.id}&cycle=${camp.cycleIds[0]}`);
    const panel = page.getByTestId('acj-cycle-panel');
    await expect(panel.getByTestId('acj-cycle-rationale')).toContainText('Fase 1');
    await expect(panel.getByTestId('acj-cycle-ACJ-01')).toContainText('2 conteúdos'); // fase 1: 60% de 4
    await expect(page.getByTestId('acj-cycle-unapproved')).toHaveCount(0);

    // ajuste manual: soma precisa bater com os conteúdos
    await page.getByRole('button', { name: 'Ajustar manualmente' }).click();
    await panel.getByRole('button', { name: 'Mais Conexão' }).click();
    await expect(panel.getByTestId('acj-cycle-mismatch')).toContainText('5 de 4');
    await expect(page.getByRole('button', { name: /Confirmar planejamento/ })).toBeDisabled();
    await panel.getByRole('button', { name: 'Menos Reconhecimento' }).click();
    await page.getByRole('button', { name: /Confirmar planejamento e gerar ideias/ }).click();

    await expect(page.getByTestId('pauta-step')).toBeVisible();
    const [cp] = await sql<{ counts: Record<string, number>; campaign_plan_version: number; status: string }>(`select counts, campaign_plan_version, status from acj_cycle_plans where cycle_id='${camp.cycleIds[0]}'`);
    expect(cp.status).toBe('active');
    expect(cp.counts['ACJ-03']).toBe(2); // base da fase 1 (1) + ajuste manual
    expect(cp.counts['ACJ-01']).toBe(1);
    expect(Object.values(cp.counts).reduce((a, b) => a + b, 0)).toBe(4);
    await expect(page.getByTestId('acj-chip')).toHaveCount(4);
    await expect(page.getByTestId('pauta-acj')).toContainText('ACJ-03 Conexão');
    const ideas = await sql<{ acj_primary: string; acj_role: string }>(`select acj_primary, acj_role from ideas where cycle_id='${camp.cycleIds[0]}' and status<>'discarded'`);
    expect(ideas.every((i) => !!i.acj_primary)).toBe(true);

    // ideia da pessoa: ACJ pré-selecionada pelo que falta (ou nenhuma) e editável
    await page.getByRole('button', { name: 'Editar ideia 1' }).click();
    await page.getByLabel('Movimento relacional (ACJ primária)').selectOption('ACJ-05');
    await page.getByLabel('ACJ secundária (opcional)').selectOption('ACJ-02');
    await page.getByRole('button', { name: 'Salvar ideia' }).click();
    await expect(page.getByTestId('idea-acj').first().getByTestId('acj-chip-secondary')).toContainText('ACJ-02');
  });

  test('sem plano ACJ: só avisa — planejamento e pauta continuam funcionando', async ({ page }) => {
    await mockPauta(page);
    const acc = await seedAccounts();
    const camp = await seedCampaign({ weeks: 8, accountIds: [acc.linkedin], cadence: [2] });
    await page.goto(`/producao?campaign=${camp.id}&cycle=${camp.cycleIds[0]}`);
    await expect(page.getByTestId('acj-cycle-noplan')).toBeVisible();
    await page.getByRole('button', { name: /Confirmar planejamento e gerar ideias/ }).click();
    await expect(page.getByTestId('pauta-step')).toBeVisible();
    await expect(page.getByTestId('pauta-acj-missing')).toBeVisible();
    expect(await sql(`select 1 from acj_cycle_plans where cycle_id='${camp.cycleIds[0]}'`)).toHaveLength(0);
  });

  test('conteúdo-mãe: contrato salvo, portão visível, leitura do Marcos e herança na peça', async ({ page }) => {
    const calls: Array<Record<string, unknown>> = [];
    await mockDevelop(page, calls, { acj: true });
    await mockProduction(page);
    const acc = await seedAccounts();
    const camp = await seedCampaign({ weeks: 8, accountIds: [acc.linkedin, acc.instagram], cadence: [2, 3] });
    const [ideaId] = await seedApprovedPauta(camp.id, camp.cycleIds[0], [
      { title: 'Onde isso aparece no seu time?', fn: 'relacionamento', channels: [{ account_id: acc.linkedin, platform: 'linkedin' }] },
    ]);
    await sql(`update ideas set acj_primary='ACJ-02' where id='${ideaId}'`);
    await page.goto(`/producao?campaign=${camp.id}&cycle=${camp.cycleIds[0]}`);
    await page.getByRole('button', { name: /Desenvolver conteúdos/ }).click();

    const box = page.getByTestId('acj-contract');
    await expect(box.getByTestId('acj-chip')).toContainText('ACJ-02 Identificação');
    await expect(box).toContainText('espelhamento por cena concreta');
    await expect(box.getByTestId('acj-gate')).toContainText('Movimento parcial (64/100)');
    await expect(box.getByTestId('acj-gate')).toContainText('Efeito Barnum');
    const [c] = await sql<{ id: string; content_id: string; acj_primary: string; version: number; validation: { score: number } }>(
      `select k.id, k.content_id, k.acj_primary, k.version, k.validation from acj_content_contracts k join contents c on c.id=k.content_id where c.idea_id='${ideaId}'`);
    expect(c).toMatchObject({ acj_primary: 'ACJ-02', version: 1 });
    expect(c.validation.score).toBe(64);

    // a leitura do Marcos qualifica o portão (fonte do Registro Vivo)
    await box.getByTestId('acj-feedback-partial').click();
    await expect(box.getByTestId('acj-feedback-partial')).toHaveAttribute('aria-pressed', 'true');
    const [fb] = await sql<{ marcos_feedback: { realized: string } }>(`select marcos_feedback from acj_content_contracts where id='${c.id}'`);
    expect(fb.marcos_feedback.realized).toBe('partial');

    // nova versão do texto reaproveita o contrato (movimento preservado) e reavalia o portão
    await page.getByRole('button', { name: 'Nova versão' }).click();
    await expect(page.getByTestId('content-frase')).toContainText('(nova versão)');
    expect(calls.at(-1)).toMatchObject({ mode: 'new_version', content_id: c.content_id });
    expect(await sql(`select 1 from acj_content_contracts where content_id='${c.content_id}'`)).toHaveLength(1);

    // aprovar → a peça LinkedIn nasce herdando a ACJ do conteúdo-mãe
    await page.getByRole('button', { name: 'Aprovar conteúdo' }).click();
    await expect(page.getByTestId('content-approved')).toBeVisible();
    const [piece] = await sql<{ acj_primary: string; acj_status: string; acj_snapshot: { contract_id: string } }>(
      `select acj_primary, acj_status, acj_snapshot from user_posts where content_id='${c.content_id}'`);
    expect(piece).toMatchObject({ acj_primary: 'ACJ-02', acj_status: 'inherited' });
    expect(piece.acj_snapshot.contract_id).toBe(c.id);
  });

  test('Registro Vivo: abrir observação → hipótese → evidência → histórico', async ({ page }) => {
    await page.goto('/jornada');
    await page.getByRole('tab', { name: 'Registro Vivo' }).click();
    await page.getByRole('button', { name: 'Nova observação' }).click();
    await page.getByLabel('Título provisório (sem antecipar conclusão)').fill('Comentários em primeira pessoa nas peças de Identificação');
    await page.getByLabel('Fato observado (sem atribuição causal)').fill('3 de 4 peças ACJ-02 tiveram relatos em primeira pessoa.');
    await page.getByRole('button', { name: 'ACJ-02 Identificação' }).click();
    await page.getByRole('button', { name: 'Abrir registro' }).click();
    const year = new Date().getFullYear();
    const detail = page.getByTestId('acj-entry-detail');
    await expect(detail.getByTestId('acj-entry-code')).toHaveText(`ACJL-${year}-001`);
    await expect(detail.getByTestId('acj-entry-status')).toHaveText('Observação aberta');
    await expect(detail.getByTestId('acj-move-validated')).toHaveCount(0); // não pula etapas
    await detail.getByLabel('Hipótese (testável)').fill('Cenas concretas produzem mais autolocalização que listas.');
    await detail.getByLabel('Padrão candidato').click(); // blur salva
    await detail.getByTestId('acj-move-hypothesis').click();
    await expect(detail.getByTestId('acj-entry-status')).toHaveText('Hipótese formulada');
    await detail.getByLabel('Evidência', { exact: true }).fill('Peça de 02/10: 5 relatos situacionais.');
    await detail.getByRole('button', { name: 'Adicionar' }).click();
    await expect(detail).toContainText('Peça de 02/10');
    await expect(detail.getByTestId('acj-entry-history')).toContainText('Observação aberta → Hipótese formulada');
    const [e] = await sql<{ hypothesis: string; acj_ids: string[]; status: string }>(`select hypothesis, acj_ids, status from acj_learning_entries where user_id='${e2eUser().id}'`);
    expect(e).toMatchObject({ status: 'hypothesis', acj_ids: ['ACJ-02'] });
    expect(e.hypothesis).toContain('Cenas concretas');
  });

  test('resultados por ACJ: peça publicada, comentários importados e leitura de sinais', async ({ page }) => {
    await mockAcj(page);
    const acc = await seedAccounts();
    const camp = await seedCampaign({ weeks: 4, accountIds: [acc.instagram], cadence: [2] });
    const { id: uid } = e2eUser();
    const [content] = await sql<{ id: string }>(`insert into contents (user_id, campaign_id, cycle_id, title) values ('${uid}','${camp.id}','${camp.cycleIds[0]}','C') returning id`);
    await sql(`insert into acj_content_contracts (user_id, content_id, acj_primary, audience_state_from, journey_need, movement_to, connection_mechanism) values ('${uid}','${content.id}','ACJ-02','de','n','para','m')`);
    const [post] = await sql<{ id: string }>(`insert into user_posts (user_id, platform, format, status, title, content_id, campaign_id, cycle_id, account_id, published_at)
      values ('${uid}','instagram','image','published','P','${content.id}','${camp.id}','${camp.cycleIds[0]}','${acc.instagram}', now()) returning id`);
    await sql(`insert into post_metrics (user_id, post_id, source, reach, likes, saves) values ('${uid}','${post.id}','instagram_api', 900, 40, 12)`);
    await sql(`insert into post_comments (user_id, post_id, platform, external_id, text, is_own) values
      ('${uid}','${post.id}','instagram','e2e-c1','Isso acontece comigo toda segunda', false), ('${uid}','${post.id}','instagram','e2e-c2','Obrigado!', true)`);
    await page.goto('/jornada');
    await page.getByLabel('Campanha').selectOption(camp.id);
    await expect(page.getByTestId('acj-result-ACJ-02')).toContainText('1');
    await expect(page.getByTestId('acj-result-ACJ-02')).toContainText('Alcance médio 900');
    const row = page.getByTestId('acj-result-row');
    await row.getByRole('button', { name: /1 comentário/ }).click();
    await expect(row.getByTestId('acj-comments')).toContainText('Isso acontece comigo');
    await row.getByTestId('acj-read-signals').click();
    await expect(row.getByTestId('acj-reading')).toContainText('Sinal parcial');
    const [r] = await sql<{ movement_evidence: string }>(`select movement_evidence from acj_signal_readings where post_id='${post.id}'`);
    expect(r.movement_evidence).toBe('partial');
  });

  test('anti-repetição: ideia que ainda parece repetida aparece com aviso na pauta', async ({ page }) => {
    const { mockEdge } = await import('./helpers/mocks');
    const acc = await seedAccounts();
    const camp = await seedCampaign({ weeks: 4, accountIds: [acc.linkedin], cadence: [2] });
    await mockEdge(page, 'cycle-pauta', () => ({ success: true, ideas: [
      { title: 'Ideia nova', summary: 's', strategic_function: 'presenca', editorial_slug: 'provocacao-de-crenca', channels: [{ account_id: acc.linkedin, platform: 'linkedin' }], suggested_pieces: 1, rationale: 'r' },
      { title: 'Ideia repetida', summary: 's', strategic_function: 'presenca', editorial_slug: 'provocacao-de-crenca', channels: [{ account_id: acc.linkedin, platform: 'linkedin' }], suggested_pieces: 1, rationale: 'r',
        repeat_of: { text: 'Buscamos ferramentas complexas para evitar conversas simples. — legenda', said_at: '2026-09-14T12:00:00Z', reason: 'Mesma tese com sinônimos.' } },
    ] }));
    await page.goto(`/producao?campaign=${camp.id}&cycle=${camp.cycleIds[0]}`);
    await page.getByRole('button', { name: /Confirmar planejamento e gerar ideias/ }).click();
    await expect(page.getByTestId('idea-repeat')).toHaveCount(1);
    await expect(page.getByTestId('idea-repeat')).toContainText('Buscamos ferramentas complexas');
    const rows = await sql<{ title: string; repeat_of: { reason: string } | null }>(`select title, repeat_of from ideas where cycle_id='${camp.cycleIds[0]}' order by position`);
    expect(rows.find((r) => r.title === 'Ideia repetida')?.repeat_of?.reason).toBe('Mesma tese com sinônimos.');
    expect(rows.find((r) => r.title === 'Ideia nova')?.repeat_of).toBeNull();
  });

  test('LinkedIn: importar histórico (scraper) → base de posts → memória', async ({ page }) => {
    const { mockEdge } = await import('./helpers/mocks');
    const calls: Array<Record<string, unknown>> = [];
    const mem: Array<Record<string, unknown>> = [];
    let polls = 0;
    await mockEdge(page, 'linkedin-import', (b) => {
      if (b.action === 'start') return { success: true, status: 'RUNNING', run_id: 'r1' };
      polls++;
      return polls < 2 ? { success: true, status: 'RUNNING', done: false } : { success: true, status: 'SUCCEEDED', done: true, found: 120, inserted: 118, skipped: 2 };
    }, calls);
    let pending = 2;
    await mockEdge(page, 'content-memory', () => ({ success: true, added: 40, updated: 0, pending: Math.max(0, --pending) }), mem);
    await seedAccounts();
    await page.goto('/configuracoes');
    await page.getByRole('tab', { name: 'Contas' }).click();
    page.once('dialog', (d) => d.accept('https://www.linkedin.com/in/marcospiccini'));
    await page.getByTestId('li-import-history').click();
    await expect(page.getByTestId('li-import-progress')).toBeVisible();
    await expect(page.getByText(/120 posts encontrados · 118 novos/)).toBeVisible({ timeout: 30_000 });
    expect(calls[0]).toMatchObject({ action: 'start', profile: 'https://www.linkedin.com/in/marcospiccini' });
    expect(mem.length).toBeGreaterThanOrEqual(2);
  });
});

