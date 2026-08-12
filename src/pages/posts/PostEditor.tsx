// PostEditor — canvas Fabric.js + caption + status + export pro Storage.

import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, ExternalLink, Loader2, Save, Send, UploadCloud } from 'lucide-react';
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
import { POST_STATUS_LABELS, type AiVariation, type PostStatus } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { uploadAssetImage, hashDataUrl } from '@/lib/storage';
import { edge } from '@/lib/edge';
import { aiApi, almaApi, severidadeOf } from '@/lib/api';
import { isoToLocalInput, localInputToIso, nowLocalInput } from '@/lib/schedule';
import { extractSlotText } from '@/lib/templates/extract';
import { PostCoach } from '@/components/ai/PostCoach';
import { toast } from 'sonner';

// Mapeia plataforma+formato pro preset inicial mais adequado.
// User pode trocar via Select da mini-toolbar do CanvasStudio.
function derivePreset(platform: string, format: string, canvasSize?: string): string {
  // Se o post ja foi gerado num tamanho especifico (ex: wizard grava
  // metadata.canvas_size), honra-o — senao o canvas abriria num preset com
  // dimensoes diferentes das do fabric JSON ja hidratado.
  if (canvasSize === 'square') return 'linkedin-square';         // 1200x1200 (bate com o JSON do Bee Quote)
  if (canvasSize === 'portrait') return platform === 'instagram' ? 'instagram-portrait' : 'linkedin-portrait'; // 1080x1350
  if (canvasSize === 'landscape') return 'linkedin-landscape';
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
  const [approving, setApproving] = useState(false);
  const [variation, setVariation] = useState<AiVariation | null>(null);
  const [textDirty, setTextDirty] = useState(false);
  const [canvasDirty, setCanvasDirty] = useState(false);
  const lastUploadedHash = useRef<string | null>(null);
  // Quando o post carregou. O CanvasStudio dispara onChange na hidratação
  // inicial (não é edição do humano) — usamos isso pra IGNORAR essas mudanças
  // e não inflar manual_edits só por abrir o editor.
  const canvasLoadedAt = useRef(0);

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
    canvasLoadedAt.current = Date.now();
    // carrega a variacao pristina (o que a IA gerou) pra alimentar o coach
    setVariation(null);
    if (post.id) void aiApi.variationForPost(post.id).then(setVariation).catch(() => {});
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
              <Link to="/">
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
      // Cada save manual conta pra métrica de inteligência da IA (quanto o
      // humano precisou mexer depois de gerado).
      await update(post.id, { title, briefing, caption, manual_edits: (post.manual_edits ?? 0) + 1 });
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
        manual_edits: (post.manual_edits ?? 0) + 1,
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

  // APROVAR — o instrumento de medicao da eficacia da IA.
  //
  // Aprovar sem ter tocado no texto = a IA acertou. Aprovar depois de editar =
  // errou, e o diff vira licao pro proximo post. O post vai pra "Aprovado" no
  // kanban de qualquer jeito; o que muda e o que a IA aprende.
  async function handleApprove() {
    if (!post) return;
    setApproving(true);
    try {
      // Posts de EXEMPLO nunca entram na medição/aprendizado da IA.
      if ((post.metadata as { is_sample?: boolean })?.is_sample) {
        await update(post.id, { status: 'approved' });
        toast.success('Post de exemplo aprovado (não entra na medição da IA)');
        return;
      }
      // Mede o que esta salvo, nao o que esta na tela: sem isso uma edicao
      // ainda no debounce do auto-save ficaria de fora do diff.
      if (textDirty) await saveText();
      if (canvasDirty) await saveCanvas();

      const variation = await aiApi.variationForPost(post.id);
      if (!variation) {
        // Post sem geracao pristina (feito antes da medicao existir, ou
        // criado a mao). Aprova, mas nao inventa uma medicao.
        await update(post.id, { status: 'approved' });
        toast.success('Aprovado — este post não entra na medição (não foi gerado pela IA)');
        return;
      }

      const quoteFinal = extractSlotText(fabricJson ?? post.carousel_fabric_json?.[0]) ?? '';
      const review = await aiApi.recordReview({
        post_id: post.id,
        variation,
        quote_final: quoteFinal,
        caption_final: caption,
        // Faceta imagem: dormente. Quando os templates gerarem imagem por IA,
        // passe image_original (a que a IA gerou) e image_final (a do canvas) —
        // aí has_image liga e a imagem entra na medição do segmento.
      });

      await update(post.id, { status: 'approved' });

      // Régua graduada (item 2): ajuste cosmético não é erro cheio e não vira
      // lição — destilar de uma vírgula gasta uma chamada Gemini à toa.
      const sev = severidadeOf(review);
      if (sev === 'reescrita') {
        toast.success('Aprovado — a IA vai aprender com a sua correção');
        // Fire-and-forget: destilar a licao nao pode segurar a aprovacao.
        void edge.learnFromCorrection({ review_id: review.id }).catch((e) => {
          console.warn('[learn-from-correction]', e);
        });
      } else if (sev === 'ajuste') {
        toast.success('Aprovado — só um ajuste fino, a IA quase acertou');
      } else {
        toast.success('Aprovado sem alterações — a IA acertou 🎯');
      }

      void almaApi.emitEvento({
        tipo: sev === 'reescrita' ? 'post_corrigido'
          : sev === 'ajuste' ? 'post_ajustado' : 'post_aprovado_intacto',
        descricao:
          sev === 'reescrita' ? `Reescrita em "${(post.title ?? '').slice(0, 50)}" — a IA aprende com ela`
          : sev === 'ajuste' ? `Ajuste fino em "${(post.title ?? '').slice(0, 50)}"`
          : `A IA acertou de primeira: "${(post.title ?? '').slice(0, 50)}"`,
        source: 'posts',
      });
    } catch (e) {
      console.error(e);
      toast.error(`Erro ao aprovar: ${(e as Error).message.slice(0, 140)}`);
    } finally {
      setApproving(false);
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
          {post.status === 'pending_approval' && (
            <Button
              variant="default"
              size="sm"
              onClick={() => void handleApprove()}
              disabled={approving}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              title="Aprovar e mover pra Aprovados no kanban"
            >
              {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Aprovar
            </Button>
          )}
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

      {/* Métricas de inteligência da IA (só posts gerados têm código). */}
      {post.codigo && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-card/40 px-6 py-2 text-[11px] text-muted-foreground">
          <span className="font-mono font-semibold text-foreground">{post.codigo}</span>
          {post.virality_score != null && (
            <span title={post.virality_reason ?? undefined}>🚀 Potencial: <b className="text-foreground">{post.virality_score}/100</b></span>
          )}
          <span>🤖 Correções da IA: <b className="text-foreground">{post.ai_edit_rounds ?? 0}</b></span>
          <span>✍️ Edições manuais: <b className="text-foreground">{post.manual_edits ?? 0}</b></span>
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
              initialPreset={derivePreset(post.platform, post.format, post.metadata?.canvas_size as string | undefined)}
              initialFabricJson={fabricJson}
              onChange={({ fabricJson: fj, dataUrl }) => {
                setFabricJson(fj);
                setImageDataUrl(dataUrl);
                // Ignora as mudanças da hidratação inicial (~primeiros 2s): não
                // são edição manual do humano. Sem isso, só abrir o editor já
                // contava como edição e o contador nascia > 0.
                if (Date.now() - canvasLoadedAt.current > 2000) setCanvasDirty(true);
              }}
            />
          )}
        </div>

        <aside className="flex flex-col gap-3 overflow-y-auto">
          {/* Coach focado neste post: só aparece quando o post veio da IA
              (tem variação pristina pra ancorar o feedback). */}
          {variation && (
            <PostCoach
              focus={{
                quote: variation.quote,
                caption: variation.caption,
                editorial_slug: (post.metadata as { editorial_slug?: string })?.editorial_slug ?? null,
                platform: post.platform,
                target_avatar: (post.metadata as { target_avatar?: string })?.target_avatar ?? null,
              }}
            />
          )}
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
                  min={nowLocalInput()}
                  value={isoToLocalInput(post.scheduled_date)}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value) {
                      const iso = localInputToIso(value);
                      if (iso && new Date(iso).getTime() < Date.now()) {
                        toast.error('Não dá pra agendar no passado.');
                        return;
                      }
                      void update(post.id, { scheduled_date: iso, status: 'scheduled' })
                        .then(() => toast.success('Agendado'));
                    } else {
                      void update(post.id, {
                        scheduled_date: null,
                        status: post.status === 'scheduled' ? 'approved' : post.status,
                      }).then(() => toast.success('Agendamento removido'));
                    }
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
