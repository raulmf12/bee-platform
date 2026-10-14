// SEQUÊNCIA (carrossel) — Conteúdos sequenciais §7–§9, etapa A:
// 3 Roteiro (editar, inserir, remover, reordenar, pedir ajuste, legenda) → aprovar roteiro
// 4 Direção visual do conjunto (antes de renderizar) → 5 Produção e revisão página a página
// (progresso, falhas, retomada, ajustes por página/seleção/sequência/legenda com comparação)
// 6 Aprovação da versão completa → 7 Exportação (PDF LinkedIn / imagens Instagram) e agenda.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, CheckCircle2, Download, FileText, ImageIcon, Loader2, Palette, Pencil, Plus, RefreshCw, Sparkles, Trash2, Undo2, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { loadHiveDesign } from '@/lib/hive/loadDesign';
import { imageKind } from '@/lib/campaign/produce';
import { updateScheduledPackage } from '@/lib/pieces/ops';
import { edge } from '@/lib/edge';
import { db } from '@/lib/db';
import {
  ARCHITECTURE_LABELS, applyUnitCandidate, approveScript, approveSequence, approveUnit, capOf, capabilities, directionOf, discardUnitCandidate, exportSequence,
  markPublishedManually, proposeCoverImage, proposeDirection, proposeText, renderPending, reopenScript, unitApi, type UnitCandidate,
} from '@/lib/sequence/service';
import type { SequenceDirection } from '@/lib/hive/composeSequence';
import { PublishPanel } from './PublishPanel';
import type { FormatCapability, PostUnit, UserPost } from '@/types';

