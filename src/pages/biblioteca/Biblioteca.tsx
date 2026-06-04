// Biblioteca — posts publicados.

import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { usePostStore } from '@/store/postStore';
import { PlatformBadge } from '@/components/shared/PlatformBadge';

export function Biblioteca() {
  const { posts, load } = usePostStore();

  useEffect(() => {
    void load();
  }, [load]);

  const published = posts.filter((p) => p.status === 'published');

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 lg:p-8">
      <header>
        <h1 className="font-display text-3xl font-bold">Biblioteca</h1>
        <p className="text-sm text-muted-foreground">Tudo que ja foi publicado.</p>
      </header>

      {published.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            Nada publicado ainda.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {published.map((p) => (
            <Link key={p.id} to={`/posts/${p.id}`}>
              <Card className="cursor-pointer hover:border-accent/40 transition-colors">
                <CardContent className="p-4 space-y-2">
                  <p className="font-medium text-sm">{p.title || 'Sem titulo'}</p>
                  <PlatformBadge platform={p.platform} />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
