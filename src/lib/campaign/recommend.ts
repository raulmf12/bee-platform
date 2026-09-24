// "Hive, recomende" (Tela 02): o melhor próximo movimento a partir do estado real.
// Regras determinísticas (sem LLM): rápido, previsível e explicável.
import { campaignApi, cycleApi } from '@/lib/campaignApi';
import type { Campaign, CampaignCycle } from '@/types';

export interface NextMove { title: string; body: string; cta: string; to: string }

const ADVANCED: CampaignCycle['status'][] = ['pauta_approved', 'developing', 'producing', 'ready', 'done'];

export function nextMoveFrom(campaigns: Campaign[], cycles: CampaignCycle[], today = new Date().toISOString().slice(0, 10)): NextMove {
  const active = campaigns.filter((c) => c.status === 'active');
  if (active.length === 0) {
    return {
      title: 'Comece por uma Campanha Orgânica',
      body: 'Você ainda não tem uma campanha ativa. Uma campanha dá direção estratégica ao seu conteúdo e a Hive passa a planejar e produzir em ciclos.',
      cta: 'Criar campanha', to: '/campanhas/nova',
    };
  }
  for (const c of active) {
    const current = cycles.find((cy) => cy.campaign_id === c.id && cy.start_date <= today && today <= cy.end_date);
    if (current && !ADVANCED.includes(current.status)) {
      return {
        title: `${c.name} · Ciclo ${String(current.idx).padStart(2, '0')}`,
        body: 'O ciclo atual ainda não tem pauta aprovada. Revisar agora mantém a semana coberta.',
        cta: 'Revisar ciclo', to: `/producao?campaign=${c.id}&cycle=${current.id}`,
      };
    }
  }
  const next = active
    .map((c) => cycles.find((cy) => cy.campaign_id === c.id && cy.start_date > today && !ADVANCED.includes(cy.status)))
    .find(Boolean);
  if (next) {
    const c = active.find((x) => x.id === next.campaign_id)!;
    return {
      title: `Adiantar o próximo ciclo de ${c.name}`,
      body: 'O ciclo atual está encaminhado. Adiantar o próximo dá folga pra revisar com calma.',
      cta: 'Planejar próximo ciclo', to: `/producao?campaign=${c.id}&cycle=${next.id}`,
    };
  }
  return {
    title: 'Suas campanhas estão em dia',
    body: 'Que tal criar um conteúdo avulso a partir de uma ideia sua?',
    cta: 'Criar um conteúdo', to: '/posts/novo',
  };
}

export async function recommendNextMove(): Promise<NextMove> {
  const [campaigns, cycles] = await Promise.all([campaignApi.list(), cycleApi.listAll()]);
  return nextMoveFrom(campaigns, cycles);
}
