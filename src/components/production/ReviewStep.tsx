// Etapa 6 — TELAS 12, 12A, 12B, 12C: produção visual do ciclo, galeria, escolha
// da proposta, edição/aprovação da peça e conclusão (→ programação).
import { MarcosPhotoReview } from '@/components/hive/MarcosPhotoReview';
import { isAvulso } from '@/lib/campaign/avulso';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, ExternalLink, ImageIcon, Instagram, Linkedin, Loader2, Pencil, RefreshCw, Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { contentApi, ideaApi, pieceApi } from '@/lib/campaignApi';
import { formatRange } from '@/lib/campaign/dates';
import {
  AI_IMAGE_VARIANT, adjustPieceText, approvePiece, choosePiece, editPieceText, finishProduction, produceCycle, productionTodo, swapPieceImage,
} from '@/lib/campaign/produce';
import { loadHiveDesign } from '@/lib/hive/loadDesign';
import { useAuthStore } from '@/store/authStore';
import type { BeeEditorial, Campaign, CampaignCycle, Content, Idea, SocialAccount, UserPost } from '@/types';

// Uma produção por ciclo, com ASSINANTES: se a tela remontar no meio (StrictMode,
// troca de etapa, navegação), a nova montagem se inscreve na produção em curso —
// recebe o progresso e o aviso de fim — em vez de iniciar outra (duplicaria peças)
// ou ficar presa esperando uma execução que não fala mais com ela.
type Prog = { done: number; total: number } | null;
const RUNS = new Map<string, { progress: Prog; listeners: Set<(p: Prog) => void> }>();

type View = { kind: 'overview' } | { kind: 'gallery' } | { kind: 'choose'; group: string } | { kind: 'edit'; pieceId: string } | { kind: 'approved'; pieceId: string };

// Unidade revisável: a peça de validação OU um grupo de alternativas de um desdobramento.
interface Unit { key: string; content: Content; pieces: UserPost[]; main: UserPost; approved: boolean }

const PlatformIcon = ({ p, className = 'h-4 w-4' }: { p: string; className?: string }) =>
  p === 'linkedin' ? <Linkedin className={`${className} text-[#0A66C2]`} /> : <Instagram className={`${className} text-[#E1306C]`} />;

function Preview({ piece, className = '' }: { piece: UserPost; className?: string }) {
  const src = piece.rendered_slides?.slide1;
  return (
    <div className={`overflow-hidden rounded-xl border bg-secondary/40 ${className}`}>
      {src ? <img src={src} alt={(piece.carousel_text?.quote as string | undefined) ?? 'Prévia da peça'} className="h-full w-full object-cover" loading="lazy" />
        : <div className="flex h-full min-h-[160px] items-center justify-center text-muted-foreground"><ImageIcon className="h-6 w-6" /></div>}
    </div>
  );
}

