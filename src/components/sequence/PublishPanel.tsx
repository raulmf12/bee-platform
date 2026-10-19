// Publicação de sequências (Fase 5 · etapa B): verificação prévia do pacote aprovado (mesma versão da
// prévia e da exportação), publicação automática por formato e registro por versão/destino; Stories
// com resultado por unidade e retomada ordenada (não repete as já publicadas).
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, Loader2, RefreshCw, Send, ShieldCheck, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { db } from '@/lib/db';
import { edge, PublishStateError } from '@/lib/edge';
import { ReconcileDialog } from '@/components/publication/ReconcileDialog';
import type { FormatCapability, UserPost } from '@/types';

interface Publication { id: string; version: number; destination: string; status: 'in_progress' | 'published' | 'partial' | 'failed'; stage?: string; units_total: number; units_published: number; url: string | null; error: string | null; started_at: string }
interface UnitPub { id: string; publication_id: string; position: number; status: 'pending' | 'published' | 'failed' | 'unknown'; error: string | null }
const STATUS: Record<Publication['status'], string> = { in_progress: 'em andamento', published: 'publicada', partial: 'parcial', failed: 'falhou' };

export function PublishPanel({ piece, cap, onChange }: { piece: UserPost; cap?: FormatCapability; onChange: (p: UserPost) => void }) {
  const [check, setCheck] = useState<{ ok: boolean; issues: string[]; plan: string[]; version: number | null; units: number } | null>(null);
  const [pubs, setPubs] = useState<Publication[]>([]);
  const [units, setUnits] = useState<UnitPub[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [reconcile, setReconcile] = useState<string | null>(null);

  const load = useCallback(async () => {
    const ps = await db.select<Publication>('post_publications', { post_id: `eq.${piece.id}`, order: 'started_at.desc' }).catch(() => []);
    setPubs(ps);
    if (piece.format === 'story' && ps[0]) setUnits(await db.select<UnitPub>('post_unit_publications', { publication_id: `eq.${ps[0].id}`, order: 'position.asc' }).catch(() => []));
  }, [piece.id, piece.format]);
  useEffect(() => { void load(); }, [load]);

  async function verify() {
    setBusy('check');
    try { setCheck((await edge.publishCheck({ post_id: piece.id })).check); } catch (e) { toast.error((e as Error).message.slice(0, 200)); } finally { setBusy(null); }
  }
  async function publish() {
    setBusy('publish');
    try {
      const r = await edge.publishPost({ post_id: piece.id });
      toast.success('Publicado.');
      const p = await db.selectOne<UserPost>('user_posts', { id: `eq.${piece.id}` });
      if (p) onChange(p);
      if (r.published_url) window.open(r.published_url, '_blank', 'noopener');
    } catch (e) {
      if (e instanceof PublishStateError) {
        toast.warning(e.message);
        if (e.state === 'needs_reconciliation' && e.publicationId) setReconcile(e.publicationId);
      } else toast.error((e as Error).message.replace(/^.*"details":"([^"]+)".*$/, '$1').slice(0, 260));
    } finally { setBusy(null); await load(); }
  }

  if (!cap?.auto_publish) return null;
  const last = pubs[0];
  const needsCheck = last?.stage === 'unknown';
  const resumable = piece.format === 'story' && last && !needsCheck && ['partial', 'failed', 'in_progress'].includes(last.status);
  return (
    <div className="space-y-2 rounded-xl border bg-card p-3" data-testid="publish-panel">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Publicação automática</p>
      <p className="text-xs text-muted-foreground">{cap.notes} Agendada, a peça é publicada pelo agendador com o pacote programado.</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={!!busy || piece.status === 'published'} onClick={verify} data-testid="publish-check">
          {busy === 'check' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />} Verificar antes de publicar</Button>
        <Button size="sm" variant="accent" disabled={!!busy || piece.status === 'published' || !check?.ok} onClick={publish} data-testid="publish-now">
          {busy === 'publish' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : resumable ? <RefreshCw className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />} {resumable ? 'Retomar publicação' : 'Publicar agora'}</Button>
      </div>
      {check && (
        <div className={`rounded-lg p-2 text-xs ${check.ok ? 'bg-emerald-500/10' : 'bg-rose-500/10'}`} data-testid="publish-check-result">
          {check.ok ? <p className="flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> Pronto para publicar a v{check.version} ({check.units} {piece.format === 'story' ? 'stories' : 'páginas'}).</p>
            : <p className="flex items-center gap-1.5 font-semibold text-rose-700"><XCircle className="h-3.5 w-3.5" /> Não dá para publicar ainda:</p>}
          {check.issues.length > 0 && <ul className="mt-1 list-disc pl-4">{check.issues.map((x, i) => <li key={i}>{x}</li>)}</ul>}
          {check.ok && <ol className="mt-1 list-decimal pl-4 text-muted-foreground">{check.plan.map((x, i) => <li key={i}>{x}</li>)}</ol>}
        </div>
      )}
      {pubs.length > 0 && (
        <div className="space-y-1 text-xs" data-testid="publications">
          {pubs.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded border px-2 py-1" data-testid="publication" data-status={p.status}>
              <span>v{p.version} · {p.destination.split(':')[0]} · {p.stage === 'unknown' ? 'a conferir' : STATUS[p.status]}{p.units_total > 1 ? ` · ${p.units_published}/${p.units_total}` : ''}</span>
              {p.stage === 'unknown' && <Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={() => setReconcile(p.id)} data-testid="publication-check">Conferir</Button>}
              {p.url ? <a href={p.url} target="_blank" rel="noreferrer" className="text-accent underline">ver</a> : p.error ? <span className="text-rose-600">{p.error.slice(0, 120)}</span> : null}
            </div>
          ))}
          {units.length > 0 && (
            <div className="flex flex-wrap gap-1" data-testid="unit-publications">
              {units.map((u) => <span key={u.id} title={u.error ?? undefined} className={`rounded px-1.5 py-0.5 ${u.status === 'published' ? 'bg-emerald-500/10 text-emerald-700' : u.status === 'failed' ? 'bg-rose-500/15 text-rose-700' : 'bg-secondary'}`} data-status={u.status}>{u.position}</span>)}
            </div>
          )}
        </div>
      )}
      <ReconcileDialog postId={piece.id} publicationId={reconcile} open={!!reconcile} onClose={() => setReconcile(null)} onResolved={() => void load()} />
    </div>
  );
}
