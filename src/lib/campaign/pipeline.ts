// Pipeline (Kanban) por IDEIA / CONTEÚDO (D10): 1 card = 1 ideia do backlog ou
// 1 conteúdo-mãe com suas N peças. A coluna é o estágio MENOS avançado entre as
// peças (e canais previstos ainda sem peça contam como rascunho). Peças antigas,
// sem conteúdo, viram cards próprios até o backfill do cutover. Determinístico.
import type { Campaign, CampaignCycle, Content, Idea, IdeaChannel, StrategicFunction, UserPost } from '@/types';

export type PipelineColumn = 'ideias' | 'rascunho' | 'pendente' | 'aprovado' | 'agendado' | 'publicado';

export const PIPELINE_COLUMNS: Array<{ key: PipelineColumn; label: string }> = [
  { key: 'ideias', label: 'Ideias' },
  { key: 'rascunho', label: 'Rascunho' },
  { key: 'pendente', label: 'Pendente de aprovação' },
  { key: 'aprovado', label: 'Aprovado' },
  { key: 'agendado', label: 'Agendado' },
  { key: 'publicado', label: 'Publicado' },
];

const ORDER: PipelineColumn[] = PIPELINE_COLUMNS.map((c) => c.key);

export interface PipelineCard {
  id: string;
  kind: 'idea' | 'content' | 'post';
  title: string;
  column: PipelineColumn;
  campaignId: string | null;      // null = sem campanha (inclui o contêiner avulso)
  cycleId: string | null;
  fn: StrategicFunction | null;
  editorialSlug: string | null;
  channels: IdeaChannel[];        // onde a ideia/conteúdo ganha forma
  pieces: UserPost[];             // peças vivas (sem alternativas arquivadas)
  pendingPieces: number;          // peças esperando revisão (grupo de alternativas conta 1)
  missingChannels: IdeaChannel[]; // previstos sem peça ainda
  origin?: Idea['origin'];
  idea?: Idea;
  content?: Content;
  nextDate: string | null;        // próxima publicação agendada
  publishedAt: string | null;
  updatedAt: string;
}

export function stageOfPost(p: UserPost): PipelineColumn {
  switch (p.status) {
    case 'idea': return 'ideias';
    case 'pending_approval': return 'pendente';
    case 'approved': return 'aprovado';
    case 'scheduled': return 'agendado';
    case 'published': return 'publicado';
    default: return 'rascunho';
  }
}

const minCol = (cols: PipelineColumn[]): PipelineColumn =>
  cols.reduce((m, c) => (ORDER.indexOf(c) < ORDER.indexOf(m) ? c : m), 'publicado' as PipelineColumn);

const covers = (p: UserPost, ch: IdeaChannel) => (ch.account_id && p.account_id ? p.account_id === ch.account_id : p.platform === ch.platform);

// Grupo de alternativas = uma unidade de revisão.
function countPending(pieces: UserPost[]): number {
  const groups = new Set<string>();
  for (const p of pieces) if (p.status === 'pending_approval') groups.add(p.alternative_group ?? p.id);
  return groups.size;
}

