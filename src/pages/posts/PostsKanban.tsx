// Kanban editorial — espelha ContentManagerView do carrossel-ia.
// Colunas vem de kanban_columns; cards vem de user_posts agrupados por status.
// Drag-drop nativo HTML5 (sem libs): card arrastado → drop em outra coluna muda status.

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Trash2, Video, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { usePostStore } from '@/store/postStore';
import { POST_STATUS_LABELS, type PostStatus, type UserPost } from '@/types';
import { PlatformBadge } from '@/components/shared/PlatformBadge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const COLUMNS: PostStatus[] = ['idea', 'draft', 'approved', 'scheduled', 'published'];

export function PostsKanban() {
  const { posts, load, delete: deletePost, setStatus } = usePostStore();
  const navigate = useNavigate();

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<PostStatus | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    const map: Record<PostStatus, typeof posts> = {
      idea: [],
      draft: [],
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
    <div className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Posts</h1>
          <p className="text-sm text-muted-foreground">Pipeline editorial em Kanban</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to="/posts/novo-video">
              <Video className="h-4 w-4" />
              Vídeo
            </Link>
          </Button>
          <Button asChild variant="outline" className="border-accent/50 text-accent hover:bg-accent/10">
            <Link to="/posts/novo?auto=1">
              <Zap className="h-4 w-4" />
              Automático
            </Link>
          </Button>
          <Button asChild variant="accent">
            <Link to="/posts/novo">
              <Plus className="h-4 w-4" />
              Novo post
            </Link>
          </Button>
        </div>
      </header>

      <div className="grid gap-3 lg:grid-cols-5">
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
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {POST_STATUS_LABELS[col]}
                </h2>
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
    </div>
  );
}
