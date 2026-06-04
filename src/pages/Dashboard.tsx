// Hub principal (UserDashboardSimple no carrossel-ia).
// Saudacao + contadores + atalhos + posts recentes.

import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, FileText, FolderKanban, Image as ImageIcon, Plus, Sparkles, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuthStore } from '@/store/authStore';
import { usePostStore } from '@/store/postStore';
import { POST_STATUS_LABELS } from '@/types';
import { StatusBadge } from '@/components/shared/StatusBadge';

export function Dashboard() {
  const { currentUser } = useAuthStore();
  const { posts, load } = usePostStore();

  useEffect(() => {
    void load();
  }, [load]);

  const published = posts.filter((p) => p.status === 'published').length;
  const drafts = posts.filter((p) => p.status === 'draft' || p.status === 'idea').length;

  const recent = posts.slice(0, 4);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            Ola, {currentUser?.name ?? 'voce'} 👋
          </p>
          <h1 className="mt-1 font-display text-3xl font-bold">
            O que vamos cocriar hoje?
          </h1>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="lg">
            <Link to="/posts/novo-video">
              <Video className="h-4 w-4" />
              Vídeo
            </Link>
          </Button>
          <Button asChild variant="accent" size="lg">
            <Link to="/posts/novo">
              <Plus className="h-4 w-4" />
              Novo post
            </Link>
          </Button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          icon={<FileText className="h-4 w-4" />}
          label="Posts"
          value={posts.length}
        />
        <StatCard
          icon={<Sparkles className="h-4 w-4" />}
          label="Rascunhos"
          value={drafts}
        />
        <StatCard
          icon={<ImageIcon className="h-4 w-4" />}
          label="Publicados"
          value={published}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardContent className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-display text-base font-semibold">Posts recentes</h2>
                <p className="text-xs text-muted-foreground">
                  Ultimas atualizacoes do seu workspace
                </p>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link to="/posts">
                  Ver todos
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>

            {recent.length === 0 ? (
              <div className="rounded-md border border-dashed border-border bg-card/50 p-8 text-center">
                <p className="text-sm text-muted-foreground">
                  Nenhum post ainda. Cria o primeiro agora.
                </p>
                <Button asChild variant="accent" size="sm" className="mt-3">
                  <Link to="/posts/novo">
                    <Plus className="h-3.5 w-3.5" />
                    Novo post
                  </Link>
                </Button>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {recent.map((p) => (
                  <li key={p.id}>
                    <Link
                      to={`/posts/${p.id}`}
                      className="flex items-center justify-between gap-3 py-3 transition-colors hover:bg-secondary/50 -mx-2 px-2 rounded"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {p.title || p.briefing?.slice(0, 80) || 'Post sem titulo'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(p.updated_at).toLocaleDateString('pt-BR', {
                            day: '2-digit',
                            month: 'short',
                          })}
                          {' · '}
                          {POST_STATUS_LABELS[p.status]}
                        </p>
                      </div>
                      <StatusBadge status={p.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-3">
            <div>
              <h2 className="font-display text-base font-semibold">Atalhos</h2>
              <p className="text-xs text-muted-foreground">Comeca por aqui</p>
            </div>
            <Button asChild variant="outline" className="w-full justify-start">
              <Link to="/posts">
                <FolderKanban className="h-4 w-4" />
                Kanban editorial
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-start">
              <Link to="/configuracoes">
                <Sparkles className="h-4 w-4" />
                Configurar persona
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary text-muted-foreground">
          {icon}
        </div>
        <div>
          <p className="text-2xl font-bold leading-tight">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
