import { test, expect } from '@playwright/test';
import { cleanupE2EData, sql } from './helpers/admin';
import { e2eUser } from './helpers/env';
import { mockCampaignAI, mockDevelop } from './helpers/mocks';
import { seedAccounts, seedApprovedPauta, seedCampaign } from './helpers/fixtures';

// F15 — Fase 1 · identidade e contextos: perfis de comunicação, snapshot de contexto,
// herança nas peças, lições com escopo e curadoria do histórico importado.
const ACADEMY = '0b000000-0000-4000-8000-00000000000a';
const CONSULTING = '0b000000-0000-4000-8000-00000000000b';
const FRONT_ACADEMY = '0b000000-0000-4000-8000-000000000005';
const FRONT_CONSULTING = '0b000000-0000-4000-8000-000000000006';

test.describe('F15 · identidade e contextos (Fase 1)', () => {
  test.beforeEach(async () => { await cleanupE2EData(); });
  test.afterAll(async () => { await cleanupE2EData(); });

  test('base: Bee com emissores, frentes, públicos e perfis; público separado do estado', async () => {
    const profiles = await sql<{ name: string; status: string; is_default: boolean; front: string; emitter_kind: string }>(
      `select p.name, p.status, p.is_default, f.slug front, e.kind emitter_kind from communication_profiles p join business_fronts f on f.id=p.front_id join emitters e on e.id=p.emitter_id order by p.name`);
    expect(profiles.map((p) => p.front)).toEqual(expect.arrayContaining(['academy', 'consulting']));
    expect(profiles.filter((p) => p.is_default)).toHaveLength(1);
    expect(profiles.find((p) => p.emitter_kind === 'institutional')?.status).toBe('draft');
    const [aud] = await sql<{ status: string }>(`select status from audiences where name='Transformadores'`);
    expect(aud.status).toBe('hypothesis'); // núcleo ainda a definir pelo Marcos
    // o usuário de teste é membro do workspace (RLS de leitura) — sem membership, nada da Bee
    const { id } = e2eUser();
    expect(await sql(`select 1 from workspace_members where user_id='${id}'`)).toHaveLength(1);
  });

  test('peça herda perfil e snapshot do conteúdo-mãe (trigger)', async () => {
    const { id: uid } = e2eUser();
    const [snap] = await sql<{ id: string }>(`insert into context_snapshots (user_id, profile_id, profile_version, summary) values ('${uid}', '${CONSULTING}', 1, 'Marcos Piccini · Bee Consulting · Organizações') returning id`);
    const [c] = await sql<{ id: string }>(`insert into contents (user_id, title, profile_id, context_snapshot_id) values ('${uid}', 'C', '${CONSULTING}', '${snap.id}') returning id`);
    const [p] = await sql<{ profile_id: string; context_snapshot_id: string }>(`insert into user_posts (user_id, platform, format, status, title, content_id) values ('${uid}','instagram','image','draft','P','${c.id}') returning profile_id, context_snapshot_id`);
    expect(p).toEqual({ profile_id: CONSULTING, context_snapshot_id: snap.id });
  });

  test('lições com escopo: lição da Consulting não entra na geração da Academy', async () => {
    const { id: uid } = e2eUser();
    await sql(`insert into ai_learnings (user_id, texto, categoria, facet, ativo, front_id) values
      ('${uid}', 'LICAO-CONSULTING: use casos organizacionais', 'estrutura', 'texto', true, '${FRONT_CONSULTING}'),
      ('${uid}', 'LICAO-GLOBAL: frases curtas', 'tamanho', 'texto', true, null)`);
    const rows = (front: string) => sql<{ texto: string }>(`select texto from ai_prompt_learnings('${uid}', 'x', 'linkedin', 'ambos', array['texto'], 12, '${front}', null, null)`);
    const academy = (await rows(FRONT_ACADEMY)).map((r) => r.texto);
    const consulting = (await rows(FRONT_CONSULTING)).map((r) => r.texto);
    expect(academy).toEqual(['LICAO-GLOBAL: frases curtas']);
    expect(consulting[0]).toBe('LICAO-CONSULTING: use casos organizacionais'); // mais específica primeiro
    expect(consulting).toContain('LICAO-GLOBAL: frases curtas');
  });

  test('histórico importado não é referência de voz', async () => {
    const [r] = await sql<{ n: number }>(`select count(*)::int n from user_posts where metadata->>'imported_from' in ('instagram','linkedin') and coalesce(reference_status,'') <> 'historical'`);
    expect(r.n).toBe(0);
  });

  test('campanha: seletor de perfil; sem perfil = aviso visível; trocar persiste', async ({ page }) => {
    const acc = await seedAccounts();
    const camp = await seedCampaign({ weeks: 2, accountIds: [acc.linkedin], cadence: [2] });
    await sql(`update campaigns set profile_id=null, profile_needs_review=true where id='${camp.id}'`);
    await page.goto(`/campanhas/${camp.id}`);
    const box = page.getByTestId('campaign-profile');
    await expect(box.getByTestId('profile-needs-review')).toBeVisible();
    await box.getByLabel('Perfil de comunicação').selectOption(CONSULTING);
    await expect(box.getByTestId('profile-summary')).toContainText('Bee Consulting');
    await expect(box.getByTestId('profile-needs-review')).toHaveCount(0);
    const [c] = await sql<{ profile_id: string; profile_needs_review: boolean }>(`select profile_id, profile_needs_review from campaigns where id='${camp.id}'`);
    expect(c).toEqual({ profile_id: CONSULTING, profile_needs_review: false });
  });

  test('nova campanha: perfil padrão visível, enviado à Hive e salvo na ativação', async ({ page }) => {
    const calls = await mockCampaignAI(page);
    await seedAccounts();
    await page.goto('/campanhas/nova');
    const picker = page.getByLabel('Por qual perfil esta campanha fala?');
    await expect(picker).toHaveValue(ACADEMY); // padrão da marca, visível e alterável
    await picker.selectOption(CONSULTING);
    await page.getByLabel('Conte para a Hive o que você pretende fazer.').fill('Falar com organizações sobre transformação.');
    await page.getByRole('button', { name: 'Continuar →' }).click();
    await page.getByRole('button', { name: 'Sim, continuar →' }).click();
    await page.getByRole('button', { name: 'Usar estratégia recomendada →' }).click();
    await page.getByRole('button', { name: 'Continuar →' }).click();
    await page.getByRole('button', { name: 'Ativar campanha →' }).click();
    await expect(page.getByText('Sua campanha começou.')).toBeVisible();
    expect(calls.moment[0]).toMatchObject({ profile_id: CONSULTING });
    expect(calls.strategy[0]).toMatchObject({ profile_id: CONSULTING });
    const { id: uid } = e2eUser();
    const [c] = await sql<{ profile_id: string }>(`select profile_id from campaigns where user_id='${uid}' and coalesce(metadata->>'kind','')<>'avulso'`);
    expect(c.profile_id).toBe(CONSULTING);
  });

  test('conteúdo-mãe guarda o snapshot e a validação mostra quem fala · frente · público', async ({ page }) => {
    const { id: uid } = e2eUser();
    const [snap] = await sql<{ id: string }>(`insert into context_snapshots (user_id, profile_id, profile_version, summary) values ('${uid}', '${CONSULTING}', 1, 'Marcos Piccini · Bee Consulting · Organizações') returning id`);
    await mockDevelop(page, [], { context: { snapshot_id: snap.id, profile_id: CONSULTING, summary: 'Marcos Piccini · Bee Consulting · Organizações' } });
    const acc = await seedAccounts();
    const camp = await seedCampaign({ weeks: 2, accountIds: [acc.linkedin], cadence: [2] });
    await seedApprovedPauta(camp.id, camp.cycleIds[0], [{ title: 'Ideia', fn: 'autoridade', channels: [{ account_id: acc.linkedin, platform: 'linkedin' }] }]);
    await page.goto(`/producao?campaign=${camp.id}&cycle=${camp.cycleIds[0]}`);
    await page.getByRole('button', { name: /Desenvolver conteúdos/ }).click();
    await expect(page.getByTestId('content-context')).toContainText('Marcos Piccini · Bee Consulting · Organizações');
    const [c] = await sql<{ profile_id: string; context_snapshot_id: string }>(`select profile_id, context_snapshot_id from contents where cycle_id='${camp.cycleIds[0]}'`);
    expect(c).toEqual({ profile_id: CONSULTING, context_snapshot_id: snap.id });
  });
});
