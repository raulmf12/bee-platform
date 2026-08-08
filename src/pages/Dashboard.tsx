// Hub principal — saudacao + contadores + kanban editorial + atalhos.
// O kanban vive aqui: e o pipeline inteiro, nao uma lista resumida.

import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardCheck, FileText, Image as ImageIcon, Plus, Sparkles, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuthStore } from '@/store/authStore';
import { usePostStore } from '@/store/postStore';
import { isTextPending } from '@/lib/postReview';
import { KanbanBoard } from '@/components/posts/KanbanBoard';

export function Dashboard() {
  const { currentUser } = useAuthStore();
  const { posts, load } = usePostStore();

  useEffect(() => {
    void load();
  }, [load]);

  const published = posts.filter((p) => p.status === 'published').length;
  const drafts = posts.filter((p) => p.status === 'draft' || p.status === 'idea').length;
  const pendingText = posts.filter(isTextPending).length;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8">
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
          <Button asChild variant="accent" size="lg">
            <Link to="/posts/novo">
              <Plus className="h-4 w-4" />
              Criar conteúdo
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

      {pendingText > 0 && (
        <Card className="border-l-4 border-l-amber-500 bg-amber-500/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-amber-500/15 text-amber-600">
                <ClipboardCheck className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">
                  {pendingText} {pendingText === 1 ? 'post aguardando' : 'posts aguardando'} aprovação de texto
                </p>
                <p className="text-xs text-muted-foreground">
                  Título e legenda ainda não aprovados — retome de onde parou, sem cair no design.
                </p>
              </div>
            </div>
            <Button asChild variant="accent" size="sm">
              <Link to="/posts/novo?retomar=1">
                <ClipboardCheck className="h-3.5 w-3.5" />
                Revisar agora
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold">Pipeline editorial</h2>
            <p className="text-xs text-muted-foreground">
              Arraste os cards entre as colunas pra mudar o status
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/linhas">
                <Zap className="h-3.5 w-3.5" />
                Campanha de conteúdo
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/configuracoes">
                <Sparkles className="h-3.5 w-3.5" />
                Configurar persona
              </Link>
            </Button>
          </div>
        </div>

        {posts.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-card/50 p-12 text-center">
            <p className="text-sm text-muted-foreground">
              Nenhum post ainda. Cria o primeiro agora.
            </p>
            <Button asChild variant="accent" size="sm" className="mt-3">
              <Link to="/posts/novo">
                <Plus className="h-3.5 w-3.5" />
                Post individual
              </Link>
            </Button>
          </div>
        ) : (
          <KanbanBoard />
        )}
      </section>
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
