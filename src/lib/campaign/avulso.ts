// "Um conteúdo" (Criar → Um conteúdo): conteúdo avulso, FORA de campanha, que passa
// pela mesma esteira da Produção (desenvolver → validar → peças → revisão → agenda,
// com o mesmo ciclo de aprendizado). Por baixo, usa um contêiner por usuário
// (campanha metadata.kind='avulso', sem datas) e um "ciclo" por conteúdo. Na
// superfície ele é sempre "Sem campanha": some das listas, timeline e barras.
import { addDays, format } from 'date-fns';
import { campaignApi, cycleApi, ideaApi } from '@/lib/campaignApi';
import type { Campaign, CampaignCycle, Idea, IdeaChannel, SocialAccount, StrategicFunction } from '@/types';

export const AVULSO_NAME = 'Sem campanha';

export function isAvulso(c?: Pick<Campaign, 'metadata'> | null): boolean {
  return (c?.metadata as { kind?: string } | undefined)?.kind === 'avulso';
}

export interface AvulsoDraft { title: string; summary: string; strategic_function: StrategicFunction; editorial_slug: string; channels: IdeaChannel[] }

export async function startAvulso(d: AvulsoDraft, accounts: SocialAccount[]): Promise<{ campaign: Campaign; cycle: CampaignCycle; idea: Idea }> {
  const campaign = (await campaignApi.getAvulso()) ?? await campaignApi.create({
    name: AVULSO_NAME, type: 'organica', status: 'active', color: '#94A3B8',
    account_ids: accounts.map((a) => a.id), cadence: {}, metadata: { kind: 'avulso' },
  });
  const existing = await cycleApi.listByCampaign(campaign.id);
  const today = new Date();
  const [cycle] = await cycleApi.createMany([{
    campaign_id: campaign.id, idx: existing.reduce((m, c) => Math.max(m, c.idx), 0) + 1,
    start_date: format(today, 'yyyy-MM-dd'), end_date: format(addDays(today, 6), 'yyyy-MM-dd'),
    status: 'pauta_approved', plan: null, review_due: null,
  }]);
  const idea = await ideaApi.create({
    campaign_id: campaign.id, cycle_id: cycle.id, title: d.title, summary: d.summary || null,
    strategic_function: d.strategic_function, editorial_slug: d.editorial_slug, channels: d.channels,
    suggested_pieces: d.channels.length, origin: 'user', status: 'approved', position: 0,
  });
  return { campaign, cycle, idea };
}
