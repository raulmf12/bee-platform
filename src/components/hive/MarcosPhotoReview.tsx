// Revisão humana da foto do Marcos (Constituição §11; Perfil §14): a candidata
// lado a lado com as referências reais (frontal, ¾, expressão e corpo quando
// aparece), o resultado dos portões e três decisões: aprovar | pedir ajuste | rejeitar.
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { getPhotoGeneration, reviewMarcosPhoto, type PhotoGeneration } from '@/lib/hive/marcosPhoto';
import { EXPRESSION_NAMES, STYLE_NAMES, VARIANT_NAMES } from '@/lib/hive/photoCatalog';
import { cn } from '@/lib/utils';

const STATUS: Record<string, { label: string; cls: string }> = {
  aprovada: { label: 'Portões: aprovada', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  revisar: { label: 'Portões: revisar', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  rejeitada: { label: 'Portões: reprovada', cls: 'bg-rose-500/15 text-rose-700 dark:text-rose-400' },
};

export function MarcosPhotoReview({ generationId, onApprove, onRegenerate, busy, compact }: {
  generationId: string; busy?: boolean; compact?: boolean;
  onApprove: () => Promise<void> | void;                 // marca o post como aprovado (portão da imagem)
  onRegenerate: (adjustNote?: string) => Promise<void> | void;
}) {
  const [g, setG] = useState<PhotoGeneration | null>(null);
  const [mode, setMode] = useState<'idle' | 'adjust'>('idle');
  const [note, setNote] = useState('');
  const [acting, setActing] = useState(false);
  useEffect(() => { void getPhotoGeneration(generationId).then(setG).catch(() => setG(null)); }, [generationId]);
  if (!g) return <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando a foto…</div>;

  const comp = g.plan?.comparison ?? {};
  const refs = [['Frontal', comp.front], ['¾', comp.three_quarter], ['Expressão', comp.expression], ['Corpo', comp.body]].filter(([, r]) => r) as Array<[string, { key: string; url: string }]>;
  const st = STATUS[g.auto_status ?? 'revisar'];
  const score = g.gates?.G1_identidade?.score;
  const disabled = busy || acting;

  async function act(decision: 'approve' | 'adjust' | 'reject') {
    setActing(true);
    try {
      await reviewMarcosPhoto(g!.id, decision, decision === 'adjust' ? note : undefined);
      if (decision === 'approve') { await onApprove(); toast.success('Foto aprovada — entrou na biblioteca do Marcos.'); }
      else { toast.info(decision === 'adjust' ? 'Gerando de novo com o ajuste…' : 'Rejeitada (registro de erros). Gerando outra…'); await onRegenerate(decision === 'adjust' ? note : undefined); }
      setMode('idle'); setNote('');
    } catch (e) { toast.error((e as Error).message.slice(0, 200)); } finally { setActing(false); }
  }

  return (
    <div className="space-y-3 rounded-lg border bg-card p-3" data-testid="marcos-photo-review">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold">{g.style_id} · {STYLE_NAMES[g.style_id]}</span>
        <span className="text-muted-foreground">{g.variant_id} {VARIANT_NAMES[g.variant_id]} · {g.expression_id} {EXPRESSION_NAMES[g.expression_id]}</span>
        <span className={cn('rounded px-1.5 py-0.5 font-medium', st.cls)} data-testid="photo-auto-status">{st.label}</span>
        {score != null && <span className="text-muted-foreground">identidade {Math.round(score * 100)}%</span>}
        {g.review_status !== 'pending' && <span className="rounded bg-secondary px-1.5 py-0.5">{g.review_status === 'approved' ? 'Aprovada por você' : g.review_status === 'rejected' ? 'Rejeitada' : 'Ajuste pedido'}</span>}
      </div>
      <div className="grid grid-cols-[3fr_2fr] gap-2">
        <figure className="space-y-1">
          {g.image_url && <img src={g.image_url} alt="Foto gerada" className={cn('w-full rounded border object-cover', compact ? 'max-h-[360px]' : 'max-h-[520px]')} data-testid="photo-candidate" />}
          <figcaption className="text-[10px] text-muted-foreground">Candidata · gerada · {g.model}</figcaption>
        </figure>
        <div className="grid grid-cols-2 content-start gap-2">
          {refs.map(([label, r]) => (
            <figure key={label} className="space-y-0.5">
              <img src={r.url} alt={`Referência ${label}`} className="aspect-[4/5] w-full rounded border object-cover" />
              <figcaption className="truncate text-[10px] text-muted-foreground">{label} · {r.key}</figcaption>
            </figure>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">Compare: rosto reconhecível sem depender de cabelo/roupa, idade atual, olhos/nariz/boca/mandíbula, barba e grisalho, corpo atual. Na dúvida, não publique.</p>
      {(g.gates?.failures?.length ?? 0) > 0 && (
        <ul className="space-y-0.5 rounded-md bg-amber-500/5 p-2 text-[11px] text-amber-800 dark:text-amber-300" data-testid="photo-failures">
          {g.gates!.failures!.map((f, i) => <li key={i} className="flex gap-1"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{f}</li>)}
        </ul>
      )}
      {g.plan?.sufficiency?.note && <p className="text-[11px] text-muted-foreground">ℹ {g.plan.sufficiency.note}</p>}
      {mode === 'adjust' ? (
        <div className="space-y-2">
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: luz mais neutra, ele olhando menos para baixo, sem pessoas ao fundo" aria-label="Ajuste pedido" />
          <div className="flex gap-2">
            <Button size="sm" variant="accent" disabled={disabled || !note.trim()} onClick={() => void act('adjust')}>{acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Gerar com o ajuste</Button>
            <Button size="sm" variant="ghost" onClick={() => setMode('idle')}>Cancelar</Button>
          </div>
        </div>
      ) : g.review_status === 'pending' && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={disabled} onClick={() => void act('approve')} data-testid="photo-approve">{acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Aprovar</Button>
          <Button size="sm" variant="outline" disabled={disabled} onClick={() => setMode('adjust')} data-testid="photo-adjust"><RefreshCw className="h-4 w-4" /> Pedir ajuste</Button>
          <Button size="sm" variant="ghost" className="text-rose-600" disabled={disabled} onClick={() => void act('reject')} data-testid="photo-reject"><XCircle className="h-4 w-4" /> Rejeitar</Button>
        </div>
      )}
    </div>
  );
}
