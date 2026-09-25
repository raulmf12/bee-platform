// Tela 13 · AÇÃO — "Conteúdos para agendar": aprovados sem data, por campanha e,
// dentro de cada campanha, na ORDEM em que deveriam entrar em circulação, com a
// janela que a Hive sugere. Arraste pro calendário (mesmo dataTransfer da Agenda).
import { useState } from 'react';
import { ChevronDown, ChevronRight, ImageIcon, Instagram, Linkedin, Lightbulb } from 'lucide-react';
import { formatRange } from '@/lib/campaign/dates';
import type { QueueInfo } from '@/lib/campaign/priority';
import type { UserPost } from '@/types';

export interface QueueGroup { id: string | null; name: string; color: string; items: Array<{ post: UserPost; info?: QueueInfo }> }

const LABEL_STYLE: Record<string, string> = { Alta: 'text-rose-500', Média: 'text-amber-500', Menor: 'text-muted-foreground' };

export function ScheduleQueue({ groups, lens, draggingId, onDragStart, onDragEnd, onSelect }: {
  groups: QueueGroup[]; lens: string | null; draggingId: string | null;
  onDragStart: (post: UserPost) => void; onDragEnd: () => void; onSelect: (post: UserPost) => void;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const total = groups.reduce((a, g) => a + g.items.length, 0);
  const isOpen = (g: QueueGroup, i: number) => open[g.id ?? '__none__'] ?? (!!lens || i === 0);
  return (
    <div className="space-y-2" data-testid="schedule-queue">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold">Conteúdos para agendar <span className="ml-1 rounded-full bg-secondary px-1.5 text-xs" data-testid="queue-count">{total}</span></p>
      </div>
      <p className="text-[11px] text-muted-foreground">Ordenados pela prioridade sugerida pela Hive. Arraste pro dia.</p>
      {total === 0 && <p className="py-6 text-center text-xs text-muted-foreground">Nada para agendar.</p>}
      {groups.map((g, gi) => {
        const expanded = isOpen(g, gi);
        return (
          <div key={g.id ?? '__none__'} className="rounded-lg border" data-testid="queue-group">
            <button type="button" onClick={() => setOpen({ ...open, [g.id ?? '__none__']: !expanded })} className="flex w-full items-center gap-2 px-2.5 py-2 text-left">
              <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: g.color }} />
              <span className="flex-1 truncate text-xs font-semibold">{g.name}</span>
              <span className="text-[11px] text-muted-foreground">{g.items.length} conteúdo{g.items.length > 1 ? 's' : ''}</span>
              {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
            {expanded && (
              <ol className="space-y-1 border-t p-1.5">
                {g.items.map(({ post, info }) => {
                  const img = post.rendered_slides?.slide1;
                  const label = (post.carousel_text?.quote as string | undefined) || post.title || post.caption || 'Peça';
                  return (
                    <li key={post.id}>
                      <button type="button" draggable data-testid="queue-item"
                        onDragStart={(e) => { e.dataTransfer.setData('text/plain', post.id); e.dataTransfer.effectAllowed = 'move'; onDragStart(post); }}
                        onDragEnd={onDragEnd} onClick={() => onSelect(post)}
                        className={`flex w-full cursor-grab items-start gap-2 rounded-md p-1.5 text-left hover:bg-accent/5 active:cursor-grabbing ${draggingId === post.id ? 'opacity-40' : ''}`}>
                        <span className="mt-0.5 w-3 shrink-0 text-[11px] font-semibold text-muted-foreground">{info?.rank ?? ''}</span>
                        <span className="h-11 w-9 shrink-0 overflow-hidden rounded border bg-secondary/40">
                          {img ? <img src={img} alt="" className="h-full w-full object-cover" loading="lazy" /> : <ImageIcon className="m-auto mt-3 h-4 w-4 text-muted-foreground" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          {info && <span className={`block text-[10px] font-semibold ${LABEL_STYLE[info.label]}`} data-testid="queue-priority">● {info.label} prioridade</span>}
                          <span className="block truncate text-xs font-medium">{label}</span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] text-muted-foreground">
                            <span className="inline-flex items-center gap-1">{post.platform === 'linkedin' ? <Linkedin className="h-3 w-3 text-[#0A66C2]" /> : <Instagram className="h-3 w-3 text-[#E1306C]" />}{post.format === 'reel' ? 'Vídeo' : 'Imagem'}</span>
                            {info && <span data-testid="queue-window">Hive sugere: {formatRange(info.windowStart, info.windowEnd)}</span>}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        );
      })}
      {total > 0 && (
        <div className="flex gap-2 rounded-lg border bg-accent/5 p-2.5 text-[11px] text-muted-foreground">
          <Lightbulb className="h-3.5 w-3.5 shrink-0 text-accent" />
          <span><b className="text-foreground">Dica da Hive:</b> arraste um conteúdo para a agenda ou use “IA distribuir” para alocar automaticamente.</span>
        </div>
      )}
    </div>
  );
}
