// PostEditor — canvas Fabric.js + caption + status + export pro Storage.

import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Loader2, Save, Send, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CanvasStudio } from '@/components/editor/canvas-studio/CanvasStudio';
import { usePostStore } from '@/store/postStore';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { PlatformBadge } from '@/components/shared/PlatformBadge';
import { POST_STATUS_LABELS, type PostStatus } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { uploadAssetImage, hashDataUrl } from '@/lib/storage';
import { edge } from '@/lib/edge';
import { almaApi } from '@/lib/api';
import { toast } from 'sonner';

// Mapeia plataforma+formato pro preset inicial mais adequado.
// User pode trocar via Select da mini-toolbar do CanvasStudio.
function derivePreset(platform: string, format: string): string {
  if (platform === 'instagram') {
    return format === 'carousel' ? 'instagram-square' : 'instagram-portrait';
  }
  // linkedin (default)
  return format === 'carousel' ? 'linkedin-square' : 'linkedin-portrait';
}

export function PostEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { posts, load, update } = usePostStore();
  const currentUser = useAuthStore((s) => s.currentUser);

  const post = posts.find((p) => p.id === id);

  const [title, setTitle] = useState('');
  const [briefing, setBriefing] = useState('');
  const [caption, setCaption] = useState('');
  const [fabricJson, setFabricJson] = useState<object | undefined>(undefined);
  const [imageDataUrl, setImageDataUrl] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [postingLive, setPostingLive] = useState(false);
  const [textDirty, setTextDirty] = useState(false);
  const [canvasDirty, setCanvasDirty] = useState(false);
  const lastUploadedHash = useRef<string | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!post) return;
    setTitle(post.title ?? '');
    setBriefing(post.briefing ?? '');
    setCaption(post.caption ?? '');
    setFabricJson(post.carousel_fabric_json?.[0]);
    setTextDirty(false);
    setCanvasDirty(false);
    lastUploadedHash.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post?.id]);

  // Auto-save de texto (1.5s)
  useEffect(() => {
    if (!textDirty || !post) return;
    const t = setTimeout(() => void saveText(), 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, briefing, caption, textDirty]);

  // Auto-save de canvas (3s; dedup por hash)
  useEffect(() => {
    if (!canvasDirty || !post || !imageDataUrl) return;
    const t = setTimeout(() => void saveCanvas(), 3000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageDataUrl, fabricJson, canvasDirty]);

  if (!post) {
    return (
      <div className="mx-auto max-w-3xl p-6 lg:p-8">
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground">Post nao encontrado.</p>
            <Button asChild variant="outline" className="mt-4">
              <Link to="/posts">
                <ArrowLeft className="h-4 w-4" /> Voltar
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  async function saveText() {
    if (!post) return;
    try {
      await update(post.id, { title, briefing, caption });
      setTextDirty(false);
    } catch (e) {
      console.error(e);
    }
  }

  async function saveCanvas() {
    if (!post || !fabricJson) return;
    try {
      await update(post.id, {
        carousel_fabric_json: [fabricJson],
      });
      setCanvasDirty(false);
    } catch (e) {
      console.error(e);
    }
  }

  async function saveAll() {
    setSaving(true);
    try {
      if (textDirty) await saveText();
      if (canvasDirty) await saveCanvas();
      toast.success('Salvo');
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(status: PostStatus) {
    if (!post) return;
    await update(post.id, { status });
    toast.success(`Status: ${POST_STATUS_LABELS[status]}`);
    if (status === 'published') {
      void almaApi.emitEvento({
        tipo: 'post_publicado',
        descricao: `Post publicado: "${(post.title ?? post.caption ?? 'sem título').slice(0, 60)}"`,
        source: 'posts',
      });
    }
  }

  async function exportAndPublish() {
    if (!post || !imageDataUrl || !currentUser) {
      toast.error('Renderiza o canvas antes (edita qualquer elemento).');
      return;
    }
    setPublishing(true);
    try {
      const hash = await hashDataUrl(imageDataUrl);
      if (hash === lastUploadedHash.current && post.rendered_slides?.slide1) {
        toast.info('Sem mudancas no canvas desde a ultima exportacao.');
      } else {
        const { publicUrl } = await uploadAssetImage({
          userId: currentUser.id,
          assetId: post.id,
          dataUrl: imageDataUrl,
          filename: 'render.png',
        });
        lastUploadedHash.current = hash;
        await update(post.id, {
          rendered_slides: { slide1: publicUrl },
        });
        toast.success('Imagem renderizada e salva no Storage.');
      }
    } catch (e) {
      console.error(e);
      toast.error('Falha ao exportar: ' + (e as Error).message);
    } finally {
      setPublishing(false);
    }
  }

  async function handlePublishLive() {
    if (!post) return;
    // Salvar texto pendente antes
    if (textDirty) await saveText();

    const platformLabel = post.platform === 'instagram' ? 'Instagram' : 'LinkedIn';
    const isVideo = post.format === ('video' as typeof post.format);

    // Pre-check: imagem renderizada ou video
    if (!isVideo && !post.rendered_slides?.slide1) {
      toast.error('Clique "Exportar" primeiro pra renderizar a imagem.');
      return;
    }
    if (!caption.trim()) {
      toast.error('Adicione uma caption antes de publicar.');
      return;
    }
    if (!confirm(`Publicar agora no ${platformLabel}?\n\nCaption: ${caption.slice(0, 80)}...\n\nEsta acao e irreversivel.`)) return;

    setPostingLive(true);
    try {
      const result = await edge.publishPost({ post_id: post.id });
      toast.success(`Publicado no ${platformLabel}!`);
      await update(post.id, {
        status: 'published',
        published_url: result.published_url,
        published_at: new Date().toISOString(),
      });
      // Metodologia viva: a frase publicada vira candidata a few-shot (passa pela
      // curadoria). Fire-and-forget — nunca atrapalha a publicacao.
      void import('@/lib/api').then(({ suggestionApi }) =>
        suggestionApi.captureFromPublishedPost({ ...post, caption }),
      );
      // Barramento da Alma: a publicação ao vivo é uma experiência que a alimenta.
      void almaApi.emitEvento({
        tipo: 'post_publicado',
        descricao: `Publicado ao vivo no ${platformLabel}: "${(post.title ?? caption ?? '').slice(0, 55)}"`,
        source: 'posts',
      });
      window.open(result.published_url, '_blank');
    } catch (e) {
      console.error(e);
      const msg = (e as Error).message;
      toast.error(`Falha: ${msg.slice(0, 250)}`);
    } finally {
      setPostingLive(false);
    }
  }

  const isDirty = textDirty || canvasDirty;
  const platformLabel = post.platform === 'instagram' ? 'Instagram' : 'LinkedIn';
  const isAlreadyPublished = !!post.published_url;

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card/60 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setTextDirty(true);
            }}
            placeholder="Titulo do post"
            className="h-8 max-w-md border-transparent bg-transparent text-base font-semibold focus-visible:border-input"
          />
        </div>
        <div className="flex items-center gap-2">
          <PlatformBadge platform={post.platform} />
          <StatusBadge status={post.status} />
          <Select value={post.status} onValueChange={(v) => void setStatus(v as PostStatus)}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(POST_STATUS_LABELS) as PostStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {POST_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {post.format !== ('video' as typeof post.format) && (
            <Button variant="outline" size="sm" onClick={() => void exportAndPublish()} disabled={publishing}>
              {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
              Exportar
            </Button>
          )}
          <Button variant="accent" size="sm" onClick={() => void saveAll()} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isDirty ? 'Salvar' : 'Salvo'}
          </Button>
          {isAlreadyPublished ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => post.published_url && window.open(post.published_url, '_blank')}
              title={`Ver no ${platformLabel}`}
            >
              <ExternalLink className="h-4 w-4" /> Publicado
            </Button>
          ) : (
            <Button
              variant="default"
              size="sm"
              onClick={() => void handlePublishLive()}
              disabled={postingLive}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              title={`Publicar no ${platformLabel} agora`}
            >
              {postingLive ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Publicar no {platformLabel}
            </Button>
          )}
        </div>
      </header>

      {post.publish_error && (
        <div className="border-b border-destructive/30 bg-destructive/10 px-6 py-2 text-xs text-destructive">
          ⚠ Última tentativa falhou: {post.publish_error}
        </div>
      )}

      <div className="grid flex-1 grid-cols-[1fr_400px] gap-4 overflow-hidden p-4">
        <div className="min-h-0 overflow-hidden">
          {post.format === ('video' as typeof post.format) && (post.metadata as { video_url?: string })?.video_url ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 rounded-lg border border-border bg-black p-4">
              <video
                src={(post.metadata as { video_url: string }).video_url}
                controls
                className="max-h-full max-w-full rounded-md"
              />
              <p className="text-[10px] text-muted-foreground">
                Vídeo armazenado. Edite a caption no painel à direita.
              </p>
            </div>
          ) : (
            <CanvasStudio
              key={post.id}
              embedded
              initialPreset={derivePreset(post.platform, post.format)}
              initialFabricJson={fabricJson}
              onChange={({ fabricJson: fj, dataUrl }) => {
                setFabricJson(fj);
                setImageDataUrl(dataUrl);
                setCanvasDirty(true);
              }}
            />
          )}
        </div>

        <aside className="flex flex-col gap-3 overflow-y-auto">
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="space-y-2">
                <Label htmlFor="briefing">Briefing</Label>
                <Textarea
                  id="briefing"
                  rows={3}
                  value={briefing}
                  onChange={(e) => {
                    setBriefing(e.target.value);
                    setTextDirty(true);
                  }}
                  className="text-xs"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="caption">
                  Caption (texto que vai no {post.platform === 'instagram' ? 'Instagram' : 'LinkedIn'})
                </Label>
                <Textarea
                  id="caption"
                  rows={12}
                  value={caption}
                  onChange={(e) => {
                    setCaption(e.target.value);
                    setTextDirty(true);
                  }}
                  className="text-xs leading-relaxed"
                />
                <p className="text-[10px] text-muted-foreground">{caption.length} chars</p>
              </div>

              <div className="space-y-2 pt-2 border-t border-border">
                <Label htmlFor="sched">Data de publicação (opcional)</Label>
                <Input
                  id="sched"
                  type="datetime-local"
                  value={post.scheduled_date ? new Date(post.scheduled_date).toISOString().slice(0, 16) : ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    void update(post.id, {
                      scheduled_date: value || undefined,
                      status: value ? 'scheduled' : post.status,
                    }).then(() => toast.success(value ? 'Agendado' : 'Agendamento removido'));
                  }}
                  className="text-xs"
                />
                <p className="text-[10px] text-muted-foreground">
                  {post.scheduled_date
                    ? `Publicação: ${new Date(post.scheduled_date).toLocaleString('pt-BR')}`
                    : 'Sem data — fica no Kanban como está'}
                </p>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
