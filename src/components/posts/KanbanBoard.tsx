// Kanban editorial — colunas por status, cards de user_posts.
// Drag-drop nativo HTML5 (sem libs): card arrastado → drop em outra coluna muda status.
// Vive no Dashboard; extraido pra componente pra poder ser embutido em qualquer tela.

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { usePostStore } from '@/store/postStore';
import { POST_STATUS_LABELS, type PostStatus, type UserPost } from '@/types';
import { PlatformBadge } from '@/components/shared/PlatformBadge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// "Pendente de aprovação" fica entre rascunho e aprovado: e onde todo post
// gerado nasce, esperando o Aprovar — que e o que mede a eficacia da IA.
const COLUMNS: PostStatus[] = [
  'idea', 'draft', 'pending_approval', 'approved', 'scheduled', 'published',
];

export function KanbanBoard() {
  const { posts, delete: deletePost, setStatus } = usePostStore();
  const navigate = useNavigate();

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<PostStatus | null>(null);

  const grouped = useMemo(() => {
    const map: Record<PostStatus, typeof posts> = {
      idea: [],
      draft: [],
      pending_approval: [],
      approved: [],
      scheduled: [],
      published: [],
      archived: [],
    };
    for (const p of posts) {
      if (map[p.status]) map[p.status].push(p);
    }
    return map;
  }, [posts]);

  async function handleDelete(e: React.MouseEvent, p: UserPost) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Apagar "${p.title || 'este post'}"?\n\nEsta acao nao pode ser desfeita.`)) return;
    try {
      await deletePost(p.id);
      toast.success('Post apagado');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao apagar');
    }
  }

  async function handleDropOnCol(e: React.DragEvent, col: PostStatus) {
    e.preventDefault();
    setOverCol(null);
    const id = e.dataTransfer.getData('text/plain') || draggingId;
    setDraggingId(null);
    if (!id) return;
    const post = posts.find((p) => p.id === id);
    if (!post || post.status === col) return;
    try {
      await setStatus(id, col);
      toast.success(`Movido para "${POST_STATUS_LABELS[col]}"`);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao mover');
    }
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {COLUMNS.map((col) => {
        const isOver = overCol === col && draggingId !== null;
        return (
          <div
            key={col}
            className="space-y-2"
            onDragOver={(e) => {
              if (draggingId) e.preventDefault();
            }}
            onDragEnter={() => draggingId && setOverCol(col)}
            onDragLeave={(e) => {
              // só limpa se o cursor saiu mesmo da coluna (não pulou pra filho)
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setOverCol((c) => (c === col ? null : c));
              }
            }}
            onDrop={(e) => void handleDropOnCol(e, col)}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {POST_STATUS_LABELS[col]}
              </h3>
              <span className="text-xs text-muted-foreground">
                {grouped[col].length}
              </span>
            </div>
            <div
              className={cn(
                'space-y-2 min-h-[100px] rounded-lg border-2 border-dashed transition-colors p-1',
                isOver
                  ? 'border-accent bg-accent/5'
                  : 'border-transparent',
              )}
            >
              {grouped[col].map((p) => (
                <Card
                  key={p.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', p.id);
                    e.dataTransfer.effectAllowed = 'move';
                    setDraggingId(p.id);
                  }}
                  onDragEnd={() => {
                    setDraggingId(null);
                    setOverCol(null);
                  }}
                  className={cn(
                    'group relative hover:border-accent/40 transition-all cursor-grab active:cursor-grabbing',
                    draggingId === p.id && 'opacity-40 scale-95',
                  )}
                  onClick={() => navigate(`/posts/${p.id}`)}
                >
                  <CardContent className="space-y-2 p-3">
                    <p className="text-sm font-medium leading-tight line-clamp-2 pr-6">
                      {p.title || p.briefing?.slice(0, 60) || 'Sem titulo'}
                    </p>
                    <div className="flex items-center justify-between">
                      <PlatformBadge platform={p.platform} />
                      <span className="text-[10px] text-muted-foreground">
                        {p.scheduled_date
                          ? `📅 ${new Date(p.scheduled_date).toLocaleDateString('pt-BR', {
                              day: '2-digit',
                              month: 'short',
                            })}`
                          : new Date(p.updated_at).toLocaleDateString('pt-BR', {
                              day: '2-digit',
                              month: 'short',
                            })}
                      </span>
                    </div>
                  </CardContent>
                  <button
                    type="button"
                    onClick={(e) => void handleDelete(e, p)}
                    className="absolute top-1.5 right-1.5 rounded-md p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/15"
                    title="Apagar post"
                    aria-label="Apagar post"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </button>
                </Card>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
