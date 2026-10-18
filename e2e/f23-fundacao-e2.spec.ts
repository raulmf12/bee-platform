import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { addDays } from 'date-fns';
import { cleanupE2EData, cleanupE2EStorage, seed, sql, uploadE2EImage } from './helpers/admin';
import { e2eUser } from './helpers/env';
import { loginAs, type Tenant } from './helpers/tenant';

// F23 — Estabilização E2 (fundação): prontidão no servidor, pacote imutável com bytes preservados,
// comando de agendamento idempotente e reserva exclusiva de publicação com conferência.
// Nenhuma publicação real: as contas têm token falso e nada chama a rede social.
test.describe('F23 · Fundação E2', () => {
  test.describe.configure({ mode: 'serial' });
  let me: Tenant;
  let acc: string;
  const A = readFileSync('e2e/fixtures/peca-a.jpg');
  const B = readFileSync('e2e/fixtures/peca-b.jpg');
  const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
  const inDays = (n: number) => addDays(new Date(), n).toISOString();

  test.beforeAll(async () => {
    await cleanupE2EData();
    const { email, password, id } = e2eUser();
    me = await loginAs(email, password, id);
    [{ id: acc }] = await sql<{ id: string }>(`insert into social_accounts (user_id, platform, label, status, linkedin_token, linkedin_author_urn)
      values ('${id}', 'linkedin', 'E2E fundação', 'connected', 'tok-falso', 'urn:li:person:e2e-fundacao') returning id`);
  });
  test.afterAll(async () => {
    await cleanupE2EData();
    await sql(`delete from social_accounts where id='${acc}'`);
    await cleanupE2EStorage();
  });

  async function imagePiece(o: { status?: string; url?: string | null; extra?: Record<string, unknown> } = {}) {
    return seed('user_posts', {
      platform: 'linkedin', format: 'image', status: o.status ?? 'approved', title: 'Peça', caption: 'Legenda A',
      carousel_text: { quote: 'Frase A' }, rendered_slides: o.url === null ? null : { slide1: o.url ?? 'https://example.com/x.jpg' },
      account_id: acc, metadata: { editorial_slug: 'diagnostico-sistemico' }, ...(o.extra ?? {}),
    });
  }
  const schedule = (body: Record<string, unknown>) => me.fn<{ success: boolean; error?: string; code?: string; missing?: unknown[]; result?: Record<string, unknown> }>('schedule-piece', body);

  test('prontidão por formato: aponta o que falta; Stories sem legenda (02/T12–T13 base)', async () => {
    const pid = await imagePiece({ status: 'pending_approval', url: null, extra: { caption: '', visual_decision: { variant: 'M01-D' } } });
    const [r] = await sql<{ r: { ready: boolean; missing: Array<{ component: string }> } }>(`select public.piece_readiness('${pid}','schedule') r`);
    expect(r.r.ready).toBe(false);
    expect(r.r.missing.map((m) => m.component).sort()).toEqual(['aprovacao', 'imagem', 'imagem_ia', 'legenda']);
    const st = await seed('user_posts', { platform: 'instagram', format: 'story', status: 'pending_approval', caption: '', script_status: 'approved' });
    const { id: uid } = e2eUser();
    await sql(`insert into post_units (user_id, post_id, position, layout, title, rendered_url, visual_status, review_status, rendered_text_version)
      select '${uid}', '${st}', g, 'text', 'T'||g, 'https://x.test/'||g||'.jpg', 'ready', 'approved', 1 from generate_series(1,2) g`);
    const [s] = await sql<{ r: { ready: boolean; missing: unknown[] } }>(`select public.piece_readiness('${st}','approve_piece') r`);
    expect(s.r).toEqual({ ready: true, missing: [] });
  });

  test('agendar fecha pacote imutável com os bytes; editar depois não muda o pacote; comando idempotente (02/T21–T22, 03/T01–T03)', async () => {
    const urlA = await uploadE2EImage('fundacao-a.jpg', A);
    const pid = await imagePiece({ url: urlA });
    const cmd = randomUUID();
    const when = inDays(3);
    const r = await schedule({ command_id: cmd, post_id: pid, intent: 'schedule', when });
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    expect(r.data.result).toMatchObject({ status: 'scheduled', scheduled_version: 1 });
    const pkgId = r.data.result!.scheduled_package_id as string;
    const [pkg] = await sql<{ destination: string; manifest: { texts: { caption: string }; files: Array<{ url: string; sha256: string; path: string }> } }>(`select destination, manifest from publication_packages where id='${pkgId}'`);
    expect(pkg.destination).toBe('linkedin:urn:li:person:e2e-fundacao');
    expect(pkg.manifest.texts.caption).toBe('Legenda A');
    expect(pkg.manifest.files[0].sha256).toBe(sha(A));
    expect(pkg.manifest.files[0].url).toContain('/object/public/packages/');
    // retentativa do mesmo pedido: mesmo resultado, nenhum pacote novo
    const again = await schedule({ command_id: cmd, post_id: pid, intent: 'schedule', when });
    expect(again.data.result).toMatchObject({ replayed: true, scheduled_package_id: pkgId });
    // mesmo pedido com outra data: conflito explícito
    const clash = await schedule({ command_id: cmd, post_id: pid, intent: 'schedule', when: inDays(4) });
    expect(clash.status).toBe(409);
    expect((await sql<{ n: number }>(`select count(*)::int n from publication_packages where post_id='${pid}'`))[0].n).toBe(1);

    // edição posterior: legenda e a MESMA URL do render com outros bytes (o editor faz upsert em render.jpg)
    await sql(`update user_posts set caption='Legenda B' where id='${pid}'`);
    await uploadE2EImage('fundacao-a.jpg', B);
    const [after] = await sql<{ manifest: { texts: { caption: string } } }>(`select manifest from publication_packages where id='${pkgId}'`);
    expect(after.manifest.texts.caption).toBe('Legenda A');
    const kept = Buffer.from(await (await fetch(pkg.manifest.files[0].url)).arrayBuffer());
    expect(sha(kept)).toBe(sha(A));                                          // o arquivo programado continua o A
    await expect(sql(`update publication_packages set manifest='{}'::jsonb where id='${pkgId}'`)).rejects.toThrow(/imutável/);

    // reagendar muda só a data; o pacote continua o mesmo (03/T17)
    const re = await schedule({ command_id: randomUUID(), post_id: pid, intent: 'reschedule', when: inDays(5) });
    expect(re.data.result).toMatchObject({ status: 'scheduled', scheduled_package_id: pkgId });
    // retirar da agenda: volta a aprovada, o pacote fica no histórico
    const un = await schedule({ command_id: randomUUID(), post_id: pid, intent: 'unschedule' });
    expect(un.data.result).toMatchObject({ status: 'approved', scheduled_package_id: null });
    expect((await sql<{ n: number }>(`select count(*)::int n from publication_packages where id='${pkgId}'`))[0].n).toBe(1);
  });

  test('agendar recusa passado, peça não pronta e publicada (02/T16, T32)', async () => {
    const urlA = await uploadE2EImage('fundacao-c.jpg', A);
    const pid = await imagePiece({ url: urlA });
    const past = await schedule({ command_id: randomUUID(), post_id: pid, intent: 'schedule', when: inDays(-1) });
    expect(past.status).toBe(422);
    expect(past.data.error).toMatch(/já passou/);
    const pend = await imagePiece({ status: 'pending_approval', url: urlA });
    const np = await schedule({ command_id: randomUUID(), post_id: pend, intent: 'schedule', when: inDays(2) });
    expect(np.status).toBe(422);
    expect(np.data.error).toMatch(/ainda não foi aprovada/);
    const pub = await imagePiece({ status: 'published', url: urlA, extra: { published_at: new Date().toISOString() } });
    const hp = await schedule({ command_id: randomUUID(), post_id: pub, intent: 'schedule', when: inDays(2) });
    expect(hp.status).toBe(422);                                             // prontidão já barra: histórico
    expect(hp.data.error).toMatch(/permanece no histórico/);
    const st = await sql<{ status: string; scheduled_date: string | null }>(`select status, scheduled_date from user_posts where id in ('${pid}','${pend}') order by status`);
    expect(st.every((x) => x.scheduled_date === null)).toBe(true);           // nada gravado
  });

  test('reserva de publicação: um executor por vez, falha antes do envio × resultado incerto, conferência e confirmação (01/T05, T08–T10)', async () => {
    const { id: uid } = e2eUser();
    const pid = await imagePiece({ status: 'scheduled', extra: { scheduled_date: inDays(1) } });
    const acquire = (attempt: string) => sql<{ r: { state: string; publication_id?: string } }>(
      `select public.acquire_publication('${pid}','${uid}',null,'linkedin:urn:li:person:e2e-fundacao','${attempt}') r`).then((x) => x[0].r);
    // duas tentativas SIMULTÂNEAS: só uma adquire
    const [a1, a2] = [randomUUID(), randomUUID()];
    const both = await Promise.all([acquire(a1), acquire(a2)]);
    expect(both.map((b) => b.state).sort()).toEqual(['acquired', 'in_progress']);
    const winner = both[0].state === 'acquired' ? a1 : a2;
    const loser = winner === a1 ? a2 : a1;
    const pub = (both.find((b) => b.state === 'acquired')!).publication_id!;
    await expect(sql(`select public.mark_publication_sending('${pub}','${loser}')`)).rejects.toThrow(/não pertence/);
    // agendar enquanto há reserva ativa: recusado
    const blocked = await schedule({ command_id: randomUUID(), post_id: pid, intent: 'reschedule', when: inDays(2) });
    expect(blocked.status).toBe(409);
    // falha comprovadamente antes do envio → pode tentar de novo (mesmo registro)
    await sql(`select public.fail_publication('${pub}', true, 'token inválido (401)', 'definitive_4xx')`);
    const a3 = randomUUID();
    expect((await acquire(a3))).toMatchObject({ state: 'acquired', publication_id: pub });
    await sql(`select public.mark_publication_sending('${pub}','${a3}')`);
    // timeout depois de enviar → resultado incerto: nenhuma nova tentativa até conferir
    await sql(`select public.fail_publication('${pub}', false, 'timeout após envio', 'timeout')`);
    expect((await acquire(randomUUID())).state).toBe('needs_reconciliation');
    // o produtor confere: não foi publicado → libera
    const rec = await me.rpc('reconcile_publication', { p_pub: pub, p_published: false });
    expect(rec.status).toBe(200);
    const a5 = randomUUID();
    expect((await acquire(a5)).state).toBe('acquired');
    await sql(`select public.mark_publication_sending('${pub}','${a5}')`);
    await sql(`select public.confirm_publication('${pub}','urn:li:share:1','https://www.linkedin.com/feed/update/urn:li:share:1/')`);
    const [p] = await sql<{ status: string; published_url: string }>(`select status, published_url from user_posts where id='${pid}'`);
    expect(p).toEqual({ status: 'published', published_url: 'https://www.linkedin.com/feed/update/urn:li:share:1/' });
    expect((await acquire(randomUUID())).state).toBe('already_published');
  });

  test('confirmado na rede sem a peça marcada: a próxima tentativa repara sem reenviar (01/T08); registro manual (manual)', async () => {
    const { id: uid } = e2eUser();
    const pid = await imagePiece({ status: 'scheduled', extra: { scheduled_date: inDays(1) } });
    await sql(`insert into post_publications (user_id, post_id, version, destination, platform, format, status, stage, url, finished_at)
      values ('${uid}','${pid}',1,'linkedin:x','linkedin','image','published','confirmed','https://li/x', now())`);
    const [r] = await sql<{ r: { state: string; url: string } }>(`select public.acquire_publication('${pid}','${uid}',null,'linkedin:x','${randomUUID()}') r`);
    expect(r.r).toMatchObject({ state: 'already_published', url: 'https://li/x' });
    expect((await sql<{ status: string }>(`select status from user_posts where id='${pid}'`))[0].status).toBe('published');

    const man = await imagePiece();
    const m = await me.rpc<{ status: string; published_url: string }>('register_manual_publication', { p_post: man, p_url: 'https://www.instagram.com/p/manual/' });
    expect(m.status).toBe(200);
    expect(m.data).toMatchObject({ status: 'published', published_url: 'https://www.instagram.com/p/manual/' });
    expect((await sql<{ stage: string }>(`select stage from post_publications where post_id='${man}'`))[0].stage).toBe('confirmed');
  });
});
