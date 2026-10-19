// O que está PROGRAMADO (Estabilização · doc 03 §9–§11): o pacote imutável que vai ao ar, com data e conta.
// Edições posteriores não mudam o pacote — aparecem como "alterações fora do agendamento", com comparação e
// a troca explícita ("Atualizar conteúdo programado"). Agendamento antigo, sem pacote: "Confirme o material".
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, CalendarCheck, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { db } from '@/lib/db';
import { runScheduleCommand } from '@/lib/scheduling';
import { userMessage } from '@/lib/errors';
import { formatInZone } from '@/lib/schedule';
import { useReadiness } from '@/lib/readiness';
import type { UserPost } from '@/types';

interface Pkg { id: string; source_version: number; destination: string; origin: string; created_at: string; manifest: { texts: { caption: string; quote: string | null }; files: Array<{ url: string; role: string }> } }

export function ScheduledPackageCard({ post, onChanged, compact }: { post: UserPost; onChanged: (p: UserPost | null) => void; compact?: boolean }) {
  const [pkg, setPkg] = useState<Pkg | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [compare, setCompare] = useState(false);
  const [busy, setBusy] = useState(false);
  const outdated = !!(post.metadata as { scheduled_outdated?: boolean } | null)?.scheduled_outdated;
  const readiness = useReadiness(post.status === 'scheduled' ? post.id : null, 'schedule', post.updated_at);

  useEffect(() => {
    setPkg(null); setLoadError(false);
    if (post.status !== 'scheduled' || !post.scheduled_package_id) return;
    db.selectOne<Pkg>('publication_packages', { id: `eq.${post.scheduled_package_id}`, select: 'id,source_version,destination,origin,created_at,manifest' })
      .then((p) => { setPkg(p); setLoadError(!p); }).catch(() => setLoadError(true));
  }, [post.id, post.status, post.scheduled_package_id]);

  if (post.status !== 'scheduled' || !post.scheduled_date) return null;
  const legacy = !post.scheduled_package_id;
  const thumb = pkg?.manifest.files[0]?.url;
  const current = post.rendered_slides?.slide1;
  const blockers = readiness?.missing.filter((m) => m.component !== 'historico') ?? [];

  async function adopt() {
    setBusy(true);
    try {
      await runScheduleCommand({ postId: post.id, intent: 'replace_package', expectedVersion: post.version ?? null });
      const fresh = await db.selectOne<UserPost>('user_posts', { id: `eq.${post.id}` });
      onChanged(fresh);
      toast.success(legacy ? 'Material confirmado: é esta versão que será publicada.' : 'O agendamento agora usa a versão revisada.');
    } catch (e) {
      toast.error(`Não foi possível atualizar. O agendamento anterior foi mantido. ${userMessage(e)}`);
    } finally { setBusy(false); }
  }

  return (
    <div className={`space-y-2 rounded-lg border p-2.5 text-xs ${legacy || outdated ? 'border-amber-500/50 bg-amber-500/5' : 'border-emerald-500/40 bg-emerald-500/5'}`} data-testid="scheduled-package">
      <p className="flex items-center gap-1.5 font-semibold">
        <CalendarCheck className="h-3.5 w-3.5" /> Programado para {formatInZone(post.scheduled_date)}
        {pkg ? ` · ${pkg.destination.split(':')[0] === 'linkedin' ? 'LinkedIn' : 'Instagram'}` : ''}
      </p>
      {legacy ? (
        <>
          <p data-testid="legacy-package">
            <AlertTriangle className="mr-1 inline h-3.5 w-3.5 text-amber-600" />
            <b>Confirme o material programado.</b> Este agendamento é anterior à preservação do conteúdo: a Hive só publica depois que você confirmar que é esta versão (legenda e imagem atuais).
          </p>
          {!compact && current && <img src={current} alt="Material atual" className="max-h-40 rounded border object-contain" />}
          {blockers.length > 0 && <ul className="ml-4 list-disc text-amber-700">{blockers.map((m, i) => <li key={i}>{m.reason}</li>)}</ul>}
          <Button size="sm" variant="accent" disabled={busy || blockers.length > 0} onClick={() => void adopt()} data-testid="confirm-legacy">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Confirmar material
          </Button>
        </>
      ) : loadError ? (
        <p className="text-rose-700">Não consegui recuperar o conteúdo programado. A publicação será interrompida até isso ser resolvido.</p>
      ) : (
        <>
          <p className="text-muted-foreground">Esta é a versão que será publicada (fechada em {pkg ? new Date(pkg.created_at).toLocaleString('pt-BR') : '…'}).</p>
          {outdated && (
            <div className="space-y-1.5" data-testid="outdated-package">
              <p><AlertTriangle className="mr-1 inline h-3.5 w-3.5 text-amber-600" /><b>Há alterações fora do agendamento.</b> Elas só vão ao ar se você atualizar o conteúdo programado.</p>
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" onClick={() => setCompare((v) => !v)} data-testid="compare-package">{compare ? 'Fechar comparação' : 'Comparar'}</Button>
                <Button size="sm" variant="accent" disabled={busy || blockers.length > 0} onClick={() => void adopt()} data-testid="replace-package">
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Atualizar conteúdo programado
                </Button>
              </div>
              {blockers.length > 0 && <p className="text-amber-700">{blockers.map((m) => m.reason).join(' ')}</p>}
            </div>
          )}
          {compare && pkg && (
            <div className="grid grid-cols-2 gap-2" data-testid="package-compare">
              <div><p className="mb-1 font-semibold">Programado</p>{thumb && <img src={thumb} alt="Programado" className="mb-1 rounded border" />}<p className="whitespace-pre-wrap text-muted-foreground line-clamp-[12]">{pkg.manifest.texts.caption}</p></div>
              <div><p className="mb-1 font-semibold">Em edição</p>{current && <img src={current} alt="Em edição" className="mb-1 rounded border" />}<p className="whitespace-pre-wrap text-muted-foreground line-clamp-[12]">{post.caption}</p></div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
