import { test, expect } from '@playwright/test';
import { buildPipeline, filterCards, NO_FILTER } from '../src/lib/campaign/pipeline';
import { dueLabel, happening, pendingItems, upcoming, type HomeData } from '../src/lib/campaign/home';
import type { Campaign, CampaignCycle, Content, Idea, SocialAccount, UserPost } from '../src/types';

const TODAY = new Date(2026, 8, 24, 10, 0); // quinta, 24/09/2026

const post = (id: string, o: Partial<UserPost>): UserPost => ({ id, platform: 'linkedin', status: 'approved', created_at: `2026-09-20T10:00:00Z`, updated_at: '2026-09-20T10:00:00Z', metadata: {}, is_favorite: false, format: 'image', user_id: 'u', ...o } as UserPost);
const idea = (id: string, o: Partial<Idea>): Idea => ({ id, user_id: 'u', title: `Ideia ${id}`, channels: [], suggested_pieces: 1, origin: 'hive', status: 'approved', position: 0, created_at: '', updated_at: '2026-09-20', ...o } as Idea);
const content = (id: string, o: Partial<Content>): Content => ({ id, user_id: 'u', title: `Conteúdo ${id}`, validation_format: 'linkedin', body: {}, status: 'validated', versions: [], position: 0, metadata: {}, created_at: '', updated_at: '2026-09-20', ...o } as Content);
const camp = (id: string, o: Partial<Campaign> = {}): Campaign => ({ id, user_id: 'u', name: `Campanha ${id}`, type: 'organica', status: 'active', start_date: '2026-09-21', end_date: '2026-11-15', account_ids: [], cadence: {}, metadata: {}, created_at: '', updated_at: '', ...o } as Campaign);
const cycle = (id: string, o: Partial<CampaignCycle>): CampaignCycle => ({ id, campaign_id: 'c1', user_id: 'u', idx: 1, start_date: '2026-09-21', end_date: '2026-09-27', status: 'not_started', created_at: '', updated_at: '', ...o } as CampaignCycle);
const LI = { account_id: 'li', platform: 'linkedin' as const };
const IG = { account_id: 'ig', platform: 'instagram' as const };

