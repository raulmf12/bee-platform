// Carregando · vazio confirmado · falha de leitura são estados DIFERENTES (Estabilização · doc 04 §13):
// uma consulta que falhou nunca vira "não há nada aqui". "Tentar novamente" só consulta de novo.
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function LoadError({ what, onRetry, compact }: { what: string; onRetry: () => void; compact?: boolean }) {
  return (
    <div role="alert" data-testid="load-error" className={`flex flex-wrap items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/5 ${compact ? 'px-3 py-2 text-xs' : 'p-4 text-sm'}`}>
      <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
      <span className="flex-1">Não foi possível carregar {what}. Isso não quer dizer que não exista — tente de novo.</span>
      <Button size="sm" variant="outline" onClick={onRetry}><RefreshCw className="h-3.5 w-3.5" /> Tentar novamente</Button>
    </div>
  );
}

export function Loading({ what }: { what: string }) {
  return <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando {what}…</p>;
}
