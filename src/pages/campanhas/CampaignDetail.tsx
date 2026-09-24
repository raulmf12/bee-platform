// Detalhe da campanha: momento, estratégia ("Ver estratégia" = matriz), ciclos,
// contas/cadência e ações (renomear, pausar, encerrar, excluir).
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, Flag, Instagram, Linkedin, Loader2, Pause, Pencil, Play, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { MixBars } from '@/components/campaign/MixBars';
import { StrategyMatrix } from '@/components/campaign/StrategyMatrix';
import { accountApi, campaignApi, cycleApi } from '@/lib/campaignApi';
import { campaignWeek, formatDay, formatRange } from '@/lib/campaign/dates';
import { CAMPAIGN_STATUS_LABELS, CYCLE_STATUS_LABELS } from '@/lib/campaign/labels';
import { CAMPAIGN_TYPE_LABELS, type Campaign, type CampaignCycle, type SocialAccount } from '@/types';

export function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<Campaign | null | undefined>(undefined);
  const [cycles, setCycles] = useState<CampaignCycle[]>([]);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  // Rascunhos de edição SEPARADOS do dado do servidor: um recarregamento
  // (StrictMode, refetch) nunca apaga o que a pessoa está digitando.
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [showMatrix, setShowMatrix] = useState(false);
  const [cadenceDraft, setCadenceDraft] = useState<Record<string, number> | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const [c, cy, acc] = await Promise.all([campaignApi.get(id), cycleApi.listByCampaign(id), accountApi.list()]);
    setCampaign(c); setCycles(cy); setAccounts(acc);
  }, [id]);

  useEffect(() => { void load().catch(() => setCampaign(null)); }, [load]);

  if (campaign === undefined) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>;
  if (campaign === null) {
    return (
      <div className="mx-auto max-w-3xl p-8 text-center">
        <p className="text-muted-foreground">Campanha não encontrada.</p>
        <Button asChild variant="outline" className="mt-4"><Link to="/campanhas">Voltar</Link></Button>
      </div>
    );
  }

  const wk = campaignWeek(campaign.start_date, campaign.duration_weeks);
  const today = new Date().toISOString().slice(0, 10);
  const campaignAccounts = accounts.filter((a) => campaign.account_ids.includes(a.id));

  async function patch(p: Partial<Campaign>, msg: string) {
    const updated = await campaignApi.update(campaign!.id, p);
    setCampaign(updated);
    toast.success(msg);
  }

  const cadence = cadenceDraft ?? campaign.cadence ?? {};

  async function saveName() {
    if (!nameDraft?.trim()) return;
    await patch({ name: nameDraft.trim() }, 'Nome atualizado.');
    setNameDraft(null);
  }

  async function saveCadence() {
    await patch({ cadence }, 'Cadência atualizada — vale para os próximos planejamentos.');
    setCadenceDraft(null);
  }

  async function remove() {
    if (!confirm(`Excluir a campanha "${campaign!.name}"? Ciclos e pauta são apagados. Conteúdos e peças já produzidos ficam em "Sem campanha".`)) return;
    await campaignApi.remove(campaign!.id);
    toast.success('Campanha excluída.');
    navigate('/campanhas');
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 lg:p-8">
      <Link to="/campanhas" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Campanhas</Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {nameDraft !== null ? (
            <div className="flex items-center gap-2">
              <Input aria-label="Nome da campanha" value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} className="w-72" onKeyDown={(e) => e.key === 'Enter' && saveName()} autoFocus />
              <Button size="sm" variant="accent" onClick={saveName}>Salvar</Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: campaign.color ?? '#94A3B8' }} />
              <h1 className="font-display text-3xl font-bold" data-testid="campaign-name">{campaign.name}</h1>
              <Button size="icon" variant="ghost" aria-label="Renomear" onClick={() => setNameDraft(campaign.name)}><Pencil className="h-4 w-4" /></Button>
            </div>
          )}
          <p className="mt-1 text-sm text-muted-foreground">
            {CAMPAIGN_TYPE_LABELS[campaign.type]}
            {campaign.start_date && campaign.end_date ? ` · ${formatDay(campaign.start_date)} – ${formatDay(campaign.end_date)}` : ''}
            {wk?.state === 'running' ? ` · Semana ${wk.current} de ${wk.total}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={campaign.status === 'active' ? 'accent' : 'secondary'} data-testid="campaign-status">{CAMPAIGN_STATUS_LABELS[campaign.status]}</Badge>
          {campaign.status === 'active' && (
            <>
              <Button variant="accent" onClick={() => navigate(`/producao?campaign=${campaign.id}`)}>Produzir conteúdos <ArrowRight className="h-4 w-4" /></Button>
              <Button variant="outline" onClick={() => patch({ status: 'paused' }, 'Campanha pausada.')}><Pause className="h-4 w-4" /> Pausar</Button>
            </>
          )}
          {campaign.status === 'paused' && (
            <Button variant="outline" onClick={() => patch({ status: 'active' }, 'Campanha retomada.')}><Play className="h-4 w-4" /> Retomar</Button>
          )}
          {campaign.status !== 'ended' && (
            <Button variant="ghost" onClick={() => confirm('Encerrar esta campanha?') && patch({ status: 'ended' }, 'Campanha encerrada.')}><Flag className="h-4 w-4" /> Encerrar</Button>
          )}
          <Button variant="ghost" size="icon" aria-label="Excluir campanha" onClick={remove}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {campaign.strategy && (
            <section className="space-y-4 rounded-2xl border bg-card p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-lg font-semibold">Estratégia</h2>
                <Button variant="ghost" size="sm" onClick={() => setShowMatrix((v) => !v)}>{showMatrix ? 'Ocultar' : 'Ver estratégia'}</Button>
              </div>
              <MixBars mix={campaign.strategy.mix} compact />
              <p className="text-sm leading-relaxed text-muted-foreground">{campaign.strategy.rationale}</p>
              {showMatrix && campaign.strategy.matrix?.length > 0 && <StrategyMatrix matrix={campaign.strategy.matrix} />}
            </section>
          )}

          <section className="space-y-3 rounded-2xl border bg-card p-5">
            <h2 className="font-display text-lg font-semibold">Ciclos</h2>
            <ul className="divide-y" data-testid="cycles-list">
              {cycles.map((cy) => {
                const current = cy.start_date <= today && today <= cy.end_date;
                return (
                  <li key={cy.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5" data-testid="cycle-row">
                    <div>
                      <p className="text-sm font-medium">
                        Ciclo {String(cy.idx).padStart(2, '0')} · {formatRange(cy.start_date, cy.end_date)}
                        {current && <span className="ml-2 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-accent">atual</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">{CYCLE_STATUS_LABELS[cy.status]}</p>
                    </div>
                    {campaign.status === 'active' && cy.status !== 'done' && cy.end_date >= today && (
                      <Button size="sm" variant="ghost" onClick={() => navigate(`/producao?campaign=${campaign.id}&cycle=${cy.id}`)}>Abrir <ArrowRight className="h-3.5 w-3.5" /></Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        <div className="space-y-6">
          {campaign.moment && (
            <section className="space-y-2 rounded-2xl border bg-card p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Momento</p>
              <p className="font-display text-lg font-semibold text-accent">{campaign.moment.label}</p>
              <p className="text-sm leading-relaxed text-muted-foreground">{campaign.moment.summary}</p>
            </section>
          )}
          <section className="space-y-3 rounded-2xl border bg-card p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contas e cadência</p>
            {campaignAccounts.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma conta nesta campanha.</p>}
            {campaignAccounts.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-sm">
                  {a.platform === 'linkedin' ? <Linkedin className="h-4 w-4 text-[#0A66C2]" /> : <Instagram className="h-4 w-4 text-[#E1306C]" />}
                  {a.label}
                </span>
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <input type="number" min={0} max={21} aria-label={`Peças por semana ${a.label}`} value={cadence[a.id] ?? 0}
                    onChange={(e) => setCadenceDraft({ ...cadence, [a.id]: Math.max(0, Number(e.target.value) || 0) })}
                    className="w-12 rounded-md border border-input bg-background px-1.5 py-0.5 text-right text-sm text-foreground" />
                  /semana
                </span>
              </div>
            ))}
            {campaignAccounts.length > 0 && <Button size="sm" variant="outline" onClick={saveCadence}>Salvar cadência</Button>}
          </section>
        </div>
      </div>
    </div>
  );
}
