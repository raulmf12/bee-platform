// Estado operacional completo (campanhas, ciclos, ideias, conteúdos, peças, contas)
// para a Home e o Pipeline. Peças vêm do postStore (mesma fonte do resto do app).
import { useCallback, useEffect, useState } from 'react';
import { accountApi, campaignApi, contentApi, cycleApi, ideaApi, metricsApi } from '@/lib/campaignApi';
import { beeApi } from '@/lib/api';
import { usePostStore } from '@/store/postStore';
import type { BeeEditorial, Campaign, CampaignCycle, Content, Idea, PostMetrics, SocialAccount } from '@/types';

export interface OpsState {
  campaigns: Campaign[]; cycles: CampaignCycle[]; ideas: Idea[]; contents: Content[]; accounts: SocialAccount[]; avulsoId: string | null;
  metrics: PostMetrics[]; editorials: BeeEditorial[];
}

export function useOps() {
  const { posts, load } = usePostStore();
  const postsError = usePostStore((s) => s.error);
  const [ops, setOps] = useState<OpsState | null>(null);
  // Falha nas leituras ESSENCIAIS (doc 04 §13): nunca vira "nada esperando por você".
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    const [campaigns, cycles, ideas, contents, accounts, avulso, metrics, editorials] = await Promise.all([
      campaignApi.list(), cycleApi.listAll(), ideaApi.listAll(), contentApi.listAll(), accountApi.list(), campaignApi.getAvulso(),
      metricsApi.listAll().catch(() => []), beeApi.listEditorials().catch(() => []), load(),
    ]);
    setOps({ campaigns, cycles, ideas, contents, accounts, avulsoId: avulso?.id ?? null, metrics, editorials });
    setError(null);
  }, [load]);
  const retry = useCallback(() => { setError(null); return reload().catch((e) => { console.error(e); setError(String((e as Error).message ?? e)); }); }, [reload]);
  useEffect(() => { void retry(); }, [retry]);
  // peças com falha de leitura: o conjunto não é consistente — tratar como erro
  return { ops: error || postsError ? null : ops, posts, reload, error: error ?? postsError, retry };
}
