import { test, expect } from '@playwright/test';
import { cleanupE2EData, sql } from './helpers/admin';
import { e2eUser } from './helpers/env';
import { seedAccounts, seedAcjPlan, seedCampaign } from './helpers/fixtures';

// F13 — ACJ: invariantes de domínio NO BANCO (Adendo §8 e §22), independentes de IA e interface.
test.describe('F13 · ACJ — invariantes no banco', () => {
  test.beforeEach(async () => { await cleanupE2EData(); });
  test.afterAll(async () => { await cleanupE2EData(); });

  const fails = async (q: string, re: RegExp) => {
    await expect(sql(q)).rejects.toThrow(re);
  };

  async function setup() {
    const acc = await seedAccounts();
    const camp = await seedCampaign({ weeks: 4, accountIds: [acc.linkedin], cadence: [2] });
    const { id: uid } = e2eUser();
    const [idea] = await sql<{ id: string }>(`insert into ideas (user_id, campaign_id, cycle_id, title) values ('${uid}','${camp.id}','${camp.cycleIds[0]}','Ideia') returning id`);
    const [content] = await sql<{ id: string }>(`insert into contents (user_id, idea_id, campaign_id, cycle_id, title) values ('${uid}','${idea.id}','${camp.id}','${camp.cycleIds[0]}','Conteúdo') returning id`);
    return { uid, acc, camp, ideaId: idea.id, contentId: content.id };
  }
  const contract = (uid: string, contentId: string, acj = 'ACJ-02', extra = '') =>
    `insert into acj_content_contracts (user_id, content_id, acj_primary, audience_state_from, journey_need, movement_to, connection_mechanism ${extra ? ', acj_secondary' : ''})
     values ('${uid}','${contentId}','${acj}','de','precisa','para','mecanismo' ${extra ? `, '${extra}'` : ''}) returning id, version`;

  test('ACJ-00 e ACJ inválida nunca são atribuíveis; secundária ≠ primária', async () => {
    const { uid, ideaId, contentId } = await setup();
    await fails(`update ideas set acj_primary='ACJ-00' where id='${ideaId}'`, /ideas_acj_check/);
    await fails(`update ideas set acj_primary='ACJ-02', acj_secondary='ACJ-02' where id='${ideaId}'`, /ideas_acj_check/);
    await fails(`update ideas set acj_secondary='ACJ-03' where id='${ideaId}'`, /ideas_acj_check/); // secundária sem primária
    await sql(`update ideas set acj_primary='ACJ-02', acj_secondary='ACJ-03' where id='${ideaId}'`);
    await fails(contract(uid, contentId, 'ACJ-00'), /check/);
    await fails(contract(uid, contentId, 'ACJ-02', 'ACJ-02'), /check/);
  });

  test('mix fora de 100% ou com chave inválida é recusado; plano aprovado é imutável e arquiva o anterior', async () => {
    const { uid, camp } = await setup();
    await fails(`insert into acj_campaign_plans (user_id, campaign_id, target_mix) values ('${uid}','${camp.id}','{"ACJ-01":50,"ACJ-02":30}')`, /check/);
    await fails(`insert into acj_campaign_plans (user_id, campaign_id, target_mix) values ('${uid}','${camp.id}','{"ACJ-00":100}')`, /check/);
    // aprovado sem aprovador → recusado
    await fails(`insert into acj_campaign_plans (user_id, campaign_id, target_mix, status) values ('${uid}','${camp.id}','{"ACJ-01":100}','approved')`, /check/);
    const v1 = await seedAcjPlan(camp.id);
    await fails(`update acj_campaign_plans set target_mix='{"ACJ-01":100}' where id='${v1}'`, /imutável/);
    const [v2] = await sql<{ id: string; version: number }>(`insert into acj_campaign_plans (user_id, campaign_id, target_mix) values ('${uid}','${camp.id}','{"ACJ-01":50,"ACJ-03":50}') returning id, version`);
    expect(v2.version).toBe(2);
    let rows = await sql<{ id: string; status: string }>(`select id, status from acj_campaign_plans where campaign_id='${camp.id}' order by version`);
    expect(rows.map((r) => r.status)).toEqual(['approved', 'recommended']); // recomendação nova não derruba a vigente
    await sql(`update acj_campaign_plans set status='approved', approved_by='${uid}', approved_at=now() where id='${v2.id}'`);
    rows = await sql(`select id, status from acj_campaign_plans where campaign_id='${camp.id}' order by version`);
    expect(rows.map((r) => r.status)).toEqual(['archived', 'approved']); // histórico preservado
  });

  test('contrato: versão nova supera a anterior; mudar o movimento por UPDATE é recusado', async () => {
    const { uid, contentId } = await setup();
    const [c1] = await sql<{ id: string; version: number }>(contract(uid, contentId, 'ACJ-02'));
    expect(c1.version).toBe(1);
    await fails(`update acj_content_contracts set acj_primary='ACJ-03' where id='${c1.id}'`, /nova versão/);
    await sql(`update acj_content_contracts set validation='{"realized":"yes"}' where id='${c1.id}'`); // portão pode ser atualizado
    const [c2] = await sql<{ id: string; version: number }>(contract(uid, contentId, 'ACJ-03'));
    expect(c2.version).toBe(2);
    const rows = await sql<{ version: number; status: string }>(`select version, status from acj_content_contracts where content_id='${contentId}' order by version`);
    expect(rows).toEqual([{ version: 1, status: 'superseded' }, { version: 2, status: 'active' }]);
  });

  test('peça herda o contrato; publicação congela o snapshot; plano novo não muda o publicado', async () => {
    const { uid, camp, acc, contentId } = await setup();
    await sql(contract(uid, contentId, 'ACJ-02'));
    const [p] = await sql<{ id: string; acj_primary: string; acj_status: string }>(`insert into user_posts (user_id, platform, format, status, title, content_id, campaign_id, cycle_id, account_id)
      values ('${uid}','linkedin','image','approved','Peça','${contentId}','${camp.id}','${camp.cycleIds[0]}','${acc.linkedin}') returning id, acj_primary, acj_status`);
    expect(p).toMatchObject({ acj_primary: 'ACJ-02', acj_status: 'inherited' });
    // tentativa de editar a ACJ na peça: o banco recoloca a herança do conteúdo-mãe
    await sql(`update user_posts set acj_primary='ACJ-05' where id='${p.id}'`);
    expect((await sql<{ acj_primary: string }>(`select acj_primary from user_posts where id='${p.id}'`))[0].acj_primary).toBe('ACJ-02');
    // contrato novo antes de publicar → herança acompanha
    await sql(contract(uid, contentId, 'ACJ-03'));
    expect((await sql<{ acj_primary: string }>(`select acj_primary from user_posts where id='${p.id}'`))[0].acj_primary).toBe('ACJ-03');
    // publica → congela
    await sql(`update user_posts set status='published', published_at=now() where id='${p.id}'`);
    const [pub] = await sql<{ acj_frozen_at: string | null; acj_snapshot: { contract_version: number } }>(`select acj_frozen_at, acj_snapshot from user_posts where id='${p.id}'`);
    expect(pub.acj_frozen_at).not.toBeNull();
    expect(pub.acj_snapshot.contract_version).toBe(2);
    await sql(contract(uid, contentId, 'ACJ-04'));
    await sql(`update user_posts set acj_primary='ACJ-01', acj_snapshot=null where id='${p.id}'`);
    const [after] = await sql<{ acj_primary: string; acj_snapshot: { contract_version: number } }>(`select acj_primary, acj_snapshot from user_posts where id='${p.id}'`);
    expect(after.acj_primary).toBe('ACJ-03');
    expect(after.acj_snapshot.contract_version).toBe(2);
  });

  test('Registro Vivo: ID ACJL-AAAA-NNN, transições do §5.1, validação exige aprovador, trilha de decisões', async () => {
    const { uid } = await setup();
    const year = new Date().getFullYear();
    const [e1] = await sql<{ id: string; code: string }>(`insert into acj_learning_entries (user_id, code, title, observed_fact) values ('${uid}','','Obs 1','fato') returning id, code`);
    const [e2] = await sql<{ code: string }>(`insert into acj_learning_entries (user_id, code, title, observed_fact) values ('${uid}','','Obs 2','fato') returning code`);
    expect(e1.code).toBe(`ACJL-${year}-001`);
    expect(e2.code).toBe(`ACJL-${year}-002`);
    await fails(`update acj_learning_entries set status='validated', approved_by='${uid}', approved_at=now() where id='${e1.id}'`, /Transição não permitida/);
    await fails(`insert into acj_learning_entries (user_id, code, title, observed_fact, acj_ids) values ('${uid}','','x','f','{ACJ-00}')`, /check/);
    for (const s of ['hypothesis', 'testing', 'provisional']) await sql(`update acj_learning_entries set status='${s}' where id='${e1.id}'`);
    await fails(`update acj_learning_entries set status='validated' where id='${e1.id}'`, /check/); // sem aprovador humano
    await sql(`update acj_learning_entries set status='validated', approved_by='${uid}', approved_at=now() where id='${e1.id}'`);
    await fails(`update acj_learning_entries set status='consolidated' where id='${e1.id}'`, /check/); // sem documento afetado
    await sql(`update acj_learning_entries set status='consolidated', affected_document='ACJ-02 v0.2' where id='${e1.id}'`);
    await fails(`update acj_learning_entries set code='X' where id='${e1.id}'`, /imutável/);
    const trail = await sql<{ to_status: string }>(`select to_status from acj_learning_decisions where entry_id='${e1.id}' order by created_at`);
    expect(trail.map((t) => t.to_status)).toEqual(['open', 'hypothesis', 'testing', 'provisional', 'validated', 'consolidated']);
  });
});