test.describe('unit · pipeline por ideia/conteúdo', () => {
  const campaigns = [camp('c1')];

  test('coluna = estágio menos avançado; canais previstos sem peça contam como rascunho', () => {
    const ideas = [
      idea('i-backlog', { campaign_id: 'c1', channels: [LI, IG] }),
      idea('i-dev', { campaign_id: 'c1', channels: [LI, IG], status: 'developed' }),
      idea('i-pend', { campaign_id: 'c1', channels: [LI, IG], status: 'developed' }),
      idea('i-sched', { campaign_id: 'c1', channels: [LI, IG], status: 'developed' }),
    ];
    const contents = [
      content('k-draft', { idea_id: 'i-dev', campaign_id: 'c1', status: 'validated' }),
      content('k-pend', { idea_id: 'i-pend', campaign_id: 'c1' }),
      content('k-sched', { idea_id: 'i-sched', campaign_id: 'c1' }),
      content('k-val', { campaign_id: 'c1', status: 'pending_validation' }),
      content('k-gone', { campaign_id: 'c1', status: 'discarded' }),
    ];
    const posts = [
      post('p1', { content_id: 'k-draft', account_id: 'li', status: 'approved' }),                       // IG ainda não existe
      post('p2', { content_id: 'k-pend', account_id: 'li', status: 'approved' }),
      post('p3', { content_id: 'k-pend', account_id: 'ig', platform: 'instagram', status: 'pending_approval', alternative_group: 'g' }),
      post('p4', { content_id: 'k-pend', account_id: 'ig', platform: 'instagram', status: 'pending_approval', alternative_group: 'g' }),
      post('p5', { content_id: 'k-pend', account_id: 'ig', platform: 'instagram', status: 'archived', alternative_group: 'g' }),
      post('p6', { content_id: 'k-sched', account_id: 'li', status: 'scheduled', scheduled_date: '2026-09-30T11:00:00Z' }),
      post('p7', { content_id: 'k-sched', account_id: 'ig', platform: 'instagram', status: 'published', published_at: '2026-09-22T11:00:00Z' }),
      post('legacy', { status: 'pending_approval', campaign_id: null }),
    ];
    const cards = buildPipeline({ campaigns, ideas, contents, posts });
    const by = (id: string) => cards.find((c) => c.id === id)!;
    expect(cards.map((c) => c.id).sort()).toEqual(['content:k-draft', 'content:k-pend', 'content:k-sched', 'content:k-val', 'idea:i-backlog', 'post:legacy'].sort());
    expect(by('idea:i-backlog').column).toBe('ideias');
    expect(by('content:k-draft')).toMatchObject({ column: 'rascunho' });
    expect(by('content:k-draft').missingChannels).toEqual([IG]);
    expect(by('content:k-pend')).toMatchObject({ column: 'pendente', pendingPieces: 1 });
    expect(by('content:k-pend').pieces.map((p) => p.id)).toEqual(['p2', 'p3', 'p4']);
    expect(by('content:k-sched')).toMatchObject({ column: 'agendado', nextDate: '2026-09-30T11:00:00Z' });
    expect(by('content:k-val')).toMatchObject({ column: 'pendente' });
    expect(by('post:legacy')).toMatchObject({ kind: 'post', column: 'pendente', campaignId: null });
  });

  test('avulso (contêiner fora da lista) vira "Sem campanha"; filtros', () => {
    const contents = [content('k1', { campaign_id: 'avulso-id', editorial_slug: 'ed-a' }), content('k2', { campaign_id: 'c1', editorial_slug: 'ed-b' })];
    const posts = [
      post('a', { content_id: 'k1', campaign_id: 'avulso-id', account_id: 'ig', platform: 'instagram', status: 'published', published_at: '2026-09-22T10:00:00Z' }),
      post('b', { content_id: 'k2', campaign_id: 'c1', account_id: 'li', status: 'approved' }),
    ];
    const cards = buildPipeline({ campaigns, ideas: [], contents, posts });
    expect(cards.find((c) => c.id === 'content:k1')).toMatchObject({ campaignId: null, column: 'publicado' });
    expect(filterCards(cards, { ...NO_FILTER, campaign: 'none' }).map((c) => c.id)).toEqual(['content:k1']);
    expect(filterCards(cards, { ...NO_FILTER, campaign: 'c1' }).map((c) => c.id)).toEqual(['content:k2']);
    expect(filterCards(cards, { ...NO_FILTER, account: 'li' }).map((c) => c.id)).toEqual(['content:k2']);
    expect(filterCards(cards, { ...NO_FILTER, platform: 'instagram' }).map((c) => c.id)).toEqual(['content:k1']);
    expect(filterCards(cards, { ...NO_FILTER, editorial: 'ed-b' }).map((c) => c.id)).toEqual(['content:k2']);
  });
});

