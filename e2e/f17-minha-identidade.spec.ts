import { test, expect, type Page } from '@playwright/test';
import { cleanupE2EData, sql } from './helpers/admin';
import { e2eUser } from './helpers/env';
import { mockEdge } from './helpers/mocks';
import { seedIdentityBrand } from './helpers/fixtures';

// F17 — Fase 3 · Minha identidade (Guia de implementação §3–§10), sempre numa MARCA DE TESTE
// isolada (workspace e2e-*): revisão com propostas por bloco, edição direta, retomada,
// calibração com perfil em rascunho, ativação por versão com alcance; recalibração que não
// altera os outros perfis; conflito de versão-base.
test.describe('F17 · Minha identidade', () => {
  test.beforeEach(async () => { await cleanupE2EData(); });
  test.afterAll(async () => { await cleanupE2EData(); });

  type B = Awaited<ReturnType<typeof seedIdentityBrand>> & { profileA: string };

  async function mockSetup(page: Page, b: B, proposals: Record<string, unknown>, questions: Array<{ id: string; text: string; why: string }> = []) {
    const calls: Array<Record<string, unknown>> = [];
    await mockEdge(page, 'identity-setup', async (body) => {
      if (body.action === 'next_question') {
        // Sem estado, como o servidor: a próxima pergunta é a primeira ainda não respondida.
        const [row] = await sql<{ answers: Array<{ question_id: string }> }>(`select answers from setup_sessions where id='${body.session_id}'`);
        const q = questions.find((x) => !(row?.answers ?? []).some((a) => a.question_id === x.id));
        return q ? { success: true, question: q, done: false } : { success: true, question: null, done: true };
      }
      return { success: true, proposal: { status: 'proposed', generated_at: new Date().toISOString(), ...(proposals[String(body.block)] as object) } };
    }, calls);
    return calls;
  }
  // "Continuar" e espera a etapa seguinte (evita clicar no botão da etapa anterior).
  async function nextTo(page: Page, step: string) {
    await page.getByTestId('step-next').click();
    await expect(page.getByTestId('setup-session')).toHaveAttribute('data-step', step);
  }

  test('revisão: entra pela visão atual, conversa, retoma, propõe por bloco, calibra e ativa a nova versão', async ({ page }) => {
    test.setTimeout(180_000);
    const b = await seedIdentityBrand() as B;
    // campanha em andamento no perfil A: "só novas criações" deve prendê-la na v1
    const { id: uid } = e2eUser();
    const [{ id: campId }] = await sql<{ id: string }>(`insert into campaigns (user_id, name, type, status, profile_id, cadence, metadata) values ('${uid}', 'Campanha A', 'organica', 'active', '${b.profileA}', '{}', '{}') returning id`);
    const proposals = {
      fronts: { summary: 'Nova frente C.', items: [
        { ref: b.frontA, action: 'keep', origin: 'legacy', name: 'Frente A' },
        { ref: 'new:c', action: 'create', origin: 'declared', name: 'Frente C', description: 'Mentoria', territories: ['Decisão'] },
      ] },
      audiences: { summary: 'A1 ganha definição.', hypotheses: ['Núcleo de A1 ainda a validar'], items: [
        { ref: b.audA1, action: 'update', origin: 'declared', name: 'Público A1', definition: 'Quem lidera mudanças pequenas', changes: ['definição: Quem aprende → Quem lidera mudanças pequenas'] },
        { ref: 'new:audc', action: 'create', origin: 'hypothesis', front_ref: 'new:c', name: 'Público C', definition: 'Quem quer mentoria', status: 'hypothesis' },
      ] },
      profiles: { summary: 'Perfil novo para a frente C.', items: [
        { ref: b.profileA, action: 'update', origin: 'declared', name: 'Frente A · Autora · A1', positioning: 'Posicionamento A revisado' },
        { ref: b.profileB, action: 'keep', origin: 'legacy', name: 'Frente B · Autora · B1' },
        { ref: 'new:pc', action: 'create', origin: 'hypothesis', name: 'Frente C · Autora · C', emitter_ref: b.emitterId, front_ref: 'new:c', primary_audience_ref: 'new:audc', positioning: 'Mentoria prática', status: 'active' },
      ] },
      editorials: { summary: 'Uma editoria para a frente C.', items: [
        { ref: 'new:ed', action: 'create', origin: 'hypothesis', name: `Decisões ${b.tag}`, objetivo: 'Ajudar a decidir', territorio: 'Decisão', front_ref: 'new:c', perguntas: ['O que trava a decisão?'], exemplo: 'Pauta exemplo' },
      ] },
    };
    const calls = await mockSetup(page, b, proposals, [{ id: 'q1', text: 'Quem você quer priorizar primeiro?', why: 'O núcleo do público ainda é hipótese.' }]);
    const gen: Array<Record<string, unknown>> = [];
    await mockEdge(page, 'generate-content', () => ({ success: true, quote: 'Amostra calibrada', caption: 'Legenda calibrada', variations: [{ quote: 'Amostra calibrada', caption: 'Legenda calibrada' }] }), gen);

    // 1. visão atual (legado carregado)
    await page.goto(`/identidade?marca=${b.brandId}`);
    await expect(page.getByTestId('current-profiles')).toContainText('Frente A · Autora · A1');
    await expect(page.getByTestId('current-profiles')).toContainText('Frente B · Autora · B1');
    await expect(page.getByTestId('pending-review')).toContainText('Público "Público A1" ainda é hipótese');
    await page.getByTestId('entry-review').click();

    // 2. o que mudou
    await expect(page.getByTestId('setup-session')).toHaveAttribute('data-step', 'targets');
    await page.getByTestId('target-publico').click();
    await page.getByTestId('target-frente').click();
    await nextTo(page, 'conversation');

    // 3. conversa guiada (uma pergunta por vez, com o porquê)
    await expect(page.getByTestId('question-text')).toHaveText('Quem você quer priorizar primeiro?');
    await expect(page.getByTestId('question')).toContainText('O núcleo do público ainda é hipótese.');
    await page.getByLabel('Sua resposta').fill('Quem lidera mudanças pequenas no dia a dia.');
    await page.getByTestId('answer-send').click();
    await expect(page.getByTestId('conversation-done')).toBeVisible();
    await nextTo(page, 'materials');

    // salvar, sair e retomar no mesmo ponto
    await page.getByTestId('save-exit').click();
    await expect(page.getByTestId('entry-continue')).toContainText('Materiais');
    await page.getByTestId('entry-continue').click();
    await expect(page.getByTestId('setup-session')).toHaveAttribute('data-step', 'materials');
    const [sess] = await sql<{ id: string; answers: Array<{ answer: string }>; targets: string[] }>(`select id, answers, targets from setup_sessions where brand_id='${b.brandId}'`);
    expect(sess.answers[0].answer).toBe('Quem lidera mudanças pequenas no dia a dia.');
    expect(sess.targets.sort()).toEqual(['frente', 'publico']);

    // 4. materiais (referência atual × histórico)
    await page.getByLabel('Título do material').fill('Post de referência');
    await page.getByLabel('Texto do material').fill('Texto que representa bem a frente C.');
    await page.getByTestId('source-add').click();
    await expect(page.getByTestId('source')).toContainText('referência atual');
    await nextTo(page, 'understanding');

    // 5. o que a Hive entendeu: frentes e públicos (origem visível; nada ativado)
    await page.getByTestId('propose-fronts').click();
    await expect(page.getByTestId('block-fronts')).toContainText('Frente C');
    await page.getByTestId('accept-fronts').click();
    await expect(page.getByTestId('block-fronts').getByTestId('block-accepted')).toBeVisible();
    await page.getByTestId('propose-audiences').click();
    await expect(page.getByTestId('block-audiences').getByTestId('origin-tag').first()).toHaveText('Declarado');
    await expect(page.getByTestId('block-hypotheses')).toContainText('Núcleo de A1 ainda a validar');
    await page.getByTestId('accept-audiences').click();
    await expect(page.getByTestId('block-audiences').getByTestId('block-accepted')).toBeVisible();
    const [a1Before] = await sql<{ definition: string }>(`select definition from audiences where id='${b.audA1}'`);
    expect(a1Before.definition).toBe('Quem aprende');                 // proposta não sobrescreve antes de ativar
    expect(calls.filter((c) => c.action === 'propose').map((c) => c.block)).toEqual(['fronts', 'audiences']);
    await nextTo(page, 'profiles');

    // 6. perfis: edição direta vira "declarado"
    await page.getByTestId('propose-profiles').click();
    const itemA = page.getByTestId('block-profiles').getByTestId('proposal-item').filter({ hasText: 'Frente A · Autora · A1' });
    await itemA.getByTestId('item-edit').click();
    await page.getByLabel('Posicionamento').fill('Posicionamento A editado à mão');
    await page.getByTestId('item-save').click();
    await expect(itemA).toContainText('Posicionamento A editado à mão');
    await expect(page.getByTestId('block-profiles').getByTestId('proposal-item').filter({ hasText: 'Frente C · Autora · C' }).getByTestId('profile-composition')).toHaveText('Autora Teste · Frente C · Público C');
    await page.getByTestId('accept-profiles').click();
    await expect(page.getByTestId('block-profiles').getByTestId('block-accepted')).toBeVisible();
    await nextTo(page, 'editorials');

    // 7. editorias
    await page.getByTestId('propose-editorials').click();
    await page.getByTestId('accept-editorials').click();
    await expect(page.getByTestId('block-editorials').getByTestId('block-accepted')).toBeVisible();
    await nextTo(page, 'calibration');

    // 8. calibração com o perfil EM RASCUNHO
    await page.getByLabel('Perfil da amostra').selectOption('new:pc');
    await page.getByLabel('Tema da amostra').fill('decidir sem garantias');
    await page.getByTestId('calibrate-generate').click();
    await expect(page.getByTestId('calibration-quote')).toHaveText('Amostra calibrada');
    expect(gen.at(-1)).toMatchObject({ editorial_slug: b.editorialSlug, calibration: { profile_ref: 'new:pc' } });
    await page.getByLabel('Feedback: Linguagem').fill('ok');
    await page.getByLabel('Lição para este perfil').fill('Na frente C, comece pela decisão concreta.');
    await page.getByLabel('Guardar como aprendizado deste perfil').check();
    await page.getByTestId('calibration-feedback-save').click();
    await expect(page.getByTestId('calibration-feedback-done')).toBeVisible();
    await nextTo(page, 'activate');

    // 9. ativar: impacto e alcance
    await expect(page.getByTestId('activate-impact')).toContainText('Frente A · Autora · A1');
    await expect(page.getByTestId('activate-impact')).toContainText('Campanha A');
    const [pa0] = await sql<{ version: number }>(`select version from communication_profiles where id='${b.profileA}'`);
    expect(pa0.version).toBe(1);
    await page.getByTestId('activate').click();
    await expect(page.getByTestId('setup-done')).toBeVisible();
    await expect(page.getByTestId('done-versions')).toContainText('v1 → v2');

    // banco: versões, entidades, editoria, lição com escopo, campanha presa, PB intocado
    const [pa] = await sql<{ version: number; positioning: string }>(`select version, positioning from communication_profiles where id='${b.profileA}'`);
    expect(pa).toEqual({ version: 2, positioning: 'Posicionamento A editado à mão' });
    const vers = await sql<{ version: number; status: string; pos: string }>(`select version, status, data->'profile'->>'positioning' pos from communication_profile_versions where profile_id='${b.profileA}' order by version`);
    expect(vers).toEqual([{ version: 1, status: 'superseded', pos: 'Posicionamento A' }, { version: 2, status: 'active', pos: 'Posicionamento A editado à mão' }]);
    const [pb] = await sql<{ version: number }>(`select version from communication_profiles where id='${b.profileB}'`);
    expect(pb.version).toBe(1);
    const [pc] = await sql<{ id: string; status: string; version: number; front: string; aud: string }>(`select p.id, p.status, p.version, f.name front, a.name aud from communication_profiles p
      join business_fronts f on f.id=p.front_id join audiences a on a.id=p.primary_audience_id where p.brand_id='${b.brandId}' and p.name='Frente C · Autora · C'`);
    expect(pc).toMatchObject({ status: 'active', version: 1, front: 'Frente C', aud: 'Público C' });
    const [a1] = await sql<{ definition: string }>(`select definition from audiences where id='${b.audA1}'`);
    expect(a1.definition).toBe('Quem lidera mudanças pequenas');
    const [ed] = await sql<{ curation_status: string; front: string; brand_id: string }>(`select e.curation_status, f.name front, e.brand_id from bee_editorials e join business_fronts f on f.id=e.front_id where e.name='Decisões ${b.tag}'`);
    expect(ed).toEqual({ curation_status: 'testing', front: 'Frente C', brand_id: b.brandId });
    const [lesson] = await sql<{ profile_id: string; brand_id: string }>(`select profile_id, brand_id from ai_learnings where texto='Na frente C, comece pela decisão concreta.'`);
    expect(lesson).toEqual({ profile_id: pc.id, brand_id: b.brandId });
    const [camp] = await sql<{ profile_version: number }>(`select profile_version from campaigns where id='${campId}'`);
    expect(camp.profile_version).toBe(1);
    const [done] = await sql<{ status: string }>(`select status from setup_sessions where id='${sess.id}'`);
    expect(done.status).toBe('done');
  });

  test('recalibrar só o perfil A: B continua na versão anterior e o público compartilhado é copiado; conflito de versão-base', async ({ page }) => {
    test.setTimeout(120_000);
    const b = await seedIdentityBrand({ sharedAudience: true }) as B;
    await mockSetup(page, b, {
      audiences: { items: [{ ref: b.audA1, action: 'update', origin: 'declared', name: 'Público A1', definition: 'Transformadores em início de jornada' }] },
      profiles: { items: [
        { ref: b.profileA, action: 'update', origin: 'declared', name: 'Frente A · Autora · A1', expression: 'Expressão A recalibrada' },
        { ref: b.profileB, action: 'update', origin: 'hypothesis', name: 'Frente B · Autora · B1', expression: 'NÃO deveria mudar' }, // o banco ignora fora do alvo
      ] },
    });
    await page.goto(`/identidade?marca=${b.brandId}`);
    await page.getByTestId('profile-card').filter({ hasText: 'Frente A · Autora · A1' }).getByTestId('profile-recalibrate').click();
    await expect(page.getByTestId('setup-session')).toHaveAttribute('data-step', 'targets');
    await expect(page.getByTestId('target-identidade')).toHaveCount(0);       // recalibração não mexe na identidade da marca
    await page.getByTestId('target-publico').click();
    await nextTo(page, 'conversation');
    await expect(page.getByTestId('conversation-done')).toBeVisible();
    await nextTo(page, 'materials');
    await nextTo(page, 'understanding');  // materiais (opcional)
    await page.getByTestId('propose-audiences').click();
    await page.getByTestId('accept-audiences').click();
    await expect(page.getByTestId('block-audiences').getByTestId('block-accepted')).toBeVisible();
    await nextTo(page, 'profiles');
    await page.getByTestId('propose-profiles').click();
    await page.getByTestId('accept-profiles').click();
    await expect(page.getByTestId('block-profiles').getByTestId('block-accepted')).toBeVisible();
    await nextTo(page, 'calibration');  // recalibração pula editorias
    await page.getByTestId('calibration-skip').click();
    await nextTo(page, 'activate');
    await expect(page.getByTestId('activate-impact')).toContainText('Os outros perfis continuam na versão atual');

    // outra sessão mudou o perfil A no meio: conflito, nada é aplicado
    await sql(`update communication_profiles set version = 5 where id='${b.profileA}'`);
    await page.getByTestId('activate').click();
    await expect(page.getByText(/Conflito: o perfil foi alterado/)).toBeVisible();
    const [still] = await sql<{ expression: string }>(`select expression from communication_profiles where id='${b.profileA}'`);
    expect(still.expression).toBe('Expressão A');
    await sql(`update communication_profiles set version = 1 where id='${b.profileA}'`);

    await page.getByTestId('activate').click();
    await expect(page.getByTestId('setup-done')).toBeVisible();
    const [pa] = await sql<{ version: number; expression: string; aud: string; def: string }>(`select p.version, p.expression, p.primary_audience_id aud, a.definition def from communication_profiles p join audiences a on a.id=p.primary_audience_id where p.id='${b.profileA}'`);
    expect(pa).toMatchObject({ version: 2, expression: 'Expressão A recalibrada', def: 'Transformadores em início de jornada' });
    expect(pa.aud).not.toBe(b.audA1);                                          // cópia do público compartilhado
    const [pb] = await sql<{ version: number; expression: string; sec: string[] }>(`select version, expression, secondary_audience_ids sec from communication_profiles where id='${b.profileB}'`);
    expect(pb).toEqual({ version: 1, expression: 'Expressão B', sec: [b.audA1] });
    const [a1] = await sql<{ definition: string }>(`select definition from audiences where id='${b.audA1}'`);
    expect(a1.definition).toBe('Quem aprende');                                // o original segue servindo o perfil B
    const vb = await sql(`select 1 from communication_profile_versions where profile_id='${b.profileB}'`);
    expect(vb).toHaveLength(1);
  });

  test('marca nova sem identidade: oferece "Configurar minha identidade" sem preencher nada por padrão', async ({ page }) => {
    const b = await seedIdentityBrand({ empty: true });
    await page.goto(`/identidade?marca=${b.brandId}`);
    await expect(page.getByTestId('entry-setup')).toBeVisible();
    await expect(page.getByTestId('entry-review')).toHaveCount(0);
    await expect(page.getByTestId('current-profiles')).toHaveCount(0);
  });

  test('menu leva a Minha identidade e o perfil mostra o histórico de versões', async ({ page }) => {
    const b = await seedIdentityBrand() as B;
    await page.goto(`/identidade/perfis/${b.profileA}`);
    await expect(page.getByTestId('profile-detail')).toContainText('Frente A · Autora · A1');
    await expect(page.getByTestId('profile-version')).toHaveCount(1);
    await expect(page.getByTestId('profile-version')).toContainText('v1 · ativa');
    await page.goto('/genesis');                                   // o grupo "Base Hive" abre com a rota ativa
    await page.getByRole('link', { name: 'Minha identidade' }).click();
    await expect(page).toHaveURL(/\/identidade$/);
    await expect(page.getByTestId('identity-home')).toBeVisible();
  });
});