const VSTATUS: Record<PostUnit['visual_status'], { label: string; cls: string }> = {
  pending: { label: 'a produzir', cls: 'bg-secondary' }, rendering: { label: 'produzindo', cls: 'bg-sky-500/15 text-sky-700' },
  ready: { label: 'pronta', cls: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' }, failed: { label: 'falhou', cls: 'bg-rose-500/15 text-rose-700' },
  stale: { label: 'desatualizada', cls: 'bg-amber-500/15 text-amber-800 dark:text-amber-300' },
};
const needsRender = (u: PostUnit) => !u.rendered_url || u.visual_status !== 'ready' || u.rendered_text_version !== u.text_version;

export function SequenceWorkspace({ piece, onChange, onApproved }: { piece: UserPost; onChange: (p: UserPost) => void; onApproved: (p: UserPost) => void }) {
  const [units, setUnits] = useState<PostUnit[] | null>(null);
  const [caps, setCaps] = useState<FormatCapability[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [cand, setCand] = useState<(UnitCandidate & { coherence?: string }) | null>(null);
  const [notes, setNotes] = useState<Array<{ aspect: string; position: number | null; note: string }> | null>(null);
  const cap = capOf(caps, piece.platform, piece.format);

  const reloadUnits = useCallback(async () => setUnits(await unitApi.list(piece.id)), [piece.id]);
  const reloadPiece = useCallback(async () => { const p = await db.selectOne<UserPost>('user_posts', { id: `eq.${piece.id}` }); if (p) onChange(p); return p; }, [piece.id, onChange]);
  useEffect(() => { void reloadUnits(); capabilities().then(setCaps).catch(() => {}); }, [reloadUnits]);

  async function run<T>(key: string, fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(key);
    try { return await fn(); } catch (e) { toast.error((e as Error).message.replace(/^HTTP \d+[^:]*:\s*/, '').replace(/^.*"message":"([^"]+)".*$/, '$1').slice(0, 240)); return undefined; } finally { setBusy(null); }
  }

  if (!units) return <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-accent" /></div>;
  const md = (piece.metadata ?? {}) as { coherence_review?: boolean; source_outdated?: boolean; script_notes?: string; scheduled_outdated?: boolean; published_manually?: boolean };
  const stage = piece.status === 'published' ? 'published' : piece.script_status !== 'approved' ? 'script' : ['approved', 'scheduled'].includes(piece.status) ? 'export' : 'visual';

  return (
    <div className="space-y-4" data-testid="sequence" data-stage={stage}>
      <ol className="flex flex-wrap gap-1.5 text-xs">
        {[['script', '1. Roteiro'], ['visual', '2. Direção visual e páginas'], ['export', '3. Aprovação e exportação']].map(([k, l]) => (
          <li key={k} className={`rounded-full border px-2.5 py-1 ${stage === k ? 'border-accent bg-accent/15 font-semibold' : ''}`}>{l}</li>
        ))}
      </ol>
      {md.source_outdated && <p className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300" data-testid="source-outdated"><AlertTriangle className="h-3.5 w-3.5" /> O conteúdo-mãe mudou depois deste desdobramento. Nada foi sobrescrito — revise se a sequência ainda representa o pensamento.</p>}
      {piece.status === 'scheduled' && md.scheduled_outdated && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300" data-testid="schedule-outdated">
          <span>O agendamento guarda a versão v{piece.scheduled_version}; a versão atual é v{piece.version}.</span>
          <Button size="sm" variant="outline" onClick={() => run('sched', async () => onChange(await updateScheduledPackage(piece.id)))} data-testid="update-schedule">Atualizar agendamento</Button>
        </div>
      )}

      {stage === 'script' && (
        <ScriptStage piece={piece} units={units} cap={cap} busy={busy} run={run} setUnits={setUnits} reloadUnits={reloadUnits} reloadPiece={reloadPiece} onChange={onChange}
          cand={cand} setCand={setCand} notes={notes} setNotes={setNotes} />
      )}
      {stage === 'visual' && (
        <VisualStage piece={piece} units={units} busy={busy} run={run} progress={progress} setProgress={setProgress} reloadUnits={reloadUnits} reloadPiece={reloadPiece}
          onChange={onChange} onApproved={onApproved} cand={cand} setCand={setCand} coherence={!!md.coherence_review} notes={notes} setNotes={setNotes} />
      )}
      {(stage === 'export' || stage === 'published') && <ExportStage piece={piece} units={units} cap={cap} caps={caps} busy={busy} run={run} onChange={onChange} />}
    </div>
  );
}

type Run = <T>(key: string, fn: () => Promise<T>) => Promise<T | undefined>;

// ============================ 3. ROTEIRO ============================
function ScriptStage({ piece, units, cap, busy, run, setUnits, reloadUnits, reloadPiece, onChange, cand, setCand, notes, setNotes }: {
  piece: UserPost; units: PostUnit[]; cap?: FormatCapability; busy: string | null; run: Run; setUnits: (u: PostUnit[]) => void; reloadUnits: () => Promise<void>; reloadPiece: () => Promise<UserPost | null>;
  onChange: (p: UserPost) => void; cand: UnitCandidate | null; setCand: (c: (UnitCandidate & { coherence?: string }) | null) => void;
  notes: Array<{ aspect: string; position: number | null; note: string }> | null; setNotes: (n: Array<{ aspect: string; position: number | null; note: string }> | null) => void;
}) {
  const [caption, setCaption] = useState(piece.caption ?? '');
  useEffect(() => setCaption(piece.caption ?? ''), [piece.caption]);
  const [sel, setSel] = useState<string[]>([]);
  const min = cap?.min_units ?? 2, max = cap?.max_units ?? 10;
  const empty = units.some((u) => !(u.title ?? '').trim() && !(u.body ?? '').trim());
  const story = piece.format === 'story';                 // Stories não têm legenda
  const save = (u: PostUnit, patch: Partial<PostUnit>) => run(`u-${u.id}`, async () => { const n = await unitApi.update(u.id, patch); setUnits(units.map((x) => (x.id === n.id ? n : x))); });
  const move = (i: number, d: -1 | 1) => run('reorder', async () => {
    const ids = units.map((u) => u.id); [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    onChange(await unitApi.reorder(piece.id, ids)); await reloadUnits();
  });

  if (!units.length) {
    return (
      <div className="rounded-2xl border border-dashed p-6 text-center" data-testid="script-empty">
        <p className="text-sm text-muted-foreground">O roteiro ainda não foi gerado (ou a geração falhou).</p>
        <Button className="mt-3" variant="accent" disabled={!!busy} onClick={() => run('script', async () => { await edge.sequenceScript({ action: 'script', post_id: piece.id }); await reloadUnits(); await reloadPiece(); })} data-testid="script-generate">
          {busy === 'script' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Gerar roteiro
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {piece.narrative_architecture ? <><b>{ARCHITECTURE_LABELS[piece.narrative_architecture] ?? piece.narrative_architecture}</b> · </> : ''}{units.length} páginas (de {min} a {max})
          {(piece.metadata as { script_notes?: string })?.script_notes ? ` · ${(piece.metadata as { script_notes?: string }).script_notes}` : ''}
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => run('coh', async () => setNotes((await edge.sequenceScript<{ notes: Array<{ aspect: string; position: number | null; note: string }> }>({ action: 'coherence', post_id: piece.id })).notes))} data-testid="coherence-check">
            {busy === 'coh' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Revisar coerência</Button>
          <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => { if (confirm('Refazer o roteiro inteiro? As edições atuais serão substituídas.')) void run('script', async () => { await edge.sequenceScript({ action: 'script', post_id: piece.id, replace: true }); await reloadUnits(); await reloadPiece(); }); }} data-testid="script-redo">
            <RefreshCw className="h-3.5 w-3.5" /> Refazer roteiro</Button>
        </div>
      </div>
      {notes && <CoherenceNotes notes={notes} onClose={() => setNotes(null)} />}

      <div className="space-y-2" data-testid="script-units">
        {units.map((u, i) => (
          <div key={`${u.id}-${u.text_version}`} className="grid gap-2 rounded-xl border bg-card p-3 sm:grid-cols-[auto_1fr_auto]" data-testid="script-unit" data-unit={u.id}>
            <div className="flex flex-col items-center gap-1 text-xs">
              <input type="checkbox" aria-label={`Selecionar página ${u.position}`} checked={sel.includes(u.id)} onChange={(e) => setSel(e.target.checked ? [...sel, u.id] : sel.filter((x) => x !== u.id))} />
              <span className="font-display text-lg font-bold text-accent">{String(u.position).padStart(2, '0')}</span>
            </div>
            <div className="space-y-1.5">
              <Input aria-label={`Função da página ${u.position}`} className="h-7 text-xs" defaultValue={u.function ?? ''} onBlur={(e) => e.target.value !== (u.function ?? '') && save(u, { function: e.target.value })} placeholder="Função narrativa" />
              <Input aria-label={`Título da página ${u.position}`} defaultValue={u.title ?? ''} onBlur={(e) => e.target.value !== (u.title ?? '') && save(u, { title: e.target.value })} />
              <Textarea aria-label={`Texto da página ${u.position}`} rows={u.layout === 'cover' ? 1 : 3} defaultValue={u.body ?? ''} onBlur={(e) => e.target.value !== (u.body ?? '') && save(u, { body: e.target.value })} />
              {u.visual_direction && <p className="text-[11px] italic text-muted-foreground">Direção visual: {u.visual_direction}</p>}
              {(u as PostUnit & { interaction?: { type?: string; text?: string } | null }).interaction?.text && (
                <p className="text-[11px] text-amber-800 dark:text-amber-300" data-testid="unit-interaction">Interação planejada ({(u as PostUnit & { interaction: { type?: string } }).interaction.type}): “{(u as PostUnit & { interaction: { text: string } }).interaction.text}” — colocar à mão no app (a API não publica figurinhas).</p>
              )}
            </div>
            <div className="flex flex-row gap-1 sm:flex-col">
              <button type="button" aria-label={`Subir página ${u.position}`} disabled={i === 0 || !!busy} onClick={() => move(i, -1)} className="rounded p-1 hover:bg-secondary disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
              <button type="button" aria-label={`Descer página ${u.position}`} disabled={i === units.length - 1 || !!busy} onClick={() => move(i, 1)} className="rounded p-1 hover:bg-secondary disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
              <button type="button" aria-label={`Inserir página depois da ${u.position}`} disabled={units.length >= max || !!busy} onClick={() => run('ins', async () => setUnits(await unitApi.insertAfter(piece, units, u.position)))} className="rounded p-1 hover:bg-secondary disabled:opacity-30" data-testid="unit-insert"><Plus className="h-3.5 w-3.5" /></button>
              <button type="button" aria-label={`Remover página ${u.position}`} disabled={units.length <= min || !!busy} onClick={() => run('rm', async () => setUnits(await unitApi.remove(piece, units, u)))} className="rounded p-1 text-muted-foreground hover:text-rose-600 disabled:opacity-30" data-testid="unit-remove"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        ))}
      </div>

      <TextAdjust piece={piece} units={units} selected={sel} busy={busy} run={run} cand={cand} setCand={setCand} allowManual={false} />
      {cand && <CandidateCompare cand={cand} units={units} piece={piece} busy={busy} run={run} onDone={async (applied) => { setCand(null); if (applied) { await reloadUnits(); await reloadPiece(); setSel([]); } }} />}

      {!story && <div className="space-y-1.5 rounded-xl border bg-card p-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Legenda da peça</p>
        <Textarea aria-label="Legenda da sequência" rows={5} value={caption} onChange={(e) => setCaption(e.target.value)} onBlur={() => caption !== (piece.caption ?? '') && run('cap', async () => { const [p] = await db.update<UserPost>('user_posts', { id: `eq.${piece.id}` }, { caption }); if (p) onChange(p); })} />
      </div>}

      <div className="flex flex-wrap items-center justify-end gap-3">
        {(empty || units.length < min || units.length > max || (!story && !caption.trim())) && <p className="text-xs text-muted-foreground">{empty ? 'Há página sem texto.' : !story && !caption.trim() ? 'Falta a legenda.' : `A sequência precisa ter de ${min} a ${max} páginas.`}</p>}
        <Button variant="accent" disabled={!!busy || empty || units.length < min || units.length > max || (!story && !caption.trim())} onClick={() => run('approve-script', async () => onChange(await approveScript(piece)))} data-testid="script-approve">
          <Check className="h-4 w-4" /> Aprovar roteiro
        </Button>
      </div>
    </div>
  );
}

// ============================ 4–6. DIREÇÃO, PÁGINAS, APROVAÇÃO ============================
function VisualStage({ piece, units, busy, run, progress, setProgress, reloadUnits, reloadPiece, onChange, onApproved, cand, setCand, coherence, notes, setNotes }: {
  piece: UserPost; units: PostUnit[]; busy: string | null; run: Run; progress: { done: number; total: number } | null; setProgress: (p: { done: number; total: number } | null) => void;
  reloadUnits: () => Promise<void>; reloadPiece: () => Promise<UserPost | null>; onChange: (p: UserPost) => void; onApproved: (p: UserPost) => void;
  cand: (UnitCandidate & { coherence?: string }) | null; setCand: (c: (UnitCandidate & { coherence?: string }) | null) => void; coherence: boolean;
  notes: Array<{ aspect: string; position: number | null; note: string }> | null; setNotes: (n: Array<{ aspect: string; position: number | null; note: string }> | null) => void;
}) {
  const dir = directionOf(piece);
  const anyRendered = units.some((u) => u.rendered_url);
  const pending = units.filter(needsRender);
  const [current, setCurrent] = useState(0);
  const [sel, setSel] = useState<string[]>([]);
  const [templates, setTemplates] = useState<Array<{ id: string; nome: string }>>([]);
  const [draftDir, setDraftDir] = useState<SequenceDirection>(dir);
  useEffect(() => { loadHiveDesign().then((d) => setTemplates((d.variacoes as Array<{ id: string; nome: string; manifestacao_id: string }>).filter((v) => ['M01', 'M02'].includes(v.manifestacao_id)))).catch(() => {}); }, []);
  const u = units[Math.min(current, units.length - 1)];
  const story = piece.format === 'story';
  const allOk = units.length > 0 && units.every((x) => !needsRender(x) && x.review_status === 'approved') && (story || !!(piece.caption ?? '').trim());
  const ratio = story ? 'aspect-[9/16]' : 'aspect-[4/5]';

  async function produce() {
    await run('render', async () => {
      const r = await renderPending(piece, units, (done, total) => setProgress({ done, total }));
      setProgress(null);
      await reloadUnits();
      if (r.failed) toast.error(`${r.failed} página(s) falharam. As demais ficaram prontas; produza de novo só as pendentes.`);
    });
    setProgress(null);
  }

  // ---------- 4. Direção visual (antes de renderizar) ----------
  if (!anyRendered) {
    return (
      <div className="space-y-4" data-testid="direction">
        <p className="text-sm text-muted-foreground">Direção visual do conjunto: as páginas compartilham tipografia, cores, assinatura e ritmo; a composição varia pela função de cada página.</p>
        <DirectionForm value={draftDir} onChange={setDraftDir} templates={story ? [] : templates} />
        <div className="grid gap-2 sm:grid-cols-3">
          {units.map((x) => <div key={x.id} className="rounded-lg border bg-card p-2 text-xs"><b>{String(x.position).padStart(2, '0')}</b> · {x.layout === 'cover' ? 'capa (template da imagem única)' : x.layout === 'closing' ? 'encerramento (espiral + assinatura)' : 'página de texto'}<p className="truncate text-muted-foreground">{x.title}</p></div>)}
        </div>
        <div className="flex flex-wrap justify-between gap-2">
          <Button variant="ghost" disabled={!!busy} onClick={() => run('reopen', async () => onChange(await reopenScript(piece)))} data-testid="script-reopen"><ArrowLeft className="h-4 w-4" /> Voltar ao roteiro</Button>
          <Button variant="accent" disabled={!!busy} onClick={async () => {
            const [p] = await db.update<UserPost>('user_posts', { id: `eq.${piece.id}` }, { visual_direction: draftDir as unknown as Record<string, unknown> });
            if (p) { onChange(p); await run('render', async () => { const r = await renderPending(p, units, (done, total) => setProgress({ done, total })); setProgress(null); await reloadUnits(); if (r.failed) toast.error(`${r.failed} página(s) falharam.`); }); setProgress(null); }
          }} data-testid="render-start">
            {busy === 'render' ? <><Loader2 className="h-4 w-4 animate-spin" /> Produzindo {progress ? `${progress.done}/${progress.total}` : ''}</> : <><Palette className="h-4 w-4" /> Aprovar direção e produzir páginas</>}
          </Button>
        </div>
      </div>
    );
  }

  // ---------- 5. Produção e revisão ----------
  return (
    <div className="space-y-4" data-testid="pages">
      {busy === 'render' && progress && (
        <div className="space-y-1 rounded-xl border bg-card p-3" data-testid="render-progress">
          <p className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin text-accent" /> Produzindo páginas… {progress.done} de {progress.total}</p>
          <div className="h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full bg-accent" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} /></div>
        </div>
      )}
      {pending.length > 0 && busy !== 'render' && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300" data-testid="pending-pages">
          <span>{pending.length} página(s) a produzir ({pending.map((x) => x.position).join(', ')}). As prontas não serão refeitas.</span>
          <Button size="sm" variant="outline" onClick={produce} data-testid="render-pending">Produzir pendentes</Button>
        </div>
      )}
      {coherence && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-sky-500/10 px-3 py-2 text-xs" data-testid="coherence-flag">
          <span>O roteiro mudou: revise a coerência do conjunto (abertura, continuidade, encerramento).</span>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run('coh', async () => setNotes((await edge.sequenceScript<{ notes: Array<{ aspect: string; position: number | null; note: string }> }>({ action: 'coherence', post_id: piece.id })).notes))}>Revisar coerência</Button>
        </div>
      )}
      {notes && <CoherenceNotes notes={notes} onClose={() => setNotes(null)} />}

      {/* visão de conjunto */}
      <div className="flex gap-2 overflow-x-auto pb-1" data-testid="pages-strip">
        {units.map((x, i) => (
          <div key={x.id} className={`w-24 shrink-0 space-y-1 ${i === current ? 'opacity-100' : 'opacity-80'}`} data-testid="page-thumb" data-unit={x.id} data-status={x.visual_status} data-review={x.review_status}>
            <button type="button" onClick={() => setCurrent(i)} className={`block ${ratio} w-full overflow-hidden rounded-md border-2 ${i === current ? 'border-accent' : 'border-transparent'}`}>
              {x.rendered_url ? <img src={x.rendered_url} alt={`Página ${x.position}`} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center bg-secondary text-[10px]">{x.position}</div>}
            </button>
            <div className="flex items-center justify-between text-[10px]">
              <label className="flex items-center gap-1"><input type="checkbox" aria-label={`Selecionar página ${x.position}`} checked={sel.includes(x.id)} onChange={(e) => setSel(e.target.checked ? [...sel, x.id] : sel.filter((y) => y !== x.id))} />{x.position}</label>
              {x.review_status === 'approved' && !needsRender(x) ? <Check className="h-3 w-3 text-emerald-600" /> : <span className={`rounded px-1 ${VSTATUS[needsRender(x) && x.visual_status === 'ready' ? 'stale' : x.visual_status].cls}`}>{VSTATUS[needsRender(x) && x.visual_status === 'ready' ? 'stale' : x.visual_status].label}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* página a página */}
      {u && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_1fr]" data-testid="page-view" data-unit={u.id}>
          <div className="space-y-2">
            {u.rendered_url ? <img src={u.rendered_url} alt={`Página ${u.position}`} className={`${ratio} w-full rounded-xl border object-cover`} data-testid="page-image" />
              : <div className={`flex ${ratio} items-center justify-center rounded-xl border bg-secondary text-sm text-muted-foreground`}><ImageIcon className="h-6 w-6" /></div>}
            <div className="flex items-center justify-between">
              <Button size="sm" variant="ghost" disabled={current === 0} onClick={() => setCurrent(current - 1)} aria-label="Página anterior"><ArrowLeft className="h-4 w-4" /></Button>
              <span className="text-xs text-muted-foreground">Página {u.position} de {units.length}</span>
              <Button size="sm" variant="ghost" disabled={current >= units.length - 1} onClick={() => setCurrent(current + 1)} aria-label="Próxima página"><ArrowRight className="h-4 w-4" /></Button>
            </div>
          </div>
          <div className="space-y-3">
            <div className="space-y-1 rounded-xl border bg-card p-3 text-sm">
              <p className="text-xs text-muted-foreground">{u.function} · {u.layout === 'cover' ? `capa${u.assets?.variant ? ` · ${u.assets.variant}` : ''}` : u.layout === 'closing' ? 'encerramento' : 'texto'}</p>
              <p className="font-semibold" data-testid="page-title">{u.title}</p>
              {u.body && <p className="whitespace-pre-line text-muted-foreground" data-testid="page-body">{u.body}</p>}
              {u.error && <p className="text-xs text-rose-600" data-testid="page-error">{u.error}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant={u.review_status === 'approved' ? 'outline' : 'accent'} disabled={!!busy || needsRender(u)} onClick={() => run('ap', async () => { await approveUnit(u, u.review_status !== 'approved'); await reloadUnits(); if (current < units.length - 1 && u.review_status !== 'approved') setCurrent(current + 1); })} data-testid="page-approve">
                {u.review_status === 'approved' ? <><Undo2 className="h-3.5 w-3.5" /> Desfazer aprovação</> : <><Check className="h-3.5 w-3.5" /> Aprovar página</>}
              </Button>
              <Button size="sm" variant="ghost" disabled={!!busy || units.filter((x) => !needsRender(x)).every((x) => x.review_status === 'approved')} onClick={() => run('ap-all', async () => { for (const x of units.filter((y) => !needsRender(y) && y.review_status !== 'approved')) await approveUnit(x); await reloadUnits(); })} data-testid="pages-approve-all">Aprovar todas as prontas</Button>
              {u.layout === 'cover' && imageKind(u.assets?.variant) !== 'none' && (
                <Button size="sm" variant="outline" disabled={!!busy || !!cand} onClick={() => run('cover', async () => setCand(await proposeCoverImage(piece, units)))} data-testid="cover-swap-image">
                  {busy === 'cover' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />} Trocar imagem da capa</Button>
              )}
            </div>
          </div>
        </div>
      )}

      <TextAdjust piece={piece} units={units} selected={sel.length ? sel : u ? [u.id] : []} busy={busy} run={run} cand={cand} setCand={setCand} allowManual />
      <DirectionChange piece={piece} units={units} templates={templates} busy={busy} run={run} cand={cand} setCand={setCand} progress={progress} setProgress={setProgress} />
      {cand && <CandidateCompare cand={cand} units={units} piece={piece} busy={busy} run={run} onDone={async (applied) => { setCand(null); if (applied) { await reloadUnits(); await reloadPiece(); } }} />}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => run('reorder', async () => { if (current === 0) return; const ids = units.map((x) => x.id); [ids[current - 1], ids[current]] = [ids[current], ids[current - 1]]; onChange(await unitApi.reorder(piece.id, ids)); await reloadUnits(); setCurrent(current - 1); })} data-testid="page-move-left"><ArrowLeft className="h-3.5 w-3.5" /> Mover página para antes</Button>
          <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => { if (confirm('Reabrir o roteiro para inserir ou remover páginas? A aprovação final é desfeita; páginas que não mudarem mantêm o visual.')) void run('reopen', async () => onChange(await reopenScript(piece))); }} data-testid="script-reopen"><Pencil className="h-3.5 w-3.5" /> Reabrir roteiro</Button>
        </div>
        <div className="flex items-center gap-2">
          {!allOk && <p className="text-xs text-muted-foreground">Aprovação final: todas as páginas prontas e aprovadas, e a legenda.</p>}
          <Button variant="accent" disabled={!!busy || !allOk} onClick={() => run('approve', async () => onApproved(await approveSequence(piece)))} data-testid="sequence-approve">
            <CheckCircle2 className="h-4 w-4" /> Aprovar sequência (v{piece.version})
          </Button>
        </div>
      </div>
    </div>
  );
}

function DirectionForm({ value, onChange, templates }: { value: SequenceDirection; onChange: (d: SequenceDirection) => void; templates: Array<{ id: string; nome: string }> }) {
  return (
    <div className="grid gap-2 rounded-xl border bg-card p-3 text-xs sm:grid-cols-2" data-testid="direction-form">
      <label className="space-y-1"><span className="text-muted-foreground">Fundo das páginas</span>
        <select aria-label="Fundo das páginas" className="h-8 w-full rounded-md border bg-background px-2" value={value.theme} onChange={(e) => onChange({ ...value, theme: e.target.value as 'claro' | 'escuro' })}>
          <option value="claro">Claro (creme)</option><option value="escuro">Escuro (azul)</option></select></label>
      {templates.length > 0 && <label className="space-y-1"><span className="text-muted-foreground">Template da capa</span>
        <select aria-label="Template da capa" className="h-8 w-full rounded-md border bg-background px-2" value={value.cover_variant ?? ''} onChange={(e) => onChange({ ...value, cover_variant: e.target.value || null })}>
          <option value="">A Hive escolhe</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.id} {t.nome}</option>)}</select></label>}
      <label className="flex items-center gap-2"><input type="checkbox" aria-label="Numerar páginas" checked={value.numbering} onChange={(e) => onChange({ ...value, numbering: e.target.checked })} /> Numerar páginas</label>
      <Input aria-label="Assinatura" className="h-8 text-xs" value={value.signature ?? ''} onChange={(e) => onChange({ ...value, signature: e.target.value || null })} placeholder="Assinatura (opcional)" />
    </div>
  );
}