export function buildPipeline(d: {
  campaigns: Campaign[]; ideas: Idea[]; contents: Content[]; posts: UserPost[];
}): PipelineCard[] {
  const known = new Set(d.campaigns.map((c) => c.id));
  const camp = (id?: string | null) => (id && known.has(id) ? id : null);
  const cards: PipelineCard[] = [];
  const live = d.posts.filter((p) => p.status !== 'archived');
  const byContent = new Map<string, UserPost[]>();
  for (const p of live) if (p.content_id) byContent.set(p.content_id, [...(byContent.get(p.content_id) ?? []), p]);
  const contentIds = new Set(d.contents.map((c) => c.id));
  const developedIdeas = new Set(d.contents.filter((c) => c.status !== 'discarded' && c.idea_id).map((c) => c.idea_id!));

  for (const i of d.ideas) {
    if (i.status === 'discarded' || i.status === 'developed' || developedIdeas.has(i.id)) continue;
    cards.push({
      id: `idea:${i.id}`, kind: 'idea', title: i.title, column: 'ideias', campaignId: camp(i.campaign_id), cycleId: i.cycle_id ?? null,
      fn: i.strategic_function ?? null, editorialSlug: i.editorial_slug ?? null, channels: i.channels ?? [], pieces: [], pendingPieces: 0,
      missingChannels: [], origin: i.origin, idea: i, nextDate: null, publishedAt: null, updatedAt: i.updated_at,
    });
  }

  for (const c of d.contents) {
    if (c.status === 'discarded') continue;
    const idea = d.ideas.find((i) => i.id === c.idea_id);
    const pieces = (byContent.get(c.id) ?? []).sort((a, b) => a.created_at.localeCompare(b.created_at));
    const channels = idea?.channels?.length ? idea.channels : pieces.map((p) => ({ account_id: p.account_id ?? undefined, platform: p.platform as IdeaChannel['platform'] }));
    const missing = c.status === 'validated' ? channels.filter((ch) => !pieces.some((p) => covers(p, ch))) : [];
    let column: PipelineColumn;
    if (c.status === 'developing') column = 'rascunho';
    else if (c.status === 'pending_validation') column = 'pendente';
    else column = minCol([...pieces.map(stageOfPost), ...(missing.length || !pieces.length ? ['rascunho' as const] : [])]);
    if (column === 'ideias') column = 'rascunho';
    const scheduled = pieces.filter((p) => p.status === 'scheduled' && p.scheduled_date).map((p) => p.scheduled_date!).sort();
    const published = pieces.filter((p) => p.status === 'published' && p.published_at).map((p) => p.published_at!).sort();
    cards.push({
      id: `content:${c.id}`, kind: 'content', title: c.title, column, campaignId: camp(c.campaign_id), cycleId: c.cycle_id ?? null,
      fn: c.strategic_function ?? null, editorialSlug: c.editorial_slug ?? null, channels, pieces,
      pendingPieces: c.status === 'pending_validation' ? 1 : countPending(pieces), missingChannels: missing,
      origin: idea?.origin, idea, content: c, nextDate: scheduled[0] ?? null, publishedAt: published[published.length - 1] ?? null,
      updatedAt: c.updated_at,
    });
  }

  // Peças sem conteúdo (histórico antes do backfill / fluxos legados).
  for (const p of live) {
    if (p.content_id && contentIds.has(p.content_id)) continue;
    cards.push({
      id: `post:${p.id}`, kind: 'post', title: (p.carousel_text?.quote as string | undefined) || p.title || p.caption?.slice(0, 80) || 'Post',
      column: stageOfPost(p), campaignId: camp(p.campaign_id), cycleId: p.cycle_id ?? null, fn: null,
      editorialSlug: (p.metadata?.editorial_slug as string | undefined) ?? null,
      channels: [{ account_id: p.account_id ?? undefined, platform: p.platform as IdeaChannel['platform'] }], pieces: [p],
      pendingPieces: p.status === 'pending_approval' ? 1 : 0, missingChannels: [], nextDate: p.status === 'scheduled' ? p.scheduled_date ?? null : null,
      publishedAt: p.published_at ?? null, updatedAt: p.updated_at,
    });
  }
  return cards;
}

export interface PipelineFilter { campaign: string | 'all' | 'none'; cycle: string | 'all'; account: string | 'all'; platform: string | 'all'; editorial: string | 'all' }
export const NO_FILTER: PipelineFilter = { campaign: 'all', cycle: 'all', account: 'all', platform: 'all', editorial: 'all' };

export function filterCards(cards: PipelineCard[], f: PipelineFilter): PipelineCard[] {
  return cards.filter((c) =>
    (f.campaign === 'all' || (f.campaign === 'none' ? c.campaignId === null : c.campaignId === f.campaign)) &&
    (f.cycle === 'all' || c.cycleId === f.cycle) &&
    (f.account === 'all' || c.channels.some((ch) => ch.account_id === f.account) || c.pieces.some((p) => p.account_id === f.account)) &&
    (f.platform === 'all' || c.channels.some((ch) => ch.platform === f.platform) || c.pieces.some((p) => p.platform === f.platform)) &&
    (f.editorial === 'all' || c.editorialSlug === f.editorial));
}

// Ordem dentro da coluna: o que está mais perto de acontecer primeiro.
export function sortColumn(col: PipelineColumn, cards: PipelineCard[], cycles: CampaignCycle[]): PipelineCard[] {
  const start = (c: PipelineCard) => cycles.find((y) => y.id === c.cycleId)?.start_date ?? '9999';
  return [...cards].sort((a, b) => {
    if (col === 'agendado') return (a.nextDate ?? '').localeCompare(b.nextDate ?? '');
    if (col === 'publicado') return (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '');
    const s = start(a).localeCompare(start(b));
    return s !== 0 ? s : b.updatedAt.localeCompare(a.updatedAt);
  });
}
