// Upload de video + transcricao + geracao de caption Bee.

import { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Instagram, Linkedin, Loader2, Sparkles, UploadCloud, Video, Wand2 } from 'lucide-react';
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
import { uploadVideo } from '@/lib/storage';
import { edge } from '@/lib/edge';
import { beeApi } from '@/lib/api';
import type { BeeEditorial, Platform, TargetAvatar } from '@/types';
import { v4 as uuid } from 'uuid';
import { toast } from 'sonner';

type Phase = 'upload' | 'transcribing' | 'config' | 'generating' | 'edit' | 'creating';
type ContentType = 'podcast' | 'talking_head' | 'vlog' | 'tutorial' | 'behind_scenes' | 'palestra' | 'reel_curto' | 'outro';

const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  podcast: 'Podcast',
  talking_head: 'Talking Head (camera direto)',
  vlog: 'Vlog',
  tutorial: 'Tutorial / Demonstração',
  behind_scenes: 'Bastidor',
  palestra: 'Trecho de palestra',
  reel_curto: 'Reel curto',
  outro: 'Outro',
};

export function NewVideoPost() {
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.currentUser);
  const { create } = usePostStore();

  const [phase, setPhase] = useState<Phase>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [postId] = useState(() => uuid());
  const [uploadPct, setUploadPct] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoPath, setVideoPath] = useState<string | null>(null);
  // Plataformas-destino: 1 ou as 2 ao mesmo tempo (cria 2 posts ligados).
  const [targetPlatforms, setTargetPlatforms] = useState<Platform[]>(['instagram']);
  const [contentType, setContentType] = useState<ContentType>('podcast');
  const [transcript, setTranscript] = useState('');
  const [visualSummary, setVisualSummary] = useState('');
  const [detectedContentType, setDetectedContentType] = useState('');
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
  }, []);

  async function handleFile(f: File) {
    if (!currentUser) return;
    if (!f.type.startsWith('video/')) {
      toast.error('Selecione um arquivo de vídeo');
      return;
    }
    const sizeMB = f.size / 1024 / 1024;
    if (sizeMB > 200) {
      toast.error(`Limite 200MB (atual: ${sizeMB.toFixed(0)}MB)`);
      return;
    }
    setFile(f);
    setUploadPct(0);

    try {
      // 1. Upload pro Storage
      const { path, publicUrl } = await uploadVideo(currentUser.id, postId, f, (pct) => setUploadPct(pct));
      setVideoPath(path);
      setVideoUrl(publicUrl);
      setTitle(f.name.replace(/\.[^.]+$/, ''));

      // 2. Processa vídeo (transcrição via Gemini)
      setPhase('transcribing');
      const result = await edge.processVideo({ storage_path: path, mime_type: f.type, content_type: contentType });
      setTranscript(result.transcript);
      setVisualSummary(result.visual_summary);
      setDetectedContentType(result.detected_content_type ?? contentType);
      setPhase('config');
      toast.success(`Transcrito: ${result.transcript.length} chars · modelo: ${result.model_used}`);
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
        content_type: detectedContentType || contentType,
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
      const baseTitle = title || 'Post de vídeo';

      const createdIds: string[] = [];
      let firstId: string | null = null;

      for (const platform of targetPlatforms) {
        const post = await create({
          title: targetPlatforms.length > 1
            ? `${baseTitle} [${platform === 'linkedin' ? 'LI' : 'IG'}]`
            : baseTitle,
          briefing,
          platform,
          format: 'video' as 'image',
          carousel_text: {
            transcript,
            visual_summary: visualSummary,
            caption,
          },
          caption,
          metadata: {
            video_path: videoPath,
            video_url: videoUrl,
            editorial_slug: editorialSlug,
            target_avatar: targetAvatar,
            content_type: detectedContentType || contentType,
            source: 'video-upload',
            scheduled_date: scheduledDate || null,
            status,
            multi_platform_group: targetPlatforms.length > 1 ? targetPlatforms.join('+') : null,
          },
        });
        createdIds.push(post.id);
        if (!firstId) firstId = post.id;
        try {
          const { postApi } = await import('@/lib/api');
          await postApi.update(post.id, {
            status,
            scheduled_date: scheduledDate || undefined,
          });
        } catch (e) {
          console.warn('[NewVideoPost] update status falhou', e);
        }
      }

      if (createdIds.length === 2) {
        try {
          const { postApi } = await import('@/lib/api');
          await postApi.update(createdIds[0], { companion_post_id: createdIds[1] });
          await postApi.update(createdIds[1], { companion_post_id: createdIds[0] });
        } catch (e) {
          console.warn('[NewVideoPost] companion link falhou', e);
        }
      }

      toast.success(
        targetPlatforms.length > 1
          ? '2 posts de vídeo criados (LinkedIn + Instagram) — ligados como par.'
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

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 lg:p-8">
      <header className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <div className="flex items-center gap-2">
            <Video className="h-5 w-5 text-accent" />
            <h1 className="font-display text-2xl font-bold">Novo post de vídeo</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Sobe o vídeo já editado. A IA transcreve e escreve a legenda no estilo Bee.
          </p>
        </div>
      </header>

      {(phase === 'upload' || phase === 'transcribing') && (
        <Card>
          <CardContent className="space-y-4 p-6">
            {phase === 'upload' && (
              <>
                <div className="space-y-2">
                  <Label>Plataforma destino (1 ou as 2)</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={targetPlatforms.includes('linkedin') ? 'accent' : 'outline'}
                      onClick={() => togglePlatform('linkedin')}
                    >
                      <Linkedin className="h-3.5 w-3.5" /> LinkedIn
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={targetPlatforms.includes('instagram') ? 'accent' : 'outline'}
                      onClick={() => togglePlatform('instagram')}
                    >
                      <Instagram className="h-3.5 w-3.5" /> Instagram
                    </Button>
                  </div>
                  {targetPlatforms.length > 1 ? (
                    <p className="text-[10px] text-accent">
                      ✨ Vamos criar 2 posts ligados (LI + IG) usando o mesmo vídeo.
                    </p>
                  ) : (
                    <p className="text-[10px] text-muted-foreground">
                      {targetPlatforms[0] === 'instagram'
                        ? 'Reels e Posts de vídeo (até 90s) · MP4 1080×1920 (vertical) recomendado'
                        : 'Posts de vídeo no feed · MP4 até 10min · 1920×1080 ou 1080×1080 recomendado'}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Tipo de conteúdo do vídeo</Label>
                  <Select value={contentType} onValueChange={(v) => setContentType(v as ContentType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(CONTENT_TYPE_LABELS) as ContentType[]).map((t) => (
                        <SelectItem key={t} value={t}>{CONTENT_TYPE_LABELS[t]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Define como a IA analisa o visual e estrutura a legenda. Podcast/talking head têm visual reduzido — caption foca na fala.
                  </p>
                </div>
              </>
            )}
            <div
              className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-border p-12 cursor-pointer hover:border-accent transition-colors"
              onClick={() => phase === 'upload' && fileInputRef.current?.click()}
            >
              {phase === 'upload' ? (
                <>
                  <UploadCloud className="h-12 w-12 text-muted-foreground" />
                  <p className="text-sm font-medium">Clique pra escolher um vídeo</p>
                  <p className="text-xs text-muted-foreground">MP4, MOV, WebM · até 200MB · até ~10min</p>
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
                    {uploadPct < 100 ? file?.name : 'Pode levar 30s-2min dependendo do tamanho do vídeo'}
                  </p>
                  {uploadPct < 100 && (
                    <div className="w-full max-w-md bg-secondary rounded-full h-1.5">
                      <div className="bg-accent h-1.5 rounded-full transition-all" style={{ width: `${uploadPct}%` }} />
                    </div>
                  )}
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {(phase === 'config' || phase === 'generating') && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <div>
              <h2 className="font-display text-lg font-semibold">Configura a geração da caption</h2>
              <p className="text-sm text-muted-foreground">Transcrição pronta. Define editorial e avatar pra IA gerar.</p>
            </div>

            <div className="rounded-md border border-accent/30 bg-accent/5 p-3 text-xs space-y-1.5 max-h-48 overflow-y-auto">
              <p className="font-semibold">Transcrição extraída ({transcript.length} chars):</p>
              <p className="text-muted-foreground italic line-clamp-4 whitespace-pre-wrap">{transcript}</p>
              {visualSummary && (
                <>
                  <p className="font-semibold mt-2">Resumo visual:</p>
                  <p className="text-muted-foreground italic">{visualSummary}</p>
                </>
              )}
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
              <Label htmlFor="brf">Briefing adicional (opcional)</Label>
              <Textarea id="brf" rows={3} value={briefing} onChange={(e) => setBriefing(e.target.value)} placeholder="Quero foco em..." />
            </div>

            <div className="flex justify-end">
              <Button variant="accent" onClick={handleGenerate} disabled={phase === 'generating'}>
                {phase === 'generating' ? <><Loader2 className="h-4 w-4 animate-spin" /> Gerando...</> : <><Wand2 className="h-4 w-4" /> Gerar caption</>}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {(phase === 'edit' || phase === 'creating') && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <div>
              <h2 className="font-display text-lg font-semibold">Preview e edição</h2>
              <p className="text-sm text-muted-foreground">Ajusta a caption e cria o post.</p>
            </div>

            {videoUrl && (
              <video src={videoUrl} controls className="w-full rounded-md border border-border max-h-96" />
            )}

            <div className="space-y-1">
              <Label htmlFor="ttl">Título interno</Label>
              <Input id="ttl" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>

            <div className="space-y-1">
              <Label htmlFor="cap">Caption</Label>
              <Textarea id="cap" rows={10} value={caption} onChange={(e) => setCaption(e.target.value)} className="text-xs leading-relaxed" />
              <p className="text-[10px] text-muted-foreground">{caption.length} chars</p>
            </div>

            <div className="rounded-md border border-accent/30 bg-accent/5 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="sched" className="text-xs font-semibold">Agendar (opcional)</Label>
                <span className="text-[10px] text-muted-foreground">{targetPlatforms.length > 1 ? 'LinkedIn + Instagram' : targetPlatforms[0] === 'instagram' ? 'Instagram' : 'LinkedIn'} · Vídeo</span>
              </div>
              <Input
                id="sched"
                type="datetime-local"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="text-xs"
              />
              <p className="text-[10px] text-muted-foreground">
                {scheduledDate
                  ? `Status: Agendado pra ${new Date(scheduledDate).toLocaleString('pt-BR')}`
                  : 'Sem data → vai pro Kanban como Aprovado'}
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
