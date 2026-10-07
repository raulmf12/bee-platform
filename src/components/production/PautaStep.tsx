// Etapa 4 — TELA 09: Pauta recomendada para este ciclo.
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ArrowRight, Loader2, Pencil, Plus, RefreshCw, Repeat2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IdeaEditor, type IdeaDraft } from './IdeaEditor';
import { AcjChip } from '@/components/acj/AcjChip';
import { acjCycleApi } from '@/lib/acj/api';
import { ACJ_META, acjColor } from '@/lib/acj/library';
import { approvePauta, generatePauta, swapIdea } from '@/lib/campaign/pauta';
import { ideaApi } from '@/lib/campaignApi';
import {
  ACJ_IDS, FUNCTION_COLORS, FUNCTION_SHORT, STRATEGIC_FUNCTIONS,
  type AcjCyclePlan, type BeeEditorial, type Campaign, type CampaignCycle, type Idea, type SocialAccount,
} from '@/types';

const platformsLabel = (idea: Idea) => {
  const set = new Set(idea.channels.map((c) => (c.platform === 'linkedin' ? 'LinkedIn' : 'Instagram')));
  return [...set].join(' · ');
};

export function PautaStep({ campaign, cycle, ideas, editorials, accounts, onChange, onApproved }: {
  campaign: Campaign; cycle: CampaignCycle; ideas: Idea[]; editorials: BeeEditorial[]; accounts: SocialAccount[];
  onChange: (ideas: Idea[], cycle?: CampaignCycle) => void; onApproved: (cycle: CampaignCycle) => void;
}) {
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [acjPlan, setAcjPlan] = useState<AcjCyclePlan | null>(null);
  useEffect(() => { acjCycleApi.current(cycle.id).then(setAcjPlan).catch(() => setAcjPlan(null)); }, [cycle.id]);
  const live = ideas.filter((i) => i.status !== 'discarded');
  const approved = cycle.status !== 'pauta_ready' && cycle.status !== 'planned';
  const pieces = live.reduce((a, i) => a + i.channels.length, 0);
  const accountsUsed = new Set(live.flatMap((i) => i.channels.map((c) => c.account_id))).size;
  const edName = (slug?: string | null) => editorials.find((e) => e.slug === slug)?.name ?? slug ?? '';
  const campaignAccounts = accounts.filter((a) => campaign.account_ids.includes(a.id));

  async function run<T>(key: string, fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(key);
    try { return await fn(); } catch (e) { toast.error((e as Error).message.slice(0, 180)); return undefined; } finally { setBusy(null); }
  }

  const generate = (mode: 'full' | 'refresh') => run(mode, async () => {
    const r = await generatePauta(cycle, mode, ideas);
    onChange(r.ideas, r.cycle);
    if (mode === 'refresh') toast.success('A Hive trouxe uma nova seleção.');
  });

  const swap = (idea: Idea) => run(`swap-${idea.id}`, async () => {
    const updated = await swapIdea(cycle, idea);
    onChange(ideas.map((i) => (i.id === idea.id ? updated : i)));
    toast.success('Ideia trocada.');
  });

  const save = (idea: Idea | null, d: IdeaDraft) => run('save', async () => {
    if (idea) {
      const updated = await ideaApi.update(idea.id, { ...d, suggested_pieces: d.channels.length });
      onChange(ideas.map((i) => (i.id === idea.id ? updated : i)));
    } else {
      const created = await ideaApi.create({
        ...d, suggested_pieces: d.channels.length, campaign_id: cycle.campaign_id, cycle_id: cycle.id,
        origin: 'user', status: 'proposed', position: live.length,
      });
      onChange([...ideas, created]);
    }
    setEditing(null);
  });

  const remove = (idea: Idea) => run(`rm-${idea.id}`, async () => {
    const updated = await ideaApi.update(idea.id, { status: 'discarded' });
    onChange(ideas.map((i) => (i.id === idea.id ? updated : i)));
  });

  const approve = () => run('approve', async () => {
    const c = await approvePauta(cycle, ideas);
    onChange(ideas.map((i) => (i.status === 'discarded' ? i : { ...i, status: 'approved' as const })), c);
    onApproved(c);
  });

  if (live.length === 0) {
    return (
      <div className="space-y-4 rounded-2xl border border-dashed p-8 text-center" data-testid="pauta-empty">
        <p className="font-display text-lg font-semibold">O planejamento está confirmado, mas ainda não há pauta.</p>
        <Button variant="accent" onClick={() => generate('full')} disabled={!!busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Gerar pauta com a Hive
        </Button>
      </div>
    );
  }

  const byFn = STRATEGIC_FUNCTIONS.map((f) => ({ f, n: live.filter((i) => i.strategic_function === f).length })).filter((x) => x.n > 0);

  return (
    <div className="space-y-5" data-testid="pauta-step">
      <div>
        <h1 className="font-display text-2xl font-bold">4. Ideias recomendadas pela Hive</h1>
        <p className="text-sm text-muted-foreground">Com base nas necessidades estratégicas deste ciclo, nos conteúdos já publicados e programados e na sua Base Hive, recomendamos desenvolver as seguintes ideias.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border bg-card p-4"><p className="font-display text-2xl font-bold" data-testid="pauta-count">{live.length} ideias</p><p className="text-xs text-muted-foreground">Pauta recomendada</p></div>
        <div className="rounded-2xl border bg-card p-4"><p className="font-display text-2xl font-bold" data-testid="pauta-pieces">{pieces} peças</p><p className="text-xs text-muted-foreground">Potencial de desdobramento</p></div>
      </div>

      <ol className="space-y-3">
        {live.map((idea, idx) => (
          <li key={idea.id} data-testid="idea-card">
            {editing === idea.id ? (
              <IdeaEditor editorials={editorials} accounts={campaignAccounts}
                initial={{ title: idea.title, summary: idea.summary ?? '', strategic_function: idea.strategic_function ?? 'presenca', editorial_slug: idea.editorial_slug ?? editorials[0]?.slug ?? '', channels: idea.channels, acj_primary: idea.acj_primary ?? null, acj_secondary: idea.acj_secondary ?? null }}
                onSave={(d) => save(idea, d)} onCancel={() => setEditing(null)} />
            ) : (
              <div className="rounded-2xl border bg-card p-4">
                <p className="font-display text-base font-semibold"><span className="mr-2 text-muted-foreground">{String(idx + 1).padStart(2, '0')} —</span><span data-testid="idea-title">{idea.title}</span></p>
                {idea.summary && <p className="mt-1 text-sm text-muted-foreground">{idea.summary}</p>}
                <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  {idea.strategic_function && <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: FUNCTION_COLORS[idea.strategic_function] }} />Função estratégica: <b>{FUNCTION_SHORT[idea.strategic_function]}</b></span>}
                  {idea.editorial_slug && <span className="text-muted-foreground">Editorial: {edName(idea.editorial_slug)}</span>}
                  <span className="text-muted-foreground">Potencial: {platformsLabel(idea)}</span>
                  <span className="text-muted-foreground" data-testid="idea-pieces">{idea.channels.length} peça{idea.channels.length > 1 ? 's' : ''} sugerida{idea.channels.length > 1 ? 's' : ''}</span>
                  {idea.origin === 'user' && <span className="rounded bg-secondary px-1.5 py-0.5">Sua ideia</span>}
                </p>
                {idea.repeat_of && (
                  <p className="mt-2 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-800 dark:text-amber-300" data-testid="idea-repeat">
                    Parecida com um post de {idea.repeat_of.said_at ? new Date(idea.repeat_of.said_at).toLocaleDateString('pt-BR') : 'antes'}: “{idea.repeat_of.text.split(' — ')[0].slice(0, 140)}”. {idea.repeat_of.reason} Considere trocar a ideia.
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs" data-testid="idea-acj">
                  <AcjChip id={idea.acj_primary} />
                  {idea.acj_secondary && <AcjChip id={idea.acj_secondary} secondary size="xs" />}
                  {idea.acj_role && <span className="text-muted-foreground">Papel na jornada: {idea.acj_role}</span>}
                </div>
                {!approved && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    <Button size="sm" variant="ghost" onClick={() => swap(idea)} disabled={!!busy} aria-label={`Trocar ideia ${idx + 1}`}>
                      {busy === `swap-${idea.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Repeat2 className="h-3.5 w-3.5" />} Trocar ideia
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(idea.id)} disabled={!!busy} aria-label={`Editar ideia ${idx + 1}`}><Pencil className="h-3.5 w-3.5" /> Editar</Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(idea)} disabled={!!busy} aria-label={`Remover ideia ${idx + 1}`}><Trash2 className="h-3.5 w-3.5" /> Remover</Button>
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>

      {!approved && (editing === 'new' ? (
        <IdeaEditor editorials={editorials} accounts={campaignAccounts} saveLabel="Adicionar à pauta"
          initial={{ title: '', summary: '', strategic_function: 'presenca', editorial_slug: editorials[0]?.slug ?? '', channels: campaignAccounts.slice(0, 1).map((a) => ({ account_id: a.id, platform: a.platform })), acj_primary: ACJ_IDS.find((id) => (acjPlan?.counts?.[id] ?? 0) > live.filter((i) => i.acj_primary === id).length) ?? null }}
          onSave={(d) => save(null, d)} onCancel={() => setEditing(null)} />
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setEditing('new')} disabled={!!busy}><Plus className="h-4 w-4" /> Adicionar ideia à pauta</Button>
          <Button variant="ghost" onClick={() => confirm('Pedir uma nova seleção? As ideias propostas pela Hive serão substituídas (as suas ficam).') && generate('refresh')} disabled={!!busy}>
            {busy === 'refresh' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Pedir nova seleção à Hive
          </Button>
        </div>
      ))}

      <section className="rounded-2xl border bg-card p-4" data-testid="pauta-acj">
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Como esta pauta conduz a jornada (ACJ)</h3>
        <ul className="space-y-1.5 text-sm">
          {ACJ_IDS.map((id) => ({ id, n: live.filter((i) => i.acj_primary === id).length, planned: acjPlan?.counts?.[id] })).filter((x) => x.n > 0 || (x.planned ?? 0) > 0).map(({ id, n, planned }) => (
            <li key={id} className="flex justify-between"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: acjColor(id) }} />{id} {ACJ_META[id].name} <span className="text-xs text-muted-foreground">“{ACJ_META[id].short}”</span></span>
              <span>{n} ideia{n === 1 ? '' : 's'}{planned !== undefined && planned !== n ? <span className="ml-1 text-xs text-muted-foreground">(plano: {planned})</span> : null}</span></li>
          ))}
          {live.some((i) => !i.acj_primary) && (
            <li className="text-xs text-amber-700 dark:text-amber-400" data-testid="pauta-acj-missing">{live.filter((i) => !i.acj_primary).length} ideia(s) sem ACJ — a Hive atribui ao desenvolver o conteúdo (fica registrado como atribuição tardia).</li>
          )}
        </ul>
      </section>

      <section className="rounded-2xl border bg-card p-4" data-testid="pauta-strategy">
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Como esta pauta cumpre sua estratégia</h3>
        <ul className="space-y-1.5 text-sm">
          {byFn.map(({ f, n }) => {
            const planned = cycle.plan?.needs.find((x) => x.function === f)?.count;
            return <li key={f} className="flex justify-between"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: FUNCTION_COLORS[f] }} />{FUNCTION_SHORT[f]}</span>
              <span>{n} ideia{n > 1 ? 's' : ''}{planned !== undefined && planned !== n ? <span className="ml-1 text-xs text-muted-foreground">(plano: {planned})</span> : null}</span></li>;
          })}
          <li className="flex justify-between border-t pt-1.5 font-medium"><span>Potencial de desdobramento</span><span>{pieces} peças · {accountsUsed} conta{accountsUsed > 1 ? 's' : ''}</span></li>
        </ul>
      </section>

      {!approved && (
        <div className="flex justify-end">
          <Button variant="accent" size="lg" onClick={approve} disabled={!!busy || editing !== null}>
            {busy === 'approve' ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Aprovar pauta e desenvolver conteúdos <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
