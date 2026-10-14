import { test, expect } from '@playwright/test';
import { cleanupE2EData, seed, sql } from './helpers/admin';
import { createTenant, deleteTenant, type Tenant } from './helpers/tenant';
import { e2eUser } from './helpers/env';

// F19 — Fase 6 · Isolamento multi-cliente (Hive_Identidade_Contextos §11, §13 itens 5–6; Guia §10 item 10):
// um produtor de teste SEM referências Bee implícitas não lê nem grava dados da Bee — no banco (RLS),
// nas funções com credencial de serviço (contexto, bases, sistema visual) e na publicação.
const BEE = '0b000000-0000-4000-8000-000000000002';

test.describe('F19 · isolamento entre clientes', () => {
  let t: Tenant | null = null;
  test.beforeAll(async () => { await cleanupE2EData(); t = await createTenant(Math.random().toString(36).slice(2, 8)); });
  test.afterAll(async () => {
    if (t) await sql(`delete from public.workspaces where id in (select workspace_id from public.workspace_members where user_id='${t.id}')`);
    await deleteTenant(t);
    await cleanupE2EData();
  });

  test('banco: o cliente novo não lê a identidade, a metodologia, o sistema visual nem os produtos da Bee', async () => {
    const tables = ['brands', 'emitters', 'business_fronts', 'audiences', 'communication_profiles', 'genesis_core', 'genesis_principios', 'genesis_lentes',
      'bee_editorials', 'bee_directives', 'bee_example_posts', 'bee_glossary', 'bee_arsenal', 'bee_style_rules', 'design_variacoes', 'design_tokens',
      'design_assets', 'photo_references', 'acj_definitions', 'alma_dimensoes'];
    for (const tb of tables) {
      const r = await t!.rest<unknown[]>(`/${tb}?select=*&limit=5`);
      expect(r.status, tb).toBe(200);
      expect(r.data, tb).toEqual([]);
    }
    const prods = await t!.rest<Array<{ brand_id: string | null }>>(`/bee_products?select=brand_id`);
    expect(prods.data.filter((p) => p.brand_id === BEE)).toEqual([]);
    const docs = await t!.rest<unknown[]>(`/knowledge_documents?select=id&is_global=eq.true`);
    expect(docs.data).toEqual([]);
    // gravar na base da Bee é recusado
    const w = await t!.rest(`/bee_editorials`, { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ slug: `invasao-${Date.now()}`, name: 'Invasão', brand_id: BEE }) });
    expect(w.status).toBeGreaterThanOrEqual(400);
    // e o membro da Bee continua vendo a própria base
    const [bee] = await sql<{ n: number }>(`select count(*)::int n from bee_editorials where brand_id='${BEE}'`);
    expect(bee.n).toBeGreaterThan(0);
  });

  test('servidor: contexto neutro antes da marca; marca própria depois — nada da Bee nas funções', async () => {
    const p0 = await t!.fn<{ brand: unknown; speaker: string; counts: Record<string, number> }>('identity-setup', { action: 'context_probe' });
    expect(p0.status).toBe(200);
    expect(p0.data.brand).toBeNull();
    expect(p0.data.speaker).toContain('nao invente biografia');
    expect(Object.values(p0.data.counts).every((n) => n === 0)).toBe(true);
    // cria o próprio espaço e marca (sem herdar nada)
    const mk = await t!.rpc<string>('create_my_workspace', { p_workspace: 'Estúdio Teste', p_brand: 'Estúdio Teste' });
    expect(mk.status).toBe(200);
    const again = await t!.rpc('create_my_workspace', { p_workspace: 'x', p_brand: 'x' });
    expect(again.status).toBeGreaterThanOrEqual(400);                         // um espaço por cliente
    const brands = await t!.rest<Array<{ id: string; name: string }>>(`/brands?select=id,name`);
    expect(brands.data).toEqual([{ id: mk.data, name: 'Estúdio Teste' }]);
    const p1 = await t!.fn<{ brand: unknown; counts: Record<string, number> }>('identity-setup', { action: 'context_probe' });
    expect(Object.values(p1.data.counts).every((n) => n === 0)).toBe(true);    // nenhuma base da Bee carregada
    // sessão de configuração: perguntas neutras do produto (nunca as da sessão inaugural da Bee)
    const [s] = (await t!.rest<Array<{ id: string }>>(`/setup_sessions`, { method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ user_id: t!.id, brand_id: mk.data, mode: 'setup', targets: ['identidade', 'publico'] }) })).data;
    const q = await t!.fn<{ question: { id: string; text: string } }>('identity-setup', { action: 'next_question', session_id: s.id });
    expect(q.data.question.id).toMatch(/^g-/);
    expect(q.data.question.text).not.toMatch(/Bee|Marcos|Academy|Consulting/);
    // sessão na marca da Bee: recusada no banco
    const bee = await t!.rest(`/setup_sessions`, { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ user_id: t!.id, brand_id: BEE, mode: 'review' }) });
    expect(bee.status).toBeGreaterThanOrEqual(400);
    // campanha apontando para um perfil da Bee: recusada
    const camp = await t!.rest(`/campaigns`, { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ user_id: t!.id, name: 'X', type: 'organica', status: 'draft', profile_id: '0b000000-0000-4000-8000-00000000000a' }) });
    expect(camp.status).toBeGreaterThanOrEqual(400);
  });

  test('publicação: o cliente não publica a peça de outro usuário nem usa a conta social de outro usuário', async () => {
    const pid = await seed('user_posts', { platform: 'linkedin', format: 'image', status: 'approved', caption: 'Peça da Bee' });
    const r = await t!.fn<{ check?: { ok: boolean; issues: string[] } }>('publish-post', { post_id: pid, dry_run: true });
    expect(r.data.check?.ok).toBe(false);
    expect(r.data.check?.issues.join(' ')).toMatch(/nao encontrado/i);
    const p = await t!.fn('publish-post', { post_id: pid });
    expect(p.status).toBe(500);
    const [still] = await sql<{ status: string; attempts: number | null }>(`select status, publish_attempts attempts from user_posts where id='${pid}'`);
    expect({ ...still, attempts: still.attempts ?? 0 }).toEqual({ status: 'approved', attempts: 0 });   // nem tentativa registrada
    // peça do próprio cliente apontando para a conta social do usuário E2E (Bee): sem credenciais alheias
    const [acc] = await sql<{ id: string }>(`insert into social_accounts (user_id, platform, label, status, linkedin_token, linkedin_author_urn)
      values ('${e2eUser().id}', 'linkedin', 'E2E alheia', 'connected', 'tok', 'urn:li:person:x') returning id`);
    const [own] = await sql<{ id: string }>(`insert into user_posts (user_id, platform, format, status, caption, account_id, rendered_slides)
      values ('${t!.id}', 'linkedin', 'image', 'approved', 'Minha peça', '${acc.id}', '{"slide1":"https://x.test/a.jpg"}') returning id`);
    const steal = await t!.fn<{ details?: string }>('publish-post', { post_id: own.id });
    expect(steal.status).toBe(500);
    expect(JSON.stringify(steal.data)).toMatch(/conta desta peça não existe/);
    await sql(`delete from user_posts where id='${own.id}'; delete from social_accounts where id='${acc.id}'`);
  });
});
