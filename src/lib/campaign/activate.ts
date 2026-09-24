// Ativação da campanha (Tela 07 → 08): grava a campanha e cria os ciclos semanais.
import { campaignApi, cycleApi } from '@/lib/campaignApi';
import { buildCycleRanges, mondayOf, toISODate } from './dates';
import { finalizeStrategy, CAMPAIGN_PALETTE } from './strategy';
import { cadenceFor, mergePrefs, PLATFORM_GUIDE } from '@/lib/schedule';
import type {
  Campaign, CampaignCycle, CampaignMoment, CampaignType, DistributionPrefs, IntensityLevel,
  SocialAccount, StrategicFunction, StrategyMix,
} from '@/types';
import { addDays } from 'date-fns';

export interface DraftStrategy {
  mix: StrategyMix;
  rationale: string;
  phases: Array<Record<StrategicFunction, IntensityLevel>>;
  recommended_weeks: number;
  duration_rationale: string;
}

// Peças por semana de cada conta: a cadência configurada na Agenda ou o guia da plataforma.
export function defaultCadence(accounts: SocialAccount[], prefs?: DistributionPrefs | null): Record<string, number> {
  const merged = mergePrefs(prefs);
  return Object.fromEntries(accounts.map((a) => [
    a.id,
    cadenceFor(merged, a.platform).per_week || PLATFORM_GUIDE[a.platform]?.defaultPerWeek || 3,
  ]));
}

export function defaultCampaignName(type: CampaignType, ownerName: string | undefined, productName?: string): string {
  const first = (ownerName ?? '').split(' ')[0] || 'Principal';
  return type === 'vendas' ? (productName ? `Lançamento · ${productName}` : 'Campanha de Vendas') : `Presença ${first}`;
}

export async function activateCampaign(p: {
  type: CampaignType; name: string; intent: string; moment: CampaignMoment; strategy: DraftStrategy;
  weeks: number; productId?: string | null; accounts: SocialAccount[]; cadence: Record<string, number>;
  existingCount: number; today?: Date;
}): Promise<{ campaign: Campaign; cycles: CampaignCycle[] }> {
  const today = p.today ?? new Date();
  const start = mondayOf(today);
  const campaign = await campaignApi.create({
    name: p.name.trim(),
    type: p.type,
    status: 'active',
    intent: p.intent.trim() || null,
    moment: p.moment,
    strategy: finalizeStrategy(p.strategy, p.weeks),
    duration_weeks: p.weeks,
    start_date: toISODate(start),
    end_date: toISODate(addDays(start, p.weeks * 7 - 1)),
    product_id: p.productId ?? null,
    color: CAMPAIGN_PALETTE[p.existingCount % CAMPAIGN_PALETTE.length],
    account_ids: p.accounts.map((a) => a.id),
    cadence: p.cadence,
    activated_at: new Date().toISOString(),
  });
  const cycles = await cycleApi.createMany(buildCycleRanges(start, p.weeks).map((r) => ({
    campaign_id: campaign.id,
    idx: r.idx,
    start_date: r.start_date,
    end_date: r.end_date,
    status: 'not_started' as const,
    plan: null,
    // O ciclo atual pede revisão já; os demais, até a véspera do início.
    review_due: r.idx === 1 ? toISODate(today) : toISODate(addDays(new Date(`${r.start_date}T12:00:00`), -1)),
  })));
  return { campaign, cycles };
}
