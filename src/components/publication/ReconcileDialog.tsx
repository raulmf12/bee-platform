// Conferência de resultado incerto (Estabilização · doc 01 §4.3): a rede pode ter aceitado o post sem a
// Hive receber a confirmação. Nada é reenviado até o produtor dizer o que aconteceu: "Foi publicado"
// (com o link) registra o resultado; "Não foi publicado" libera nova tentativa. No Instagram, a Hive
// procura a publicação nos posts recentes da conta para facilitar a conferência.
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { db } from '@/lib/db';
import { edge } from '@/lib/edge';
import { userMessage } from '@/lib/errors';

interface Op { id: string; platform: string; destination: string; error: string | null; started_at: string; units_total: number; units_published: number }

export function ReconcileDialog({ postId, publicationId, open, onClose, onResolved }: {
  postId: string; publicationId?: string | null; open: boolean; onClose: () => void; onResolved: () => void;
}) {
  const [op, setOp] = useState<Op | null>(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setHint(null); setUrl('');
    const where: Record<string, string> = publicationId ? { id: `eq.${publicationId}` } : { post_id: `eq.${postId}`, stage: 'eq.unknown' };
    void db.selectOne<Op>('post_publications', { ...where, select: 'id,platform,destination,error,started_at,units_total,units_published' }).then(setOp).catch(() => setOp(null));
  }, [open, postId, publicationId]);

  async function findIg() {
    if (!op) return;
    setBusy('find');
    try {
      const r = await edge.findOnInstagram(op.id);
      if (r.found && r.url) { setUrl(r.url); setHint('Encontrei uma publicação com a mesma legenda na conta. Confira o link e confirme.'); }
      else setHint('Não encontrei uma publicação com esta legenda entre os posts recentes da conta.');
    } catch (e) { setHint(userMessage(e, 'Não consegui consultar o Instagram agora.')); } finally { setBusy(null); }
  }
  async function resolve(published: boolean) {
    if (!op) return;
    setBusy(published ? 'yes' : 'no');
    try {
      await db.rpc('reconcile_publication', { p_pub: op.id, p_published: published, p_url: published ? url.trim() : null });
      toast.success(published ? 'Publicação registrada.' : 'Registrado que não foi publicado — você pode tentar de novo.');
      onResolved();
      onClose();
    } catch (e) { toast.error(userMessage(e)); } finally { setBusy(null); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md" data-testid="reconcile-dialog">
        <DialogHeader>
          <DialogTitle>Precisamos conferir esta publicação</DialogTitle>
          <DialogDescription>
            A rede pode ter publicado sem a Hive receber a confirmação. Para não publicar duas vezes, nada será enviado até você conferir na conta.
          </DialogDescription>
        </DialogHeader>
        {!op ? <p className="text-sm text-muted-foreground">Nenhuma publicação aguardando conferência.</p> : (
          <div className="space-y-3 text-sm">
            <p className="text-xs text-muted-foreground">
              {op.platform === 'instagram' ? 'Instagram' : 'LinkedIn'} · tentativa de {new Date(op.started_at).toLocaleString('pt-BR')}
              {op.units_total > 1 ? ` · ${op.units_published} de ${op.units_total} confirmados` : ''}
              {op.error ? <><br />Motivo: {op.error.slice(0, 200)}</> : null}
            </p>
            {op.platform === 'instagram' && (
              <Button size="sm" variant="outline" onClick={() => void findIg()} disabled={!!busy}>
                {busy === 'find' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />} Procurar no Instagram
              </Button>
            )}
            {hint && <p className="rounded-md bg-secondary px-2 py-1.5 text-xs">{hint}</p>}
            <Input placeholder="Link da publicação (se foi publicado)" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Link da publicação" />
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" disabled={!op || !!busy} onClick={() => void resolve(false)} data-testid="reconcile-no">
            {busy === 'no' && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Não foi publicado
          </Button>
          <Button variant="accent" disabled={!op || !!busy || !url.trim()} onClick={() => void resolve(true)} data-testid="reconcile-yes">
            {busy === 'yes' && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Foi publicado
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