// Ajustar texto: página atual / selecionadas / sequência inteira / legenda — sempre como proposta.
// (o recarregamento depois de aplicar fica na comparação — CandidateCompare)
function TextAdjust({ piece, units, selected, busy, run, cand, setCand, allowManual }: {
  piece: UserPost; units: PostUnit[]; selected: string[]; busy: string | null; run: Run; cand: UnitCandidate | null; setCand: (c: (UnitCandidate & { coherence?: string }) | null) => void;
  allowManual: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<'units' | 'sequence' | 'caption'>('units');
  const [instruction, setInstruction] = useState('');
  const [manual, setManual] = useState<{ title: string; body: string } | null>(null);
  const one = units.find((x) => x.id === selected[0]);
  if (!open) return <Button size="sm" variant="outline" disabled={!!busy || !!cand} onClick={() => setOpen(true)} data-testid="adjust-open"><Sparkles className="h-3.5 w-3.5" /> Ajustar texto</Button>;
  return (
    <div className="space-y-2 rounded-xl border border-accent/40 bg-accent/5 p-3" data-testid="adjust-form">
      <div className="flex flex-wrap gap-1 text-xs">
        {([['units', `Páginas selecionadas (${selected.length})`], ['sequence', 'Sequência inteira'], ['caption', 'Legenda']] as const).map(([k, l]) => (
          <button key={k} type="button" aria-pressed={scope === k} onClick={() => setScope(k)} className={`rounded-full border px-3 py-1 ${scope === k ? 'border-accent bg-accent/15' : ''}`}>{l}</button>
        ))}
      </div>
      {allowManual && scope === 'units' && selected.length === 1 && one && !manual && <button type="button" className="text-xs text-accent" onClick={() => setManual({ title: one.title ?? '', body: one.body ?? '' })} data-testid="adjust-manual">Editar eu mesmo a página {one.position}</button>}
      {manual ? (
        <div className="space-y-1.5">
          <Input aria-label="Novo título da página" value={manual.title} onChange={(e) => setManual({ ...manual, title: e.target.value })} />
          <Textarea aria-label="Novo texto da página" rows={3} value={manual.body} onChange={(e) => setManual({ ...manual, body: e.target.value })} />
        </div>
      ) : <Input aria-label="Pedido de ajuste da sequência" value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="Ex.: deixe mais concreto, com uma cena do dia a dia" />}
      <p className="text-[11px] text-muted-foreground">As outras páginas e as imagens ficam preservadas; o visual das páginas alteradas é refeito no mesmo template depois de aplicar.</p>
      <div className="flex gap-2">
        <Button size="sm" variant="accent" disabled={!!busy || (scope === 'units' && !selected.length) || (!manual && !instruction.trim())}
          onClick={() => run('adjust', async () => { setCand(await proposeText(piece, units, { scope, unitIds: selected, instruction: manual ? undefined : instruction, manual: manual ?? undefined })); setOpen(false); setInstruction(''); setManual(null); })} data-testid="adjust-generate">
          {busy === 'adjust' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Gerar proposta'}</Button>
        <Button size="sm" variant="ghost" onClick={() => { setOpen(false); setManual(null); }}>Cancelar</Button>
      </div>
    </div>
  );
}

function DirectionChange({ piece, units, templates, busy, run, cand, setCand, progress, setProgress }: {
  piece: UserPost; units: PostUnit[]; templates: Array<{ id: string; nome: string }>; busy: string | null; run: Run; cand: UnitCandidate | null; setCand: (c: UnitCandidate | null) => void;
  progress: { done: number; total: number } | null; setProgress: (p: { done: number; total: number } | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [d, setD] = useState<SequenceDirection>(directionOf(piece));
  if (!open) return <Button size="sm" variant="outline" className="ml-2" disabled={!!busy || !!cand} onClick={() => { setD(directionOf(piece)); setOpen(true); }} data-testid="direction-open"><Palette className="h-3.5 w-3.5" /> Trocar template / direção visual</Button>;
  return (
    <div className="space-y-2 rounded-xl border p-3" data-testid="direction-change">
      <DirectionForm value={d} onChange={setD} templates={templates} />
      <p className="text-[11px] text-muted-foreground">O roteiro e os recursos atuais são preservados; todas as páginas são refeitas como proposta para comparar antes de aplicar.</p>
      <div className="flex gap-2">
        <Button size="sm" variant="accent" disabled={!!busy} onClick={() => run('dir', async () => { setCand(await proposeDirection(piece, units, d, (done, total) => setProgress({ done, total }))); setProgress(null); setOpen(false); })} data-testid="direction-generate">
          {busy === 'dir' ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> {progress ? `${progress.done}/${progress.total}` : ''}</> : 'Gerar proposta'}</Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
      </div>
    </div>
  );
}

// Comparação atual × proposta (texto por página, imagens lado a lado) → Aplicar / Descartar.
function CandidateCompare({ cand, units, piece, busy, run, onDone }: { cand: UnitCandidate & { coherence?: string }; units: PostUnit[]; piece: UserPost; busy: string | null; run: Run; onDone: (applied: boolean) => Promise<void> }) {
  const [err, setErr] = useState<string | null>(null);
  const items = cand.proposal?.units ?? [];
  const byId = useMemo(() => Object.fromEntries(units.map((u) => [u.id, u])), [units]);
  return (
    <div className="space-y-3 rounded-xl border bg-card p-3" data-testid="unit-candidate">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Proposta sobre a v{cand.base_version} · {cand.scope === 'caption' ? 'legenda' : cand.scope === 'sequence' ? 'sequência inteira' : `${cand.unit_ids.length} página(s)`}</p>
      {cand.impact && <p className="text-xs text-amber-700 dark:text-amber-400">{cand.impact}</p>}
      {cand.coherence && <p className="text-xs text-muted-foreground">Coerência: {cand.coherence}</p>}
      {items.map((it) => {
        const cur = byId[it.id];
        if (!cur) return null;
        const img = (it as { rendered_url?: string }).rendered_url;
        return (
          <div key={it.id} className="grid gap-2 rounded-lg border p-2 text-sm sm:grid-cols-2" data-testid="candidate-unit" data-unit={it.id}>
            {img ? (<>
              <figure><figcaption className="mb-1 text-xs text-muted-foreground">Atual · p{cur.position}</figcaption>{cur.rendered_url && <img src={cur.rendered_url} alt="Atual" className="aspect-[4/5] w-full rounded border object-cover" />}</figure>
              <figure><figcaption className="mb-1 text-xs text-muted-foreground">Proposta</figcaption><img src={img} alt="Proposta" className="aspect-[4/5] w-full rounded border object-cover" /></figure>
            </>) : (<>
              <div><p className="text-xs text-muted-foreground">Atual · p{cur.position}</p><p className="font-semibold line-through decoration-muted-foreground/40">{cur.title}</p><p className="text-muted-foreground line-through decoration-muted-foreground/40">{cur.body}</p></div>
              <div><p className="text-xs text-muted-foreground">Proposta</p><p className="font-semibold" data-testid="candidate-unit-title">{it.title ?? cur.title}</p><p data-testid="candidate-unit-body">{it.body ?? cur.body}</p></div>
            </>)}
          </div>
        );
      })}
      {cand.proposal?.caption !== undefined && (
        <div className="grid gap-2 text-sm sm:grid-cols-2" data-testid="candidate-caption">
          <p className="whitespace-pre-line text-muted-foreground line-through decoration-muted-foreground/40">{piece.caption}</p><p className="whitespace-pre-line">{cand.proposal.caption}</p>
        </div>
      )}
      <p className="text-[11px] text-emerald-700 dark:text-emerald-400">Mantido: {cand.scope === 'caption' ? 'todas as páginas' : `${units.length - cand.unit_ids.length} página(s) não selecionada(s), ordem${cand.mutable_paths.includes('image') ? '' : ', imagens'}${cand.mutable_paths.includes('text') ? '' : ', textos'}`}.</p>
      {err && <p className="text-xs text-rose-600" data-testid="candidate-error">{err}</p>}
      <div className="flex gap-2">
        <Button size="sm" variant="accent" disabled={!!busy || !!err} onClick={() => run('apply', async () => {
          try { await applyUnitCandidate(cand); await onDone(true); toast.success('Aplicado. A aprovação final vale para a nova versão.'); }
          catch (e) { setErr(/conflito/i.test((e as Error).message) ? 'A peça mudou depois desta proposta. Descarte e peça de novo.' : (e as Error).message.replace(/^.*?(Proposta rejeitada[^"]*).*$/, '$1').slice(0, 200)); }
        })} data-testid="candidate-apply"><Check className="h-3.5 w-3.5" /> Aplicar</Button>
        <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run('discard', async () => { await discardUnitCandidate(cand); await onDone(false); })} data-testid="candidate-discard"><X className="h-3.5 w-3.5" /> Descartar</Button>
      </div>
    </div>
  );
}

function CoherenceNotes({ notes, onClose }: { notes: Array<{ aspect: string; position: number | null; note: string }>; onClose: () => void }) {
  return (
    <div className="space-y-1 rounded-xl border bg-sky-500/5 p-3 text-xs" data-testid="coherence-notes">
      <div className="flex justify-between"><p className="font-semibold">Revisão de coerência</p><button type="button" onClick={onClose} aria-label="Fechar"><X className="h-3.5 w-3.5" /></button></div>
      {notes.length ? <ul className="list-disc space-y-0.5 pl-4">{notes.map((n, i) => <li key={i}><b>{n.aspect}</b>{n.position ? ` (p${n.position})` : ''}: {n.note}</li>)}</ul> : <p>Sem problemas de coerência apontados.</p>}
    </div>
  );
}

// ============================ 7. EXPORTAÇÃO E AGENDA ============================
function ExportStage({ piece, units, cap, caps, busy, run, onChange }: { piece: UserPost; units: PostUnit[]; cap?: FormatCapability; caps: FormatCapability[]; busy: string | null; run: Run; onChange: (p: UserPost) => void }) {
  const pkg = piece.export_package as { version?: number; kind?: string; pdf_url?: string; zip_url?: string; exported_at?: string } | null;
  const current = pkg && pkg.version === piece.version;
  const [url, setUrl] = useState('');
  return (
    <div className="space-y-4" data-testid="export">
      <div className="flex flex-wrap gap-2" data-testid="export-pages">
        {units.map((u) => u.rendered_url && <img key={u.id} src={u.rendered_url} alt={`Página ${u.position}`} className="h-28 w-[90px] rounded border object-cover" />)}
      </div>
      <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" /> Sequência aprovada (v{piece.approved_version ?? piece.version}) · {units.length} páginas{piece.status === 'scheduled' && piece.scheduled_date ? ` · agendada para ${new Date(piece.scheduled_date).toLocaleString('pt-BR')}` : ''}{piece.status === 'published' ? ' · publicada' : ''}</p>
      <div className="space-y-2 rounded-xl border bg-card p-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Exportar ({cap?.export_kind === 'pdf' ? 'documento PDF' : 'imagens em ordem'})</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="accent" disabled={!!busy || piece.status === 'published'} onClick={() => run('export', async () => onChange((await exportSequence(piece, units, caps)).post))} data-testid="export-run">
            {busy === 'export' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : cap?.export_kind === 'pdf' ? <FileText className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />} {current ? 'Exportar de novo' : 'Exportar pacote'}</Button>
          {current && (pkg?.pdf_url || pkg?.zip_url) && (
            <a href={pkg.pdf_url ?? pkg.zip_url} target="_blank" rel="noreferrer" className="text-sm text-accent underline" data-testid="export-link">{pkg.pdf_url ? 'Baixar PDF' : 'Baixar imagens (ZIP)'} · v{pkg.version}</a>
          )}
          {pkg && !current && <span className="text-xs text-amber-700">O pacote exportado é de outra versão (v{pkg.version}); exporte de novo.</span>}
        </div>
      </div>
      <PublishPanel piece={piece} cap={cap} onChange={onChange} />
      {!cap?.auto_publish && <div className="space-y-2 rounded-xl border bg-card p-3" data-testid="publish-manual">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Publicação</p>
        <p className="text-sm">{cap?.auto_publish ? 'Publicação automática disponível.' : 'Publicação automática deste formato ainda não está disponível (chega na próxima etapa). Agende para organizar a agenda, publique o pacote exportado e marque aqui como publicado.'}</p>
        {cap?.notes && <p className="text-[11px] text-muted-foreground">{cap.notes} Verificado em {cap.verified_at.split('-').reverse().join('/')}.</p>}
        {piece.status !== 'published' && !cap?.auto_publish && (
          <div className="flex flex-wrap gap-2">
            <Input aria-label="Link da publicação" className="h-8 max-w-sm text-xs" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Link da publicação (opcional)" />
            <Button size="sm" variant="outline" disabled={!!busy || !current} title={current ? undefined : 'Exporte o pacote aprovado antes'} onClick={() => run('pub', async () => onChange(await markPublishedManually(piece, url.trim())))} data-testid="mark-published">Marcar como publicado</Button>
          </div>
        )}
      </div>}
      {piece.status === 'approved' && <p className="text-xs text-muted-foreground">Para agendar, siga para a programação: a agenda registra uma entrada para a peça inteira.</p>}
    </div>
  );
}
