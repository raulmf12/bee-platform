import { ACJ_META, acjColor, isAcj } from '@/lib/acj/library';
import { cn } from '@/lib/utils';
import type { AcjId } from '@/types';

// Selo da ACJ (sempre com o prefixo — não confundir com M01–M04/F01–F04).
export function AcjChip({ id, secondary, size = 'sm', showPhrase = false, className }: {
  id?: AcjId | string | null; secondary?: boolean; size?: 'xs' | 'sm'; showPhrase?: boolean; className?: string;
}) {
  if (!isAcj(id)) {
    return (
      <span className={cn('inline-flex items-center gap-1 rounded-full border border-dashed border-amber-500/60 px-2 py-0.5 text-[11px] text-amber-700 dark:text-amber-400', className)} data-testid="acj-missing">
        Sem ACJ
      </span>
    );
  }
  const m = ACJ_META[id];
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-medium', size === 'xs' ? 'text-[10px]' : 'text-[11px]', secondary && 'opacity-75', className)}
      style={{ borderColor: `${acjColor(id)}66`, backgroundColor: `${acjColor(id)}14` }}
      title={`${id} ${m.name} — ${m.purpose}`} data-testid={secondary ? 'acj-chip-secondary' : 'acj-chip'} data-acj={id}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: acjColor(id) }} />
      {secondary ? '+ ' : ''}{id} {m.name}{showPhrase ? <span className="font-normal text-muted-foreground">· {m.short}</span> : null}
    </span>
  );
}