export function ReviewStep({ campaign, cycle, ideas, editorials, accounts, onCycleChange }: {
  campaign: Campaign; cycle: CampaignCycle; ideas: Idea[]; editorials: BeeEditorial[]; accounts: SocialAccount[];
  onCycleChange: (c: CampaignCycle) => void;
}) {
  const navigate = useNavigate();
  const { currentUser } = useAuthStore();
  const [contents, setContents] = useState<Content[] | null>(null);
  const [pieces, setPieces] = useState<UserPost[]>([]);
  const [view, setView] = useState<View>({ kind: 'overview' });
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  // Só mostra o resumo depois de decidir se há algo a produzir (sem "piscar" um
  // resumo incompleto antes da produção começar).
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [variantNames, setVariantNames] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<{ quote: string; caption: string } | null>(null);
  const [adjustField, setAdjustField] = useState<'titulo' | 'legenda'>('titulo');
  const [instruction, setInstruction] = useState('');

  const edName = useCallback((slug?: string | null) => editorials.find((e) => e.slug === slug)?.name, [editorials]);
  const accountLabel = (id?: string | null) => accounts.find((a) => a.id === id)?.label ?? '';

  // Ideias vêm do BANCO junto com conteúdos e peças: a decisão do que produzir não
  // pode depender da lista da página ainda carregando (sem ideia → sem canais →
  // nenhum desdobramento produzido; era uma corrida intermitente).
  const load = useCallback(async () => {
    const [c, p, i] = await Promise.all([contentApi.listByCycle(cycle.id), pieceApi.listByCycle(cycle.id), ideaApi.listByCycle(cycle.id)]);
    setContents(c); setPieces(p);
    return { c, p, i };
  }, [cycle.id]);

  useEffect(() => {
    loadHiveDesign().then((d) => setVariantNames(Object.fromEntries(d.variacoes.map((v) => [v.id, v.nome])))).catch(() => {});
  }, []);

  // Carrega e, se faltar produzir algo, a Hive produz (retoma de onde parou).
  useEffect(() => {
    let alive = true;
    const listener = (pr: Prog) => { if (!alive) return; setProgress(pr); if (pr === null) void load(); };
    void (async () => {
      const running = RUNS.get(cycle.id);
      if (running) { running.listeners.add(listener); setProgress(running.progress); await load(); setChecked(true); return; }
      const { c, p, i } = await load();
      if (!alive || !currentUser) return;
      const again = RUNS.get(cycle.id);
      if (again) { again.listeners.add(listener); setProgress(again.progress); setChecked(true); return; }
      const todo = productionTodo(c, i, p);
      if (todo.validation.length === 0 && todo.unfold.length === 0) { setChecked(true); return; }
      const run = { progress: { done: 0, total: todo.validation.length + todo.unfold.length } as Prog, listeners: new Set([listener]) };
      RUNS.set(cycle.id, run);
      const emit = (pr: Prog) => { run.progress = pr; run.listeners.forEach((l) => l(pr)); };
      emit(run.progress);
      setChecked(true);
      try {
        await produceCycle(currentUser.id, cycle, { contents: c, ideas: i, pieces: p }, edName, (done, total) => emit({ done, total }));
      } catch (e) {
        toast.error((e as Error).message.slice(0, 200));
      } finally {
        RUNS.delete(cycle.id);
        emit(null);
      }
    })();
    return () => { alive = false; RUNS.get(cycle.id)?.listeners.delete(listener); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycle.id]);

  const units: Unit[] = useMemo(() => {
    const out: Unit[] = [];
    const validated = (contents ?? []).filter((c) => c.status === 'validated').sort((a, b) => a.position - b.position);
    for (const c of validated) {
      const mine = pieces.filter((p) => p.content_id === c.id);
      for (const v of mine.filter((p) => p.piece_role === 'validation' && p.status !== 'archived')) {
        out.push({ key: v.id, content: c, pieces: [v], main: v, approved: v.status === 'approved' || v.status === 'scheduled' || v.status === 'published' });
      }
      const groups = new Map<string, UserPost[]>();
      for (const p of mine.filter((x) => x.piece_role === 'unfold')) {
        const g = p.alternative_group ?? p.id;
        groups.set(g, [...(groups.get(g) ?? []), p]);
      }
      for (const [g, ps] of groups) {
        const live = ps.filter((p) => p.status !== 'archived').sort((a, b) => (a.alternative_rank ?? 0) - (b.alternative_rank ?? 0));
        if (!live.length) continue;
        const approved = live.find((p) => ['approved', 'scheduled', 'published'].includes(p.status));
        out.push({ key: g, content: c, pieces: live, main: approved ?? live.find((p) => p.is_recommended) ?? live[0], approved: !!approved });
      }
    }
    return out;
  }, [contents, pieces]);

  const approvedCount = units.filter((u) => u.approved).length;
  const pending = units.filter((u) => !u.approved);
  const fromValidation = units.filter((u) => u.main.piece_role === 'validation').length;
  const pieceById = (id: string) => pieces.find((p) => p.id === id);
  const replacePiece = (p: UserPost) => setPieces((ps) => ps.map((x) => (x.id === p.id ? p : x)));

  async function act<T>(key: string, fn: () => Promise<T>) {
    setBusy(key);
    try { return await fn(); } catch (e) { toast.error((e as Error).message.slice(0, 180)); return undefined; } finally { setBusy(null); }
  }

  function openUnit(u: Unit) {
    setDraft(null); setInstruction('');
    if (u.pieces.length > 1 && !u.approved) setView({ kind: 'choose', group: u.key });
    else setView({ kind: 'edit', pieceId: u.main.id });
  }

  function nextPending(exceptKey?: string) {
    const n = pending.find((u) => u.key !== exceptKey);
    if (n) openUnit(n); else setView({ kind: 'gallery' });
  }

  if (!contents || !checked) return <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-accent" /></div>;

  // ---------------- TELA 12 — produção (em andamento ou resumo) ----------------
  if (view.kind === 'overview') {
    return (
      <div className="space-y-5" data-testid="review-overview">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-600"><CheckCircle2 className="h-4 w-4" /> Conteúdos validados</p>
          <h1 className="mt-1 font-display text-2xl font-bold">{progress ? 'A Hive está produzindo os desdobramentos.' : 'Seus conteúdos estão prontos para ganhar novas formas.'}</h1>
          <p className="mt-1 text-sm text-muted-foreground">A Hive analisou cada conteúdo, os canais e contas da campanha, a identidade visual e o histórico de produção para desenvolver os desdobramentos recomendados.</p>
        </div>
        {progress ? (
          <div className="space-y-2 rounded-2xl border bg-card p-5" data-testid="produce-progress">
            <p className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin text-accent" /> Produzindo peças… {progress.done} de {progress.total}</p>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary"><div className="h-full bg-accent transition-all" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} /></div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3" data-testid="production-summary">
              <div className="rounded-2xl border bg-card p-4"><p className="font-display text-3xl font-bold">{units.length}</p><p className="text-xs text-muted-foreground">peças previstas</p></div>
              <div className="rounded-2xl border bg-card p-4"><p className="font-display text-3xl font-bold">{fromValidation}</p><p className="text-xs text-muted-foreground">já aprovadas (da validação)</p></div>
              <div className="rounded-2xl border bg-card p-4"><p className="font-display text-3xl font-bold">{pending.length}</p><p className="text-xs text-muted-foreground">novas peças para revisar</p></div>
            </div>
            <div className="flex justify-end"><Button variant="accent" size="lg" onClick={() => setView({ kind: 'gallery' })}>Revisar produção <ArrowRight className="h-4 w-4" /></Button></div>
          </>
        )}
      </div>
    );
  }

  // ---------------- TELA 12A — galeria ----------------
  if (view.kind === 'gallery') {
    const allDone = units.length > 0 && pending.length === 0;
    return (
      <div className="space-y-5" data-testid="gallery">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{isAvulso(campaign) ? 'Conteúdo avulso' : `Ciclo ${String(cycle.idx).padStart(2, '0')} · ${formatRange(cycle.start_date, cycle.end_date)}`}</p>
            <h1 className="font-display text-2xl font-bold" data-testid="gallery-counts">{units.length} peças · {approvedCount} aprovadas · {pending.length} para revisar</h1>
          </div>
        </div>
        {allDone && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5" data-testid="production-done">
            <div>
              <p className="flex items-center gap-2 font-display text-lg font-semibold"><CheckCircle2 className="h-5 w-5 text-emerald-600" /> Produção concluída</p>
              <p className="text-sm text-muted-foreground">{approvedCount} de {units.length} peças aprovadas. {isAvulso(campaign) ? 'Tudo pronto para programar.' : 'Todos os conteúdos previstos para este ciclo estão prontos.'}</p>
            </div>
            <Button variant="accent" onClick={() => act('finish', async () => {
              const c = cycle.status === 'ready' ? cycle : await finishProduction(cycle);
              onCycleChange(c);
              navigate(isAvulso(campaign) ? '/agenda' : `/agenda?campaign=${campaign.id}`);
            })} disabled={!!busy}>Seguir para programação <ArrowRight className="h-4 w-4" /></Button>
          </div>
        )}
        {(contents ?? []).filter((c) => c.status === 'validated').sort((a, b) => a.position - b.position).map((c, n) => {
          const us = units.filter((u) => u.content.id === c.id);
          return (
            <section key={c.id} className="space-y-3 rounded-2xl border bg-card p-4" data-testid="gallery-content">
              <p className="text-sm font-semibold"><span className="mr-2 text-muted-foreground">{String(n + 1).padStart(2, '0')}.</span>{c.title}</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {us.map((u) => (
                  <div key={u.key} className="space-y-2" data-testid="gallery-unit">
                    <button type="button" onClick={() => openUnit(u)} className="block w-full text-left"><Preview piece={u.main} className="aspect-[4/5]" /></button>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="flex items-center gap-1.5"><PlatformIcon p={u.main.platform} className="h-3.5 w-3.5" />{u.main.platform === 'linkedin' ? 'LinkedIn' : 'Instagram'} · {accountLabel(u.main.account_id)}</span>
                      {u.approved ? <span className="flex items-center gap-1 font-semibold text-emerald-600" data-testid="unit-status"><Check className="h-3.5 w-3.5" /> Aprovado</span>
                        : <span className="font-semibold text-accent" data-testid="unit-status">Para revisar{u.pieces.length > 1 ? ` · ${u.pieces.length} propostas` : ''}</span>}
                    </div>
                    {!u.approved && <Button size="sm" variant="outline" className="w-full" onClick={() => openUnit(u)}>Revisar propostas <ArrowRight className="h-3.5 w-3.5" /></Button>}
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    );
  }

  // ---------------- TELA 12B — escolha da proposta ----------------
  if (view.kind === 'choose') {
    const u = units.find((x) => x.key === view.group);
    if (!u) return <Button variant="outline" onClick={() => setView({ kind: 'gallery' })}><ArrowLeft className="h-4 w-4" /> Voltar para a galeria</Button>;
    const desc = (p: UserPost) => {
      const vd = p.visual_decision as { variant?: string; explanation?: { variant_reason?: string } } | null;
      const seed = p.metadata?.hive_seed as { variant_reason?: string } | undefined;
      return { variant: vd?.variant, name: vd?.variant ? `${vd.variant} · ${variantNames[vd.variant] ?? ''}` : '', why: seed?.variant_reason || vd?.explanation?.variant_reason || '' };
    };
    return (
      <div className="space-y-5" data-testid="choose-view">
        <button type="button" onClick={() => setView({ kind: 'gallery' })} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Voltar para a galeria</button>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Conteúdo de origem</p>
          <h1 className="font-display text-2xl font-bold">{u.content.title}</h1>
          <p className="text-sm text-muted-foreground">{u.main.platform === 'linkedin' ? 'LinkedIn' : 'Instagram'} · {accountLabel(u.main.account_id)} · Imagem</p>
        </div>
        <p className="text-sm font-semibold uppercase tracking-wider">Escolha a direção</p>
        <div className="grid gap-4 md:grid-cols-3">
          {u.pieces.map((p, i) => {
            const d = desc(p);
            const rec = p.is_recommended || (i === 0 && !u.pieces.some((x) => x.is_recommended));
            return (
              <div key={p.id} className={`flex flex-col gap-3 rounded-2xl border p-3 ${rec ? 'border-accent bg-accent/5 md:col-span-1' : 'bg-card'}`} data-testid="proposal">
                <span className={`self-start rounded-full px-2 py-0.5 text-[11px] font-semibold ${rec ? 'bg-accent text-accent-foreground' : 'bg-secondary'}`}>{rec ? 'Recomendação da Hive' : `Alternativa ${String(i + 1).padStart(2, '0')}`}</span>
                <Preview piece={p} className="aspect-[4/5]" />
                <div className="flex-1 space-y-1 text-sm">
                  <p className="font-semibold">Opção {String(i + 1).padStart(2, '0')}{d.name ? ` · ${d.name}` : ''}</p>
                  {d.why && <p className="text-xs text-muted-foreground">{d.why}</p>}
                </div>
                <Button variant={rec ? 'accent' : 'outline'} onClick={() => act(`choose-${p.id}`, async () => {
                  await choosePiece(p, u.pieces);
                  setPieces((ps) => ps.map((x) => (u.pieces.some((y) => y.id === x.id) && x.id !== p.id ? { ...x, status: 'archived' as const } : x)));
                  setView({ kind: 'edit', pieceId: p.id });
                })} disabled={!!busy} aria-label={`Escolher opção ${i + 1}`}>{rec ? 'Escolher esta' : 'Escolher'}</Button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ---------------- TELA 12C — edição e aprovação / após aprovação ----------------
  const piece = pieceById(view.pieceId);
  if (!piece) return <Button variant="outline" onClick={() => setView({ kind: 'gallery' })}><ArrowLeft className="h-4 w-4" /> Voltar para a galeria</Button>;
  const unit = units.find((u) => u.pieces.some((p) => p.id === piece.id));
  const variant = (piece.visual_decision as { variant?: string } | null)?.variant;
  const isApproved = ['approved', 'scheduled', 'published'].includes(piece.status);

  if (view.kind === 'approved') {
    const remaining = pending.filter((u) => u.key !== unit?.key);
    return (
      <div className="space-y-5" data-testid="piece-approved">
        <div className="flex items-center gap-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
          <CheckCircle2 className="h-10 w-10 shrink-0 text-emerald-600" />
          <div><p className="font-display text-xl font-semibold">Peça aprovada!</p>
            <p className="text-sm text-muted-foreground">{piece.platform === 'linkedin' ? 'LinkedIn' : 'Instagram'} · Imagem — {unit?.content.title}</p></div>
        </div>
        <div className="space-y-2 rounded-2xl border bg-card p-4">
          <p className="text-sm font-medium">{isAvulso(campaign) ? 'Progresso' : 'Progresso do ciclo'}</p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-secondary"><div className="h-full bg-emerald-500" style={{ width: `${(approvedCount / Math.max(1, units.length)) * 100}%` }} /></div>
          <p className="text-xs text-muted-foreground" data-testid="cycle-progress">{approvedCount} de {units.length} peças aprovadas</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {remaining.length > 0 && <Button variant="accent" onClick={() => nextPending(unit?.key)}>Próxima peça para revisar <ArrowRight className="h-4 w-4" /></Button>}
          <Button variant="outline" onClick={() => setView({ kind: 'gallery' })}>{isAvulso(campaign) ? 'Ver produção' : 'Ver produção do ciclo'}</Button>
        </div>
      </div>
    );
  }

  const quote = (piece.carousel_text?.quote as string | undefined) ?? '';
  const photoGenId = (piece.visual_decision as { asset?: { photo_generation_id?: string } } | null)?.asset?.photo_generation_id ?? null;
  return (
    <div className="space-y-5" data-testid="edit-view">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => setView({ kind: 'gallery' })} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Voltar</button>
        <div className="flex flex-wrap gap-2">
          {unit && unit.pieces.length > 1 && !isApproved && <Button variant="outline" onClick={() => setView({ kind: 'choose', group: unit.key })}>Ver outras opções</Button>}
          {!isApproved && (
            <Button variant="accent" onClick={() => act('approve', async () => {
              const a = await approvePiece(piece);
              replacePiece(a);
              setView({ kind: 'approved', pieceId: a.id });
            })} disabled={!!busy || !piece.rendered_slides?.slide1}>
              {busy === 'approve' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Aprovar peça
            </Button>
          )}
        </div>
      </div>
      {!isApproved && photoGenId && (
        <MarcosPhotoReview key={photoGenId} generationId={photoGenId} busy={!!busy} compact
          onApprove={() => act('approve', async () => { const a = await approvePiece(piece); replacePiece(a); setView({ kind: 'approved', pieceId: a.id }); })}
          onRegenerate={(note) => act('swap', async () => replacePiece(await swapPieceImage(currentUser!.id, piece, note)))} />
      )}
      <div>
        <h1 className="font-display text-2xl font-bold">{unit?.content.title}</h1>
        <p className="text-sm text-muted-foreground">{piece.platform === 'linkedin' ? 'LinkedIn' : 'Instagram'} · {accountLabel(piece.account_id)} · Imagem{variant ? ` · ${variant}${variantNames[variant] ? ` ${variantNames[variant]}` : ''}` : ''}{isApproved ? ' · Aprovada' : ''}</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
        <div className="space-y-2">
          <Preview piece={piece} className="aspect-[4/5]" />
          {busy && ['adjust', 'edit', 'swap'].includes(busy) && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> A Hive está refazendo a peça…</p>}
        </div>
        <div className="space-y-4">
          <section className="space-y-3 rounded-2xl border bg-card p-4" data-testid="piece-text">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Texto</p>
            {draft ? (
              <>
                <div className="space-y-1"><p className="text-xs text-muted-foreground">Frase da imagem</p>
                  <Textarea aria-label="Frase da imagem" rows={2} value={draft.quote} onChange={(e) => setDraft({ ...draft, quote: e.target.value })} /></div>
                <div className="space-y-1"><p className="text-xs text-muted-foreground">Legenda</p>
                  <Textarea aria-label="Legenda" rows={8} value={draft.caption} onChange={(e) => setDraft({ ...draft, caption: e.target.value })} /></div>
                <div className="flex gap-2">
                  <Button size="sm" variant="accent" disabled={!!busy} onClick={() => act('edit', async () => {
                    replacePiece(await editPieceText(currentUser!.id, piece, draft)); setDraft(null);
                  })}>Salvar texto</Button>
                  <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Cancelar</Button>
                </div>
              </>
            ) : (
              <>
                <p className="font-display text-base font-semibold" data-testid="piece-quote">{quote}</p>
                <p className="line-clamp-6 whitespace-pre-line text-sm text-muted-foreground" data-testid="piece-caption">{piece.caption}</p>
                {!isApproved && <Button size="sm" variant="ghost" onClick={() => setDraft({ quote, caption: piece.caption ?? '' })}><Pencil className="h-3.5 w-3.5" /> Editar texto</Button>}
              </>
            )}
          </section>
          {!isApproved && (
            <section className="space-y-3 rounded-2xl border border-accent/40 bg-accent/5 p-4" data-testid="piece-hive">
              <p className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-accent" /> Pedir ajuste à Hive</p>
              <div className="flex gap-1 text-xs">
                {(['titulo', 'legenda'] as const).map((f) => (
                  <button key={f} type="button" onClick={() => setAdjustField(f)} aria-pressed={adjustField === f}
                    className={`rounded-full border px-3 py-1 ${adjustField === f ? 'border-accent bg-accent/15' : ''}`}>{f === 'titulo' ? 'Frase da imagem' : 'Legenda'}</button>
                ))}
              </div>
              <div className="flex gap-2">
                <Input aria-label="Pedido de ajuste da peça" value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="Ex.: quero uma abertura mais provocativa" />
                <Button variant="accent" disabled={!instruction.trim() || !!busy} onClick={() => act('adjust', async () => {
                  replacePiece(await adjustPieceText(currentUser!.id, piece, adjustField, instruction)); setInstruction('');
                })}>{busy === 'adjust' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Ajustar'}</Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {AI_IMAGE_VARIANT(variant) && (
                  <Button size="sm" variant="outline" disabled={!!busy} onClick={() => act('swap', async () => replacePiece(await swapPieceImage(currentUser!.id, piece)))}>
                    <RefreshCw className="h-3.5 w-3.5" /> Trocar só a imagem
                  </Button>
                )}
                <Button size="sm" variant="ghost" asChild><Link to={`/posts/${piece.id}`} state={{ from: `/producao?campaign=${campaign.id}&cycle=${cycle.id}` }}><ExternalLink className="h-3.5 w-3.5" /> Abrir no editor completo</Link></Button>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