test.describe('unit · home regente', () => {
  const accounts = [{ id: 'li', platform: 'linkedin', label: 'Marcos', is_default: true }, { id: 'ig', platform: 'instagram', label: 'Bee', is_default: true }] as SocialAccount[];
  const base = (o: Partial<HomeData>): HomeData => ({ campaigns: [], cycles: [], ideas: [], contents: [], posts: [], accounts, today: TODAY, ...o });

  test('prazos', () => {
    expect(dueLabel('2026-09-24', TODAY)).toBe('Revisar hoje');
    expect(dueLabel('2026-09-25', TODAY)).toBe('Revisar até amanhã');
    expect(dueLabel('2026-09-27', TODAY)).toBe('Revisar até domingo');
    expect(dueLabel('2026-10-10', TODAY)).toBe('Recomendado até 10/10');
    expect(dueLabel('2026-09-22', TODAY)).toBe('Revisar — atrasado desde 22/09');
  });

  test('campanha recém-ativada sem ideias → "Iniciar produção" urgente', () => {
    const items = pendingItems(base({ campaigns: [camp('c1')], cycles: [cycle('cy1', {}), cycle('cy2', { idx: 2, start_date: '2026-09-28', end_date: '2026-10-04' })] }));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'start', urgent: true, cta: 'Iniciar produção', to: '/producao?campaign=c1&cycle=cy1', eyebrow: 'Campanha Orgânica · Primeiro ciclo' });
  });

  test('próximo ciclo com pauta pronta, validações, peças e agenda', () => {
    const cycles = [
      cycle('cy1', { status: 'producing' }),
      cycle('cy2', { idx: 2, start_date: '2026-09-28', end_date: '2026-10-04', status: 'pauta_ready' }),
      cycle('cy3', { idx: 3, start_date: '2026-10-05', end_date: '2026-10-11', status: 'pauta_ready' }), // além do horizonte de 7 dias
    ];
    const ideas = [idea('i1', { campaign_id: 'c1', cycle_id: 'cy1', status: 'developed' })];
    const posts = [
      post('x1', { cycle_id: 'cy1', status: 'pending_approval', alternative_group: 'g1' }),
      post('x2', { cycle_id: 'cy1', status: 'pending_approval', alternative_group: 'g1' }),
      post('x3', { cycle_id: 'cy1', status: 'pending_approval' }),
      post('x4', { cycle_id: 'cy1', status: 'approved' }),
    ];
    const items = pendingItems(base({ campaigns: [camp('c1')], cycles, ideas, posts }));
    const kinds = items.map((i) => i.kind);
    expect(kinds).toEqual(['review', 'pauta', 'schedule']); // por prazo; sem prazo por último
    expect(items[0].body).toBe('2 peças prontas esperam sua revisão.');
    expect(items[1]).toMatchObject({ eyebrow: 'Campanha Orgânica · Próximo ciclo', body: 'A Hive preparou as ideias recomendadas para a próxima semana.', due: '2026-09-27', dueLabel: 'Revisar até domingo', urgent: false });
    expect(items[2].to).toBe('/agenda?campaign=c1');
  });

  test('conteúdo esperando validação (campanha e avulso) + legado', () => {
    const cycles = [cycle('cy1', { status: 'developing' }), cycle('av1', { campaign_id: 'avulso-id' })];
    const contents = [
      content('k1', { campaign_id: 'c1', cycle_id: 'cy1', status: 'pending_validation', title: 'Liderança e controle' }),
      content('k2', { campaign_id: 'avulso-id', cycle_id: 'av1', status: 'pending_validation', title: 'Avulso' }),
    ];
    const posts = [post('old', { status: 'pending_approval', metadata: {} })];
    const items = pendingItems(base({ campaigns: [camp('c1')], cycles, contents, posts, avulsoId: 'avulso-id' }));
    expect(items.find((i) => i.id === 'validate:k1')).toMatchObject({ title: '“Liderança e controle”', body: 'O conteúdo está pronto. Falta sua aprovação.' });
    expect(items.find((i) => i.id === 'validate:k2')).toMatchObject({ eyebrow: 'Sem campanha · Conteúdo', to: '/producao?campaign=avulso-id&cycle=av1' });
    expect(items.find((i) => i.kind === 'legacy_text')?.title).toBe('1 post aguardando aprovação de texto');
  });

  test('publicação que falhou vira pendência urgente; histórico com conteúdo segue como legado', () => {
    const posts = [
      post('f1', { status: 'scheduled', scheduled_date: new Date(2026, 8, 9, 9).toISOString(), publish_error: 'Aprove a imagem de IA antes de publicar', carousel_text: { quote: 'Frase X' } }),
      post('h1', { status: 'pending_approval', content_id: 'k-hist', metadata: {} }),
    ];
    const items = pendingItems(base({ posts }));
    expect(items[0]).toMatchObject({ kind: 'publish_failed', title: '“Frase X”', urgent: true, cta: 'Resolver', to: '/posts/f1', dueLabel: 'Publicar — atrasado desde 09/09' });
    expect(items.find((i) => i.kind === 'legacy_text')?.title).toBe('1 post aguardando aprovação de texto');
  });

  test('acontecendo + próximas publicações', () => {
    const posts = [
      post('s1', { status: 'scheduled', scheduled_date: new Date(2026, 8, 24, 18, 0).toISOString(), account_id: 'li' }),
      post('s2', { status: 'scheduled', scheduled_date: new Date(2026, 8, 25, 9, 0).toISOString(), platform: 'instagram', account_id: 'ig' }),
      post('s0', { status: 'scheduled', scheduled_date: new Date(2026, 8, 23, 9, 0).toISOString() }), // passado
      post('d1', { status: 'pending_approval', content_id: 'k1' }),
    ];
    const d = base({ campaigns: [camp('c1'), camp('c2', { status: 'ended' })], contents: [content('k1', { campaign_id: 'c1' })], posts });
    expect(happening(d)).toEqual({ activeCampaigns: 1, scheduled: 2, inProduction: 1 });
    expect(upcoming(d).map((u) => [u.dayLabel, u.account])).toEqual([['Hoje', 'LinkedIn Marcos'], ['Amanhã', 'Instagram Bee']]);
  });
});
