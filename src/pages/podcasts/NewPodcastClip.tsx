// Fluxo dedicado de corte de podcast.
// 1. Vincula a um podcast = video do YouTube do episodio (puxa titulo/descricao).
// 2. Sobe o corte -> transcreve (process-video) -> guarda o corte na hora.
// 3. Emenda na geracao da caption (estilo Bee) e cria o(s) post(s).

import { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Instagram, Linkedin, Loader2, Sparkles, UploadCloud, Wand2, Youtube, Mic,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useAuthStore } from '@/store/authStore';
import { usePostStore } from '@/store/postStore';
import { uploadPodcastClip } from '@/lib/storage';
import { edge } from '@/lib/edge';
import { beeApi, podcastApi, podcastClipApi, postApi } from '@/lib/api';
import type { BeeEditorial, Platform, Podcast, TargetAvatar } from '@/types';
import { v4 as uuid } from 'uuid';
import { toast } from 'sonner';

type Phase = 'source' | 'upload' | 'transcribing' | 'config' | 'generating' | 'edit' | 'creating';

export function NewPodcastClip() {
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.currentUser);
  const { create } = usePostStore();

  const [phase, setPhase] = useState<Phase>('source');

  // --- fonte (podcast) ---
  const [podcasts, setPodcasts] = useState<Podcast[]>([]);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [fetchingMeta, setFetchingMeta] = useState(false);
  const [podcast, setPodcast] = useState<Podcast | null>(null);

  // --- corte ---
  const [clipId] = useState(() => uuid());
  const [file, setFile] = useState<File | null>(null);
  const [uploadPct, setUploadPct] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [savedClipId, setSavedClipId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState('');
  const [visualSummary, setVisualSummary] = useState('');
  const [detectedContentType, setDetectedContentType] = useState('podcast');

  // --- geracao ---
  const [targetPlatforms, setTargetPlatforms] = useState<Platform[]>(['instagram']);
  const [editorials, setEditorials] = useState<BeeEditorial[]>([]);
  const [editorialSlug, setEditorialSlug] = useState<string | undefined>();
  const [targetAvatar, setTargetAvatar] = useState<TargetAvatar>('ambos');
  const [briefing, setBriefing] = useState('');
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void beeApi.editorials().then(setEditorials);
    void podcastApi.list().then(setPodcasts);
  }, []);

  // Puxa metadados do YouTube e cria/atualiza o podcast.
  async function fetchYoutube() {
    if (!youtubeUrl.trim()) return;
    setFetchingMeta(true);
    try {
      const meta = await edge.fetchYoutubeMeta({ url: youtubeUrl.trim() });
      const pod = await podcastApi.upsertFromYoutube(meta);
      setPodcast(pod);
      setPodcasts((cur) => [pod, ...cur.filter((p) => p.id !== pod.id)]);
      toast.success(`Episodio vinculado: ${meta.title.slice(0, 60)}`);
    } catch (e) {
      console.error(e);
      toast.error(`Nao consegui ler o YouTube: ${(e as Error).message.slice(0, 160)}`);
    } finally {
      setFetchingMeta(false);
    }
  }

  function pickExisting(id: string) {
    const pod = podcasts.find((p) => p.id === id) ?? null;
    setPodcast(pod);
    if (pod?.youtube_url) setYoutubeUrl(pod.youtube_url);
  }

  async function handleFile(f: File) {
    if (!currentUser) return;
    if (!f.type.startsWith('video/')) {
      toast.error('Selecione um arquivo de video');
      return;
    }
    const sizeMB = f.size / 1024 / 1024;
    if (sizeMB > 200) {
      toast.error(`Limite 200MB (atual: ${sizeMB.toFixed(0)}MB)`);
      return;
    }
    setFile(f);
    setUploadPct(0);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));

    try {
      // 1. Upload do corte
      const { path, publicUrl } = await uploadPodcastClip(currentUser.id, clipId, f, (pct) => setUploadPct(pct));
      setVideoPath(path);
      setVideoUrl(publicUrl);

      // 2. Transcricao (process-video)
      setPhase('transcribing');
      const result = await edge.processVideo({ storage_path: path, mime_type: f.type, content_type: 'podcast' });
      setTranscript(result.transcript);
      setVisualSummary(result.visual_summary);
      setDetectedContentType(result.detected_content_type || 'podcast');

      // 3. Guarda o corte JA (transcricao salva + na biblioteca), mesmo antes de gerar o post.
      const clip = await podcastClipApi.create({
        id: clipId,
        podcast_id: podcast?.id ?? null,
        title: title || f.name.replace(/\.[^.]+$/, ''),
        video_path: path,
        video_url: publicUrl,
        transcript: result.transcript,
        visual_summary: result.visual_summary,
        content_type: result.detected_content_type || 'podcast',
      });
      setSavedClipId(clip.id);

      // Pre-preenche o briefing com o contexto do episodio.
      if (podcast && !briefing) {
        const ctx = [`Episodio: ${podcast.title}`, podcast.description?.slice(0, 600)].filter(Boolean).join('\n');
        setBriefing(ctx);
      }

      setPhase('config');
      toast.success(`Corte salvo na biblioteca · transcrito (${result.transcript.length} chars)`);
    } catch (e) {
      console.error(e);
      toast.error(`Falha: ${(e as Error).message.slice(0, 200)}`);
      setPhase('upload');
    }
  }

  async function handleGenerate() {
    if (!transcript) return;
    setPhase('generating');
    try {
      const result = await edge.generateCaptionFromVideo({
        transcript,
        visual_summary: visualSummary,
        content_type: detectedContentType || 'podcast',
        editorial_slug: editorialSlug,
        target_avatar: targetAvatar,
        briefing: briefing || undefined,
      });
      setCaption(result.caption);
      setPhase('edit');
    } catch (e) {
      console.error(e);
      toast.error(`Erro: ${(e as Error).message.slice(0, 200)}`);
      setPhase('config');
    }
  }

  function togglePlatform(p: Platform) {
    setTargetPlatforms((cur) => {
      const has = cur.includes(p);
      if (has) {
        if (cur.length === 1) return cur;
        return cur.filter((x) => x !== p);
      }
      return [...cur, p];
    });
  }

  async function handleCreate() {
    if (!currentUser) return;
    setPhase('creating');
    try {
      const status = scheduledDate ? 'scheduled' : 'approved';
      const baseTitle = title || podcast?.title || 'Corte de podcast';

      const createdIds: string[] = [];
      for (const platform of targetPlatforms) {
        const post = await create({
          title: targetPlatforms.length > 1
            ? `${baseTitle} [${platform === 'linkedin' ? 'LI' : 'IG'}]`
            : baseTitle,
          briefing,
          platform,
          format: 'video' as 'image',
          carousel_text: { transcript, visual_summary: visualSummary, caption },
          caption,
          metadata: {
            video_path: videoPath,
            video_url: videoUrl,
            editorial_slug: editorialSlug,
            target_avatar: targetAvatar,
            content_type: detectedContentType || 'podcast',
            source: 'podcast-clip',
            podcast_id: podcast?.id ?? null,
            podcast_clip_id: savedClipId ?? clipId,
            youtube_url: podcast?.youtube_url ?? null,
            scheduled_date: scheduledDate || null,
            status,
            multi_platform_group: targetPlatforms.length > 1 ? targetPlatforms.join('+') : null,
          },
        });
        createdIds.push(post.id);
        try {
          await postApi.update(post.id, { status, scheduled_date: scheduledDate || undefined });
        } catch (e) {
          console.warn('[NewPodcastClip] update status falhou', e);
        }
      }

      // Liga o corte salvo ao primeiro post gerado.
      if (savedClipId && createdIds[0]) {
        try {
          await podcastClipApi.update(savedClipId, { post_id: createdIds[0] });
        } catch (e) {
          console.warn('[NewPodcastClip] link clip->post falhou', e);
        }
      }

      if (createdIds.length === 2) {
        try {
          await postApi.update(createdIds[0], { companion_post_id: createdIds[1] });
          await postApi.update(createdIds[1], { companion_post_id: createdIds[0] });
        } catch (e) {
          console.warn('[NewPodcastClip] companion link falhou', e);
        }
      }

      toast.success(
        targetPlatforms.length > 1
          ? '2 posts criados (LinkedIn + Instagram) — ligados.'
          : scheduledDate
            ? `Agendado pra ${new Date(scheduledDate).toLocaleString('pt-BR')}`
            : 'Post aprovado e no Kanban',
      );
      navigate('/');
    } catch (e) {
      console.error(e);
      toast.error('Erro ao criar post');
      setPhase('edit');
    }
  }

  const canUpload = podcast !== null;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 lg:p-8">
      <header className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <div className="flex items-center gap-2">
            <Mic className="h-5 w-5 text-accent" />
            <h1 className="font-display text-2xl font-bold">Novo corte de podcast</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Vincula ao episodio no YouTube, sobe o corte, a IA transcreve e escreve a legenda no estilo Bee.
          </p>
        </div>
      </header>

      {/* PASSO 1 — fonte / podcast */}
      {phase === 'source' && (
        <Card>
          <CardContent className="space-y-5 p-6">
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5"><Youtube className="h-4 w-4 text-red-600" /> Episodio no YouTube</Label>
              <div className="flex gap-2">
                <Input
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  placeholder="Cole o link do episodio (youtube.com/watch?v=... ou youtu.be/...)"
                  onKeyDown={(e) => e.key === 'Enter' && !fetchingMeta && void fetchYoutube()}
                />
                <Button variant="outline" onClick={() => void fetchYoutube()} disabled={fetchingMeta || !youtubeUrl.trim()}>
                  {fetchingMeta ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Buscar'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">O sistema puxa o titulo e a descricao do episodio automaticamente.</p>
            </div>

            {podcasts.length > 0 && (
              <div className="space-y-1">
                <Label>...ou vincule a um episodio ja cadastrado</Label>
                <Select value={podcast?.id ?? ''} onValueChange={pickExisting}>
                  <SelectTrigger><SelectValue placeholder="Escolher episodio existente" /></SelectTrigger>
                  <SelectContent>
                    {podcasts.map((p) => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {podcast && (
              <div className="flex gap-3 rounded-md border border-accent/30 bg-accent/5 p-3">
                {podcast.thumbnail_url && (
                  <img src={podcast.thumbnail_url} alt="" className="h-20 w-32 shrink-0 rounded object-cover" />
                )}
                <div className="min-w-0 space-y-1">
                  <p className="truncate text-sm font-semibold">{podcast.title}</p>
                  {podcast.channel && <p className="text-[11px] text-muted-foreground">{podcast.channel}</p>}
                  {podcast.description && (
                    <p className="line-clamp-3 text-xs text-muted-foreground">{podcast.description}</p>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button variant="accent" onClick={() => setPhase('upload')} disabled={!canUpload}>
                Continuar pro upload
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* PASSO 2 — upload + transcricao */}
      {(phase === 'upload' || phase === 'transcribing') && (
        <Card>
          <CardContent className="space-y-4 p-6">
            {phase === 'upload' && (
              <div className="space-y-2">
                <Label>Plataforma destino (1 ou as 2)</Label>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant={targetPlatforms.includes('linkedin') ? 'accent' : 'outline'} onClick={() => togglePlatform('linkedin')}>
                    <Linkedin className="h-3.5 w-3.5" /> LinkedIn
                  </Button>
                  <Button type="button" size="sm" variant={targetPlatforms.includes('instagram') ? 'accent' : 'outline'} onClick={() => togglePlatform('instagram')}>
                    <Instagram className="h-3.5 w-3.5" /> Instagram
                  </Button>
                </div>
                {podcast && <p className="text-[11px] text-muted-foreground">Vinculado a: <span className="font-medium">{podcast.title}</span></p>}
              </div>
            )}
            <div
              className="flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed border-border p-12 transition-colors hover:border-accent"
              onClick={() => phase === 'upload' && fileInputRef.current?.click()}
            >
              {phase === 'upload' ? (
                <>
                  <UploadCloud className="h-12 w-12 text-muted-foreground" />
                  <p className="text-sm font-medium">Clique pra escolher o corte</p>
                  <p className="text-xs text-muted-foreground">MP4, MOV, WebM · ate 200MB</p>
                  <input ref={fileInputRef} type="file" accept="video/*" className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
                </>
              ) : (
                <>
                  <Loader2 className="h-12 w-12 animate-spin text-accent" />
                  <p className="text-sm font-medium">
                    {uploadPct < 100 ? `Enviando... ${uploadPct.toFixed(0)}%` : 'Transcrevendo com Gemini...'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {uploadPct < 100 ? file?.name : 'Pode levar 30s-2min'}
                  </p>
                  {uploadPct < 100 && (
                    <div className="h-1.5 w-full max-w-md rounded-full bg-secondary">
                      <div className="h-1.5 rounded-full bg-accent transition-all" style={{ width: `${uploadPct}%` }} />
                    </div>
                  )}
                </>
              )}
            </div>
            {phase === 'upload' && (
              <div className="flex justify-start">
                <Button variant="ghost" onClick={() => setPhase('source')}>Voltar</Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* PASSO 3 — config da geracao */}
      {(phase === 'config' || phase === 'generating') && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <div>
              <h2 className="font-display text-lg font-semibold">Configura a geracao</h2>
              <p className="text-sm text-muted-foreground">Corte salvo na biblioteca. Define editorial e avatar pra IA gerar a legenda.</p>
            </div>

            <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-md border border-accent/30 bg-accent/5 p-3 text-xs">
              <p className="font-semibold">Transcricao ({transcript.length} chars):</p>
              <p className="whitespace-pre-wrap italic text-muted-foreground line-clamp-4">{transcript}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Editorial (opcional)</Label>
                <Select value={editorialSlug ?? 'none'} onValueChange={(v) => setEditorialSlug(v === 'none' ? undefined : v)}>
                  <SelectTrigger><SelectValue placeholder="livre" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— livre —</SelectItem>
                    {editorials.map((e) => <SelectItem key={e.slug} value={e.slug}>{e.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Avatar</Label>
                <Select value={targetAvatar} onValueChange={(v) => setTargetAvatar(v as TargetAvatar)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ambos">Ambos</SelectItem>
                    <SelectItem value="identificado">O Identificado</SelectItem>
                    <SelectItem value="incomodado">O Incomodado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="brf">Briefing / contexto do episodio</Label>
              <Textarea id="brf" rows={4} value={briefing} onChange={(e) => setBriefing(e.target.value)} placeholder="Contexto do episodio (puxado do YouTube) + foco desejado..." />
            </div>

            <div className="flex justify-end">
              <Button variant="accent" onClick={handleGenerate} disabled={phase === 'generating'}>
                {phase === 'generating' ? <><Loader2 className="h-4 w-4 animate-spin" /> Gerando...</> : <><Wand2 className="h-4 w-4" /> Gerar caption</>}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* PASSO 4 — edicao + criar */}
      {(phase === 'edit' || phase === 'creating') && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <div>
              <h2 className="font-display text-lg font-semibold">Preview e edicao</h2>
              <p className="text-sm text-muted-foreground">Ajusta a caption e cria o post.</p>
            </div>

            {videoUrl && <video src={videoUrl} controls className="max-h-96 w-full rounded-md border border-border" />}

            <div className="space-y-1">
              <Label htmlFor="ttl">Titulo interno</Label>
              <Input id="ttl" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>

            <div className="space-y-1">
              <Label htmlFor="cap">Caption</Label>
              <Textarea id="cap" rows={10} value={caption} onChange={(e) => setCaption(e.target.value)} className="text-xs leading-relaxed" />
              <p className="text-[10px] text-muted-foreground">{caption.length} chars</p>
            </div>

            <div className="space-y-2 rounded-md border border-accent/30 bg-accent/5 p-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="sched" className="text-xs font-semibold">Agendar (opcional)</Label>
                <span className="text-[10px] text-muted-foreground">{targetPlatforms.length > 1 ? 'LinkedIn + Instagram' : targetPlatforms[0] === 'instagram' ? 'Instagram' : 'LinkedIn'} · Video</span>
              </div>
              <Input id="sched" type="datetime-local" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} className="text-xs" />
              <p className="text-[10px] text-muted-foreground">
                {scheduledDate ? `Status: Agendado pra ${new Date(scheduledDate).toLocaleString('pt-BR')}` : 'Sem data → vai pro Kanban como Aprovado'}
              </p>
            </div>

            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setPhase('config')}>Voltar (regenerar)</Button>
              <Button variant="accent" onClick={handleCreate} disabled={phase === 'creating'}>
                {phase === 'creating'
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</>
                  : <><Sparkles className="h-4 w-4" /> {scheduledDate ? 'Agendar' : 'Aprovar e mandar pro Kanban'}</>}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
