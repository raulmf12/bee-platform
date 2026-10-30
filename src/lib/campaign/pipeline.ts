// Pipeline R1: ideias e trabalho editorial pendente mantêm seus cartões.
// Cada peça aparece individualmente no próprio estágio, vinculada à origem.
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

const covers = (p: UserPost, ch: IdeaChannel) => p.platform === ch.platform && (!ch.account_id || p.account_id === ch.account_id);

export function buildPipeline(d: {
  campaigns: Campaign[]; ideas: Idea[]; contents: Content[]; posts: UserPost[];
}): PipelineCard[] {
  const known = new Set(d.campaigns.map((c) => c.id));
  const camp = (id?: string | null) => (id && known.has(id) ? id : null);
  const cards: PipelineCard[] = [];
  const live = d.posts.filter((p) => p.status !== 'archived');
  const byContent = new Map<string, UserPost[]>();
  for (const p of live) if (p.content_id) byContent.set(p.content_id, [...(byContent.get(p.content_id) ?? []), p]);
  const contentById = new Map(d.contents.map((c) => [c.id, c]));
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
    // Conteúdo é trabalho editorial. Peças prontas nunca ficam escondidas pelo
    // estágio de uma irmã. Mantemos o conteúdo só quando há trabalho pendente.
    if (c.status === 'validated' && pieces.length && !missing.length) continue;
    const column: PipelineColumn = c.status === 'pending_validation' ? 'pendente' : 'rascunho';
    cards.push({
      id: `content:${c.id}`, kind: 'content', title: c.title, column, campaignId: camp(c.campaign_id), cycleId: c.cycle_id ?? null,
      fn: c.strategic_function ?? null, editorialSlug: c.editorial_slug ?? null, channels: missing, pieces: [],
      pendingPieces: c.status === 'pending_validation' ? 1 : 0, missingChannels: missing,
      origin: idea?.origin, idea, content: c, nextDate: null, publishedAt: null,
      updatedAt: c.updated_at,
    });
  }

  // Cada peça tem coluna, conta, data e ação próprias, inclusive as legadas.
  for (const p of live) {
    const content = p.content_id ? contentById.get(p.content_id) : undefined;
    const idea = content?.idea_id ? d.ideas.find(i => i.id === content.idea_id) : undefined;
    cards.push({
      id: `post:${p.id}`, kind: 'post', title: (p.carousel_text?.quote as string | undefined) || p.title || p.caption?.slice(0, 80) || 'Post',
      column: stageOfPost(p), campaignId: camp(p.campaign_id ?? content?.campaign_id), cycleId: p.cycle_id ?? content?.cycle_id ?? null, fn: content?.strategic_function ?? null,
      editorialSlug: (p.metadata?.editorial_slug as string | undefined) ?? content?.editorial_slug ?? null,
      channels: [{ account_id: p.account_id ?? undefined, platform: p.platform as IdeaChannel['platform'] }], pieces: [p],
      pendingPieces: p.status === 'pending_approval' ? 1 : 0, missingChannels: [], nextDate: p.status === 'scheduled' ? p.scheduled_date ?? null : null,
      publishedAt: p.published_at ?? null, updatedAt: p.updated_at, content, idea,
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

// Marca de repetição na CRIAÇÃO (ideia/conteúdo/peça gerados aqui). Posts importados
// (Instagram/LinkedIn) nunca entram: são o histórico, não criação.
export function repeatOf(c: Pick<PipelineCard, 'idea' | 'content' | 'pieces'>): { text: string; date: string | null } | null {
  // Alertas de origem não provam duplicidade da peça em sua conta de destino.
  const fromIdea = c.pieces.length ? null : c.idea?.repeat_of;
  if (fromIdea) return { text: fromIdea.text, date: fromIdea.said_at };
  const fromContent = c.pieces.length ? null : c.content?.metadata?.repeat;
  if (fromContent?.verdict === 'repeat') return { text: fromContent.of_text ?? '', date: fromContent.of_date };
  for (const p of c.pieces) {
    const r = (p.metadata as { repeat?: { verdict?: string; of_text?: string | null; of_date?: string | null }; imported_from?: string } | null);
    if (r?.repeat?.verdict === 'repeat' && !r.imported_from) return { text: r.repeat.of_text ?? '', date: r.repeat.of_date ?? null };
  }
  return null;
}
