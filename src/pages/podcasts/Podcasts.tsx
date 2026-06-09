// Lista de podcasts (episodios do YouTube) + cortes vinculados.

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, Mic, Plus, Trash2, Youtube, FileText, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { podcastApi, podcastClipApi } from '@/lib/api';
import { edge } from '@/lib/edge';
import type { Podcast, PodcastClip } from '@/types';
import { toast } from 'sonner';

export function Podcasts() {
  const navigate = useNavigate();
  const [podcasts, setPodcasts] = useState<Podcast[]>([]);
  const [clips, setClips] = useState<PodcastClip[]>([]);
  const [loading, setLoading] = useState(true);
  const [mining, setMining] = useState<string | null>(null);

  async function mineClip(c: PodcastClip) {
    if (!c.transcript || c.transcript.length < 40) {
      toast.error('Corte sem transcrição suficiente pra minerar');
      return;
    }
    setMining(c.id);
    try {
      const r = await edge.mineContent({
        text: c.transcript,
        source_type: 'podcast_clip',
        source_id: c.id,
        context: c.title ?? undefined,
      });
      toast.success(`${r.created} sugestão(ões) na Curadoria${r.skipped ? ` · ${r.skipped} repetida(s)` : ''}`);
    } catch (e) {
      console.error(e);
      toast.error(`Falha ao minerar: ${(e as Error).message.slice(0, 140)}`);
    } finally {
      setMining(null);
    }
  }

  async function load() {
    setLoading(true);
    try {
      const [pods, cls] = await Promise.all([podcastApi.list(), podcastClipApi.list()]);
      setPodcasts(pods);
      setClips(cls);
    } catch (e) {
      console.error(e);
      toast.error('Falha ao carregar podcasts');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const clipsByPodcast = useMemo(() => {
    const map = new Map<string, PodcastClip[]>();
    for (const c of clips) {
      const key = c.podcast_id ?? 'sem';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return map;
  }, [clips]);

  async function removePodcast(p: Podcast) {
    if (!confirm(`Apagar o podcast "${p.title}"? Os cortes ficam, mas perdem o vinculo.`)) return;
    try {
      await podcastApi.delete(p.id);
      toast.success('Podcast removido');
      await load();
    } catch (e) {
      console.error(e);
      toast.error('Erro ao apagar');
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 lg:p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Mic className="h-6 w-6 text-accent" />
            <h1 className="font-display text-3xl font-bold">Podcasts</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Episodios (vindos do YouTube) e os cortes vinculados. Cada corte sobe transcrito e vira post.
          </p>
        </div>
        <Button variant="accent" onClick={() => navigate('/podcasts/novo')}>
          <Plus className="h-4 w-4" /> Novo corte
        </Button>
      </header>

      {loading ? (
        <div className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : podcasts.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            Nenhum podcast ainda. Clique em <span className="font-medium">Novo corte</span> pra comecar.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {podcasts.map((p) => {
            const list = clipsByPodcast.get(p.id) ?? [];
            return (
              <Card key={p.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex gap-3">
                    {p.thumbnail_url && (
                      <img src={p.thumbnail_url} alt="" className="h-20 w-32 shrink-0 rounded object-cover" />
                    )}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-sm font-semibold">{p.title}</p>
                        <div className="flex shrink-0 items-center gap-1">
                          <Badge variant="secondary" className="text-[9px]">{list.length} corte{list.length === 1 ? '' : 's'}</Badge>
                          {p.youtube_url && (
                            <a href={p.youtube_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                              <Youtube className="h-4 w-4 text-red-600" />
                            </a>
                          )}
                          <Button variant="ghost" size="icon" onClick={() => void removePodcast(p)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </div>
                      {p.channel && <p className="text-[11px] text-muted-foreground">{p.channel}</p>}
                      {p.description && <p className="line-clamp-2 text-xs text-muted-foreground">{p.description}</p>}
                    </div>
                  </div>

                  {list.length > 0 && (
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {list.map((c) => (
                        <div key={c.id} className="rounded-md border border-border p-2.5 text-xs">
                          <div className="flex items-center gap-1.5 font-medium">
                            <FileText className="h-3.5 w-3.5 text-accent" />
                            <span className="truncate">{c.title || 'Corte'}</span>
                          </div>
                          {c.transcript && (
                            <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{c.transcript}</p>
                          )}
                          <div className="mt-1.5 flex items-center justify-between gap-2">
                            <span className="text-[10px] text-muted-foreground">
                              {c.transcript ? `${c.transcript.length} chars` : 'sem transcricao'}
                            </span>
                            <div className="flex items-center gap-2">
                              {c.post_id && (
                                <Link to={`/posts/${c.post_id}`} className="text-[10px] text-accent hover:underline" onClick={(e) => e.stopPropagation()}>
                                  ver post →
                                </Link>
                              )}
                              <Button
                                variant="ghost" size="sm" className="h-6 px-1.5 text-[10px]"
                                disabled={mining === c.id || !c.transcript}
                                onClick={(e) => { e.stopPropagation(); void mineClip(c); }}
                              >
                                {mining === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />} Minerar
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
