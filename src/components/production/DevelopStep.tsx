// Etapa 5 — TELAS 10 e 11: desenvolver os conteúdos-mãe e validá-los um a um,
// no formato preferencial de validação do produtor (Marcos: LinkedIn frase+texto).
// "Ideia → Conteúdo → Desdobramentos" (o termo conteúdo-mãe fica na arquitetura).
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ArrowRight, Check, CheckCircle2, Instagram, Linkedin, Loader2, Pencil, RefreshCw, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { contentApi } from '@/lib/campaignApi';
import { acjContractApi } from '@/lib/acj/api';
import { AcjContractSummary } from '@/components/acj/AcjContractSummary';
import { isAvulso } from '@/lib/campaign/avulso';
import { developIdeas, discardContent, editContent, finishValidation, reviseWithHive, validateContent } from '@/lib/campaign/develop';
import {
  CAMPAIGN_TYPE_LABELS, FUNCTION_COLORS, FUNCTION_LABELS,
  type AcjContentContract, type BeeEditorial, type Campaign, type CampaignCycle, type Content, type Idea, type SocialAccount,
} from '@/types';

const ADJUST_EXAMPLES = ['Quero uma abertura mais provocativa.', 'Quero algo menos corporativo.', 'Essa frase não parece comigo. Reescreva mantendo a ideia.'];

