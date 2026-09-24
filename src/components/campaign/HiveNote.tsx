import type { ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

// A "voz" da Hive nas telas: recomendação/explicação discreta, com o brilho da marca.
export function HiveNote({ title = 'Hive recomenda', children, className, action }: {
  title?: string; children: ReactNode; className?: string; action?: ReactNode;
}) {
  return (
    <div className={cn('rounded-xl border border-accent/30 bg-accent/5 p-4', className)} data-testid="hive-note">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-accent">{title}</p>
          <div className="text-sm leading-relaxed text-foreground/90">{children}</div>
        </div>
        {action}
      </div>
    </div>
  );
}
