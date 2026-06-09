// Biblioteca — posts publicados + cortes de podcast guardados.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Mic } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePostStore } from '@/store/postStore';
import { PlatformBadge } from '@/components/shared/PlatformBadge';
import { podcastClipApi } from '@/lib/api';
import type { PodcastClip } from '@/types';

export function Biblioteca() {
  const { posts, load } = usePostStore();
  const [clips, setClips] = useState<PodcastClip[]>([]);

  useEffect(() => {
    void load();
    void podcastClipApi.list().then(setClips).catch(() => {});
  }, [load]);

  const published = posts.filter((p) => p.status === 'published');

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 lg:p-8">
      <header>
        <h1 className="font-display text-3xl font-bold">Biblioteca</h1>
        <p className="text-sm text-muted-foreground">Tudo que ja foi publicado e os cortes de podcast guardados.</p>
      </header>

      <Tabs defaultValue="publicados">
        <TabsList>
          <TabsTrigger value="publicados">Publicados ({published.length})</TabsTrigger>
          <TabsTrigger value="cortes">Cortes de podcast ({clips.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="publicados" className="mt-4">
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
                  <Card className="cursor-pointer transition-colors hover:border-accent/40">
                    <CardContent className="space-y-2 p-4">
                      <p className="text-sm font-medium">{p.title || 'Sem titulo'}</p>
                      <PlatformBadge platform={p.platform} />
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="cortes" className="mt-4">
          {clips.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center text-sm text-muted-foreground">
                Nenhum corte guardado. Crie um em <Link to="/podcasts/novo" className="text-accent hover:underline">Podcasts → Novo corte</Link>.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {clips.map((c) => (
                <Card key={c.id} className="transition-colors hover:border-accent/40">
                  <CardContent className="space-y-2 p-4">
                    <div className="flex items-center gap-1.5">
                      <Mic className="h-4 w-4 text-accent" />
                      <p className="truncate text-sm font-medium">{c.title || 'Corte'}</p>
                    </div>
                    {c.video_url && (
                      <video src={c.video_url} controls className="max-h-40 w-full rounded border border-border" />
                    )}
                    {c.transcript && (
                      <p className="line-clamp-3 text-xs text-muted-foreground">{c.transcript}</p>
                    )}
                    <div className="flex items-center justify-between pt-1">
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <FileText className="h-3 w-3" /> {c.transcript ? `${c.transcript.length} chars` : 'sem transcricao'}
                      </span>
                      {c.post_id && (
                        <Link to={`/posts/${c.post_id}`} className="text-[10px] text-accent hover:underline">ver post →</Link>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