export function DevelopStep({ campaign, cycle, ideas, editorials, accounts, onIdeasChange, onCycleChange, onDone }: {
  campaign: Campaign; cycle: CampaignCycle; ideas: Idea[]; editorials: BeeEditorial[]; accounts: SocialAccount[];
  onIdeasChange: (i: Idea[]) => void; onCycleChange: (c: CampaignCycle) => void; onDone: (cycle: CampaignCycle) => void;
}) {
  const [contents, setContents] = useState<Content[] | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [editing, setEditing] = useState<{ frase: string; texto: string } | null>(null);
  const [justApproved, setJustApproved] = useState<{ content: Content; hasPiece: boolean } | null>(null);

  useEffect(() => { contentApi.listByCycle(cycle.id).then(setContents).catch(() => setContents([])); }, [cycle.id]);

  const approvedIdeas = ideas.filter((i) => i.status === 'approved' || i.status === 'developed');
  const live = useMemo(() => (contents ?? []).filter((c) => c.status !== 'discarded').sort((a, b) => a.position - b.position), [contents]);
  const missing = approvedIdeas.filter((i) => i.status === 'approved' && !(contents ?? []).some((c) => c.idea_id === i.id));
  const current = live.find((c) => c.status === 'pending_validation' || c.status === 'developing');
  // Contrato ACJ de cada conteúdo (recarrega quando a Hive refaz uma versão).
  const [contracts, setContracts] = useState<Record<string, AcjContentContract>>({});
  const contractKey = live.map((c) => `${c.id}:${c.updated_at}`).join(',');
  useEffect(() => {
    if (!live.length) return;
    acjContractApi.listByContents(live.map((c) => c.id))
      .then((list) => setContracts(Object.fromEntries(list.map((k) => [k.content_id, k]))))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractKey]);
  const currentIdx = current ? live.indexOf(current) : -1;
  const ideaOf = (c: Content) => ideas.find((i) => i.id === c.idea_id);
  const edName = (slug?: string | null) => editorials.find((e) => e.slug === slug)?.name;
  const accountLabel = (id?: string) => accounts.find((a) => a.id === id)?.label ?? '';

  function replace(c: Content) { setContents((cs) => (cs ?? []).map((x) => (x.id === c.id ? c : x))); }

  async function develop() {
    setBusy('develop');
    setProgress({ done: 0, total: missing.length });
    try {
      const r = await developIdeas(cycle, ideas, contents ?? [], (done, total, content) => {
        setProgress({ done, total });
        if (content) setContents((cs) => [...(cs ?? []), content]);
      });
      onCycleChange(r.cycle);
      onIdeasChange(ideas.map((i) => (r.contents.some((c) => c.idea_id === i.id) ? { ...i, status: 'developed' as const } : i)));
    } catch (e) {
      toast.error(`Parte dos conteúdos não foi desenvolvida: ${(e as Error).message.slice(0, 140)}. Tente de novo.`);
    } finally { setBusy(null); setProgress(null); }
  }

  async function act<T>(key: string, fn: () => Promise<T>) {
    setBusy(key);
    try { return await fn(); } catch (e) { toast.error((e as Error).message.slice(0, 180)); return undefined; } finally { setBusy(null); }
  }

  const approve = (c: Content) => act('approve', async () => {
    const r = await validateContent(c, ideaOf(c), campaign, edName(c.editorial_slug));
    replace(r.content);
    setJustApproved({ content: r.content, hasPiece: !!r.piece });
    setAdjusting(false); setEditing(null);
  });
  const revise = (c: Content, mode: 'adjust' | 'new_version') => act(mode, async () => {
    const idea = ideaOf(c);
    if (!idea) throw new Error('Ideia de origem não encontrada.');
    replace(await reviseWithHive(c, idea, mode, instruction));
    setInstruction(''); setAdjusting(false);
    toast.success(mode === 'adjust' ? 'A Hive ajustou o conteúdo.' : 'A Hive trouxe uma nova versão.');
  });
  const saveEdit = (c: Content) => act('edit', async () => { replace(await editContent(c, editing!)); setEditing(null); });
  const discard = (c: Content) => act('discard', async () => {
    if (!confirm('Descartar este conteúdo? A ideia sai do ciclo.')) return;
    replace(await discardContent(c));
    onIdeasChange(ideas.map((i) => (i.id === c.idea_id ? { ...i, status: 'discarded' as const } : i)));
  });
  const finish = () => act('finish', async () => onDone(await finishValidation(cycle)));

  if (!contents) return <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-accent" /></div>;

  // ---------------- TELA 10: pauta aprovada → desenvolver ----------------
  if (live.length === 0 || (missing.length > 0 && !current && !justApproved)) {
    return (
      <div className="space-y-5" data-testid="develop-intro">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-600"><CheckCircle2 className="h-4 w-4" /> {isAvulso(campaign) ? 'Ideia registrada' : 'Pauta aprovada'}</p>
          <h1 className="mt-1 font-display text-2xl font-bold">{isAvulso(campaign) ? 'Agora a Hive vai transformar sua ideia em conteúdo.' : 'Agora a Hive vai transformar as ideias aprovadas em conteúdos.'}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Cada conteúdo desenvolve uma linha de pensamento completa antes de ganhar formatos, canais e peças.</p>
        </div>
        <div className="rounded-2xl border bg-card p-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{approvedIdeas.length} {approvedIdeas.length === 1 ? 'ideia aprovada' : 'ideias aprovadas'}</p>
          <ol className="space-y-2 text-sm">
            {approvedIdeas.map((i, n) => {
              const done = (contents ?? []).some((c) => c.idea_id === i.id);
              return <li key={i.id} className="flex items-start gap-3"><span className="w-6 shrink-0 text-muted-foreground">{String(n + 1).padStart(2, '0')}</span>
                <span className="flex-1">{i.title}</span>{done && <Check className="h-4 w-4 text-emerald-600" />}</li>;
            })}
          </ol>
        </div>
        {progress && (
          <div className="space-y-2" data-testid="develop-progress">
            <p className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin text-accent" /> Desenvolvendo conteúdos… {progress.done} de {progress.total}</p>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary"><div className="h-full bg-accent transition-all" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} /></div>
          </div>
        )}
        <div className="flex justify-end">
          <Button variant="accent" size="lg" onClick={develop} disabled={!!busy || missing.length === 0}>
            {busy === 'develop' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {live.length > 0 ? 'Desenvolver os que faltam' : 'Desenvolver conteúdos'} <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  // ---------------- AO APROVAR (entre um conteúdo e o próximo) ----------------
  if (justApproved) {
    const c = justApproved.content;
    const idea = ideaOf(c);
    const others = (idea?.channels ?? []).filter((ch) => !(justApproved.hasPiece && ch.platform === 'linkedin'));
    const last = !current;
    return (
      <div className="space-y-5" data-testid="content-approved">
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6">
          <p className="flex items-center gap-2 font-display text-xl font-semibold"><CheckCircle2 className="h-5 w-5 text-emerald-600" /> Conteúdo aprovado</p>
          <p className="mt-1 text-sm text-muted-foreground">A linha de pensamento está validada.</p>
          <ul className="mt-4 space-y-2 text-sm">
            {justApproved.hasPiece && (
              <li className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2">
                <span className="flex items-center gap-2"><Linkedin className="h-4 w-4 text-[#0A66C2]" /> LinkedIn · {accountLabel(idea?.channels.find((x) => x.platform === 'linkedin')?.account_id)} — Texto + frase</span>
                <span className="flex items-center gap-1 text-emerald-600"><Check className="h-4 w-4" /> Primeira peça aprovada</span>
              </li>
            )}
            {others.map((ch, i) => (
              <li key={i} className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2">
                <span className="flex items-center gap-2">{ch.platform === 'linkedin' ? <Linkedin className="h-4 w-4 text-[#0A66C2]" /> : <Instagram className="h-4 w-4 text-[#E1306C]" />}
                  {ch.platform === 'linkedin' ? 'LinkedIn' : 'Instagram'} · {accountLabel(ch.account_id)} — recomendado pela Hive</span>
                <span className="text-muted-foreground">A desenvolver</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex justify-end">
          <Button variant="accent" size="lg" onClick={() => setJustApproved(null)}>{last ? (isAvulso(campaign) ? 'Ver resumo' : 'Ver resumo do ciclo') : 'Próximo conteúdo'} <ArrowRight className="h-4 w-4" /></Button>
        </div>
      </div>
    );
  }

  // ---------------- AO FINAL: todos validados ----------------
  if (!current) {
    const validated = live.filter((c) => c.status === 'validated');
    const potential = validated.reduce((a, c) => a + (ideaOf(c)?.channels.length ?? 1), 0);
    const already = validated.filter((c) => c.metadata?.validation_post_id).length;
    return (
      <div className="space-y-5" data-testid="develop-done">
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6">
          <p className="flex items-center gap-2 font-display text-xl font-semibold"><CheckCircle2 className="h-5 w-5 text-emerald-600" /> {validated.length} conteúdos aprovados</p>
          <p className="mt-1 text-sm text-muted-foreground">{isAvulso(campaign) ? 'A linha de pensamento está validada.' : 'As linhas de pensamento deste ciclo estão validadas.'}</p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="develop-stats">
            {[[validated.length, 'conteúdos'], [potential, 'peças potenciais'], [already, 'já aprovadas no formato de validação'], [potential - already, 'desdobramentos a desenvolver']].map(([n, l]) => (
              <div key={String(l)} className="rounded-xl border bg-card p-3"><p className="font-display text-2xl font-bold">{n}</p><p className="text-xs text-muted-foreground">{l}</p></div>
            ))}
          </div>
        </div>
        {cycle.status === 'developing' && (
          <div className="flex justify-end">
            <Button variant="accent" size="lg" onClick={finish} disabled={!!busy}>
              {busy === 'finish' ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Desenvolver desdobramentos <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    );
  }

  // ---------------- TELA 11: validação do conteúdo N de M ----------------
  const c = current;
  const f = c.strategic_function;
  return (
    <div className="space-y-5" data-testid="validate-step">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" data-testid="validate-counter">Conteúdo {String(currentIdx + 1).padStart(2, '0')} de {String(live.length).padStart(2, '0')}</p>
        <h1 className="mt-1 font-display text-2xl font-bold">{c.title}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
          {f && <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: FUNCTION_COLORS[f] }} />Função estratégica: <b className="text-foreground">{FUNCTION_LABELS[f]}</b></span>}
          <span>Origem: {isAvulso(campaign) ? 'Conteúdo avulso' : `${CAMPAIGN_TYPE_LABELS[campaign.type]} · Ciclo ${String(cycle.idx).padStart(2, '0')}`}</span>
        </p>
      </div>

      <section className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-accent">A Hive desenvolveu esta ideia</p>
        <p className="text-xs text-muted-foreground">Apresentado no seu formato preferencial de validação.</p>
        {editing ? (
          <div className="space-y-3 rounded-2xl border bg-card p-5" data-testid="content-editor">
            <div className="space-y-1"><p className="text-xs font-semibold uppercase text-muted-foreground">Frase</p>
              <Textarea aria-label="Frase" rows={2} value={editing.frase} onChange={(e) => setEditing({ ...editing, frase: e.target.value })} /></div>
            <div className="space-y-1"><p className="text-xs font-semibold uppercase text-muted-foreground">Texto</p>
              <Textarea aria-label="Texto" rows={12} value={editing.texto} onChange={(e) => setEditing({ ...editing, texto: e.target.value })} /></div>
            <div className="flex gap-2"><Button variant="accent" size="sm" onClick={() => saveEdit(c)} disabled={!!busy}>Salvar edição</Button>
              <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancelar</Button></div>
          </div>
        ) : (
          <article className="rounded-2xl border bg-card p-6" data-testid="content-card">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Frase</p>
            <p className="mt-1 font-display text-xl font-bold leading-snug" data-testid="content-frase">{c.body.frase}</p>
            <p className="mt-5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Texto</p>
            <div className="mt-1 whitespace-pre-line text-[15px] leading-relaxed" data-testid="content-texto">{c.body.texto}</div>
          </article>
        )}
      </section>

      {c.considered && (
        <section className="rounded-2xl border bg-card p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">O que a Hive considerou</p>
          <dl className="grid gap-2 text-sm sm:grid-cols-3">
            <div><dt className="text-xs text-muted-foreground">Base utilizada</dt><dd>{c.considered.base}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Coerência estratégica</dt><dd>{c.considered.coerencia}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Formato de validação</dt><dd>{c.considered.formato}</dd></div>
          </dl>
        </section>
      )}

      <AcjContractSummary contract={contracts[c.id] ?? null} onChange={(k) => setContracts((m) => ({ ...m, [k.content_id]: k }))} />

      {adjusting && (
        <div className="space-y-3 rounded-2xl border border-accent/40 bg-accent/5 p-4" data-testid="adjust-content">
          <p className="text-sm text-muted-foreground">Diga o que não funcionou ou o que quer preservar — a Hive executa.</p>
          <div className="flex flex-wrap gap-2">
            {ADJUST_EXAMPLES.map((ex) => <button key={ex} type="button" onClick={() => setInstruction(ex)} className="rounded-full border px-3 py-1 text-xs hover:border-accent hover:bg-accent/5">“{ex}”</button>)}
          </div>
          <div className="flex gap-2">
            <Input aria-label="Pedido de ajuste do conteúdo" value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="Ex.: menos teoria, mais cena concreta" />
            <Button variant="accent" onClick={() => revise(c, 'adjust')} disabled={!instruction.trim() || !!busy}>
              {busy === 'adjust' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Ajustar
            </Button>
          </div>
        </div>
      )}

      {!editing && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1">
            <Button variant="ghost" size="sm" onClick={() => setAdjusting((v) => !v)} disabled={!!busy}><Sparkles className="h-3.5 w-3.5" /> Ajustar com a Hive</Button>
            <Button variant="ghost" size="sm" onClick={() => setEditing({ frase: c.body.frase ?? '', texto: c.body.texto ?? '' })} disabled={!!busy}><Pencil className="h-3.5 w-3.5" /> Editar diretamente</Button>
            <Button variant="ghost" size="sm" onClick={() => revise(c, 'new_version')} disabled={!!busy}>
              {busy === 'new_version' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Nova versão
            </Button>
            <Button variant="ghost" size="sm" onClick={() => discard(c)} disabled={!!busy} className="text-muted-foreground"><Trash2 className="h-3.5 w-3.5" /> Descartar</Button>
          </div>
          <Button variant="accent" size="lg" onClick={() => approve(c)} disabled={!!busy}>
            {busy === 'approve' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Aprovar conteúdo
          </Button>
        </div>
      )}
    </div>
  );
}
