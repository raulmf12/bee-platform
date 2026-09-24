// Menu CAMPANHAS: todas as campanhas com estado, semana, equilíbrio e produção.
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, Plus, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MixStrip } from '@/components/campaign/MixBars';
import { campaignApi, contentApi } from '@/lib/campaignApi';
import { campaignWeek, formatDay } from '@/lib/campaign/dates';
import { CAMPAIGN_STATUS_LABELS } from '@/lib/campaign/labels';
import { CAMPAIGN_TYPE_LABELS, type Campaign, type Content } from '@/types';

export function Campaigns() {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [contents, setContents] = useState<Content[]>([]);

  useEffect(() => {
    Promise.all([campaignApi.list(), contentApi.listAll()])
      .then(([c, ct]) => { setCampaigns(c); setContents(ct); })
      .catch(() => setCampaigns([]));
  }, []);

  if (!campaigns) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">Campanhas</h1>
          <p className="text-sm text-muted-foreground">A estratégia que orienta a criação dos seus conteúdos.</p>
        </div>
        <Button variant="accent" onClick={() => navigate('/campanhas/nova')}><Plus className="h-4 w-4" /> Nova campanha</Button>
      </div>

      {campaigns.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center" data-testid="campaigns-empty">
          <p className="font-display text-lg font-semibold">Nenhuma campanha ainda</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Uma campanha define o equilíbrio estratégico do seu conteúdo e a Hive transforma isso em ciclos de produção.
          </p>
          <Button variant="accent" className="mt-5" onClick={() => navigate('/campanhas/nova')}>Criar primeira campanha</Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2" data-testid="campaigns-list">
          {campaigns.map((c) => {
            const wk = campaignWeek(c.start_date, c.duration_weeks);
            const produced = contents.filter((ct) => ct.campaign_id === c.id && ct.status !== 'discarded').length;
            return (
              <div key={c.id} className="flex flex-col gap-4 rounded-2xl border bg-card p-5" data-testid="campaign-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: c.color ?? '#94A3B8' }} />
                      <Link to={`/campanhas/${c.id}`} className="truncate font-display text-lg font-semibold hover:underline">{c.name}</Link>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {CAMPAIGN_TYPE_LABELS[c.type]}
                      {c.start_date && c.end_date ? ` · ${formatDay(c.start_date)} – ${formatDay(c.end_date)}` : ''}
                    </p>
                  </div>
                  <Badge variant={c.status === 'active' ? 'accent' : 'secondary'}>{CAMPAIGN_STATUS_LABELS[c.status]}</Badge>
                </div>
                {c.strategy?.mix && <MixStrip mix={c.strategy.mix} />}
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                  <div className="text-muted-foreground">
                    {wk?.state === 'running' && <span className="font-medium text-foreground" data-testid="campaign-week">Semana {wk.current} de {wk.total}</span>}
                    {wk?.state === 'upcoming' && <span>Começa em breve</span>}
                    {wk?.state === 'finished' && <span>Período concluído</span>}
                    <span className="ml-2">· {produced === 0 ? 'Nenhum conteúdo produzido ainda' : `${produced} conteúdo${produced > 1 ? 's' : ''}`}</span>
                  </div>
                  {c.status === 'active' && (
                    <Button size="sm" variant="outline" onClick={() => navigate(`/producao?campaign=${c.id}`)}>
                      {produced === 0 ? 'Iniciar produção' : 'Continuar produção'} <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
