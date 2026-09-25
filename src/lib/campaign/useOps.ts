// Estado operacional completo (campanhas, ciclos, ideias, conteúdos, peças, contas)
// para a Home e o Pipeline. Peças vêm do postStore (mesma fonte do resto do app).
import { useCallback, useEffect, useState } from 'react';
import { accountApi, campaignApi, contentApi, cycleApi, ideaApi } from '@/lib/campaignApi';
import { usePostStore } from '@/store/postStore';
import type { Campaign, CampaignCycle, Content, Idea, SocialAccount } from '@/types';

export interface OpsState { campaigns: Campaign[]; cycles: CampaignCycle[]; ideas: Idea[]; contents: Content[]; accounts: SocialAccount[]; avulsoId: string | null }

export function useOps() {
  const { posts, load } = usePostStore();
  const [ops, setOps] = useState<OpsState | null>(null);
  const reload = useCallback(async () => {
    const [campaigns, cycles, ideas, contents, accounts, avulso] = await Promise.all([
      campaignApi.list(), cycleApi.listAll(), ideaApi.listAll(), contentApi.listAll(), accountApi.list(), campaignApi.getAvulso(), load(),
    ]);
    setOps({ campaigns, cycles, ideas, contents, accounts, avulsoId: avulso?.id ?? null });
  }, [load]);
  useEffect(() => { void reload().catch((e) => { console.error(e); setOps({ campaigns: [], cycles: [], ideas: [], contents: [], accounts: [], avulsoId: null }); }); }, [reload]);
  return { ops, posts, reload };
}
