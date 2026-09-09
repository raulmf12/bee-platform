// PostEditor — canvas Fabric.js + caption + status + export pro Storage.

import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, ExternalLink, Loader2, PauseCircle, Save, Send, Wand2 } from 'lucide-react';
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
import { uploadAssetImage, hashDataUrl, toJpegDataUrl } from '@/lib/storage';
import { edge } from '@/lib/edge';
import { aiApi, almaApi, severidadeOf } from '@/lib/api';
import { isoToLocalInput, localInputToIso, nowLocalInput } from '@/lib/schedule';
import { extractSlotText } from '@/lib/templates/extract';
import { generateHiveImage } from '@/lib/hive/runVisual';
import { bgGatePending } from '@/lib/hive/bgGate';
import { PostCoach } from '@/components/ai/PostCoach';
import type { HiveSeed } from '@/lib/edge';
import { toast } from 'sonner';

// Mapeia plataforma+formato pro preset inicial mais adequado.
// User pode trocar via Select da mini-toolbar do CanvasStudio.
function derivePreset(platform: string, format: string, canvasSize?: string, isHive?: boolean): string {
  // Posts da HIVE (com visual_decision) são SEMPRE compostos em 1080x1350 (4:5),
  // independente do canvas_size legado gravado no metadata. Abrir num preset de
  // outro tamanho (ex: 'square' 1200x1200) cortaria/deslocaria a peça e o fundo
  // full-bleed viraria branco nas bordas. Força portrait pra bater com o fabric.
  if (isHive) return platform === 'instagram' ? 'instagram-portrait' : 'linkedin-portrait'; // 1080x1350
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
  const location = useLocation();
  const { posts, load, update } = usePostStore();
  const currentUser = useAuthStore((s) => s.currentUser);

  const post = posts.find((p) => p.id === id);

  const [title, setTitle] = useState('');
  const [briefing, setBriefing] = useState('');
  const [caption, setCaption] = useState('');
  const [fabricJson, setFabricJson] = useState<object | undefined>(undefined);
  const [imageDataUrl, setImageDataUrl] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [postingLive, setPostingLive] = useState(false);
  const [approving, setApproving] = useState(false);
  const [hiveBusy, setHiveBusy] = useState(false);
  const [bgBusy, setBgBusy] = useState(false);
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
    // TRAVA ANTI-PERDA: nunca sobrescreve um post que TEM conteúdo com um canvas
    // vazio. Se a hidratação falhar (editor "em branco"), o auto-save gravava o
    // canvas vazio por cima do fabric bom e apagava a arte. Aqui recusamos.
    const newObjs = (fabricJson as { objects?: unknown[] }).objects?.length ?? 0;
    const storedObjs = (post.carousel_fabric_json?.[0] as { objects?: unknown[] } | undefined)?.objects?.length ?? 0;
    if (newObjs === 0 && storedObjs > 0) {
      console.warn(`[PostEditor] auto-save BLOQUEADO: canvas vazio sobre fabric com ${storedObjs} objeto(s) — hidratação falhou, não apaga a arte.`);
      setCanvasDirty(false);
      return;
    }
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

  // Portão do fundo de IA (M01-D/E): aprova o fundo gerado — libera Stand-by/Publicar.
  async function approveBg() {
    if (!post) return;
    setBgBusy(true);
    try {
      await update(post.id, { metadata: { ...(post.metadata ?? {}), bg_approved: true } });
      toast.success('Fundo aprovado — liberado pra publicar.');
    } catch {
      toast.error('Falha ao aprovar o fundo.');
    } finally {
      setBgBusy(false);
    }
  }

  // Regenera o fundo de IA mantendo o MESMO template (variante). Continua
  // pendente de aprovação depois — você aprova o fundo novo.
  async function regenerateBg() {
    if (!post || !currentUser) return;
    const variant = (post.visual_decision as { variant?: string } | undefined)?.variant;
    if (!variant) { toast.error('Sem variante decidida pra regenerar o fundo.'); return; }
    const frase = (post.carousel_text?.quote as string | undefined)?.trim() || title.trim();
    if (!frase) { toast.error('Sem frase pra compor.'); return; }
    setBgBusy(true);
    try {
      const vd = post.visual_decision as { highlight?: HiveSeed['highlight']; subtitle?: string | null } | undefined;
      const seed: HiveSeed = {
        variant,
        manifestation: variant.split('-')[0],
        highlight: vd?.highlight ?? null,
        subtitle: vd?.subtitle ?? null, poles: null, image_scene_hint: '',
        human_presence_adds_meaning: variant.startsWith('M02-'), mode_reason: '', variant_reason: 'regenerar imagem',
      };
      const { slide, dataUrl, publicUrl, decision } = await generateHiveImage({
        userId: currentUser.id, postId: post.id, text: frase,
        platform: post.platform as 'linkedin' | 'instagram',
        editorialSlug: post.metadata?.editorial_slug as string | undefined,
        seed, forceBg: true,
      });
      await update(post.id, {
        carousel_fabric_json: [slide],
        rendered_slides: { slide1: publicUrl },
        visual_decision: decision,
        image_status: 'pending',
        metadata: { ...(post.metadata ?? {}), bg_approved: false },
      });
      setFabricJson(slide);
      setImageDataUrl(dataUrl);
      lastUploadedHash.current = null;
      toast.success('Fundo regenerado — revise e aprove.');
    } catch (e) {
      console.error(e);
      toast.error(`Erro ao regenerar o fundo: ${(e as Error).message}`);
    } finally {
      setBgBusy(false);
    }
  }

  // Renderiza o canvas e sobe pro Storage no formato certo da plataforma
  // (Instagram = JPEG, LinkedIn = PNG). Chamado AUTOMATICAMENTE ao clicar em
  // Stand-by ou Publicar — não existe mais botão "Exportar". Dedup por hash:
  // se o canvas não mudou desde a última exportação, reusa a URL já salva.
  // Retorna a URL pública ou null se falhou.
  async function exportImage(): Promise<string | null> {
    if (!post) return null;
    if (post.format === ('video' as typeof post.format)) return post.rendered_slides?.slide1 ?? null;
    // PORTÃO DO FUNDO DE IA (M01-D/E): não deixa exportar/publicar até o fundo
    // gerado por IA ser aprovado explicitamente. Ver bgGate.ts.
    if (bgGatePending(post)) {
      toast.error('Aprove a imagem de IA antes (barra no topo do editor).');
      return null;
    }
    if (!imageDataUrl || !currentUser) {
      toast.error('Renderiza o canvas antes (edita qualquer elemento).');
      return null;
    }
    const hash = await hashDataUrl(imageDataUrl);
    if (hash === lastUploadedHash.current && post.rendered_slides?.slide1) {
      return post.rendered_slides.slide1; // sem mudanças desde a última exportação
    }
    const isIg = post.platform === 'instagram';
    const uploadUrl = isIg ? await toJpegDataUrl(imageDataUrl) : imageDataUrl;
    const { publicUrl } = await uploadAssetImage({
      userId: currentUser.id,
      assetId: post.id,
      dataUrl: uploadUrl,
      filename: isIg ? 'render.jpg' : 'render.png',
    });
    lastUploadedHash.current = hash;
    // Exportar a imagem final = o humano aprovou o que está no canvas (o botão
    // "Aprovar imagem" não existe mais). Satisfaz o portão de imagem do
    // publish.ts para posts da Hive, valendo também pra publicação via cron.
    await update(post.id, { rendered_slides: { slide1: publicUrl }, image_approved: true, image_status: 'approved' });
    return publicUrl;
  }

  // STAND-BY — aprova o post SEM data: fica pronto no Kanban (aprovado) mas não
  // agendado. Exporta a imagem automaticamente no formato certo. É também o
  // instrumento de medição da eficácia da IA: aprovar sem tocar no texto = a IA
  // acertou; aprovar depois de editar = errou, e o diff vira lição pro próximo.
  async function handleStandby() {
    if (!post) return;
    setApproving(true);
    try {
      // Mede o que está salvo, não o que está na tela: sem isso uma edição
      // ainda no debounce do auto-save ficaria de fora do diff.
      if (textDirty) await saveText();
      if (canvasDirty) await saveCanvas();
      // Auto-exporta a imagem no formato da plataforma (sem botão Exportar).
      await exportImage();

      // Posts de EXEMPLO nunca entram na medição/aprendizado da IA.
      if ((post.metadata as { is_sample?: boolean })?.is_sample) {
        await update(post.id, { status: 'approved', scheduled_date: null });
        toast.success('Stand-by — aprovado sem data (post de exemplo, não entra na medição)');
        return;
      }

      const variation = await aiApi.variationForPost(post.id);
      if (!variation) {
        // Post sem geração pristina (feito antes da medição existir, ou
        // criado à mão). Aprova, mas não inventa uma medição.
        await update(post.id, { status: 'approved', scheduled_date: null });
        toast.success('Stand-by — aprovado sem data (não foi gerado pela IA, não entra na medição)');
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

      await update(post.id, { status: 'approved', scheduled_date: null });

      // Régua graduada (item 2): ajuste cosmético não é erro cheio e não vira
      // lição — destilar de uma vírgula gasta uma chamada Gemini à toa.
      const sev = severidadeOf(review);
      if (sev === 'reescrita') {
        toast.success('Stand-by — a IA vai aprender com a sua correção');
        // Fire-and-forget: destilar a licao nao pode segurar a aprovacao.
        void edge.learnFromCorrection({ review_id: review.id }).catch((e) => {
          console.warn('[learn-from-correction]', e);
        });
      } else if (sev === 'ajuste') {
        toast.success('Stand-by — só um ajuste fino, a IA quase acertou');
      } else {
        toast.success('Stand-by — aprovado sem alterações, a IA acertou 🎯');
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
      toast.error(`Erro no stand-by: ${(e as Error).message.slice(0, 140)}`);
    } finally {
      setApproving(false);
    }
  }

  // Gera a imagem do post pela HIVE: decide a manifestação (M01 frase / M02 rosto
  // + pensamento) e a variante -> compõe as camadas (M02 usa foto real do Marcos,
  // gera só no fallback) -> renderiza -> sobe -> grava no post e carrega no editor.
  async function runHive() {
    if (!post || !currentUser) return;
    const frase = (post.carousel_text?.quote as string | undefined)?.trim() || title.trim();
    if (!frase) { toast.error('Sem frase pra compor a imagem.'); return; }
    setHiveBusy(true);
    try {
      const { slide, dataUrl, publicUrl, decision } = await generateHiveImage({
        userId: currentUser.id,
        postId: post.id,
        text: frase,
        platform: post.platform as 'linkedin' | 'instagram',
        editorialSlug: post.metadata?.editorial_slug as string | undefined,
      });
      await update(post.id, {
        carousel_fabric_json: [slide],
        rendered_slides: { slide1: publicUrl },
        visual_decision: decision,
        image_status: 'pending',
        image_approved: false, // imagem nova volta a precisar de aprovação
      });
      setFabricJson(slide);
      setImageDataUrl(dataUrl);
      lastUploadedHash.current = null;
      const reason = (decision.explanation?.variant_reason as string) || '';
      toast.success(`Hive escolheu ${decision.variant}${reason ? ` · ${reason}` : ''}`);
      if (decision.text_check?.needs_editorial_review) {
        toast.warning('A frase passou do limite ideal — vale revisar o texto.');
      }
    } catch (e) {
      console.error(e);
      toast.error(`Erro na Hive: ${(e as Error).message}`);
    } finally {
      setHiveBusy(false);
    }
  }

  async function handlePublishLive() {
    if (!post) return;
    // Salvar texto/canvas pendente antes (o export usa o canvas mais recente).
    if (textDirty) await saveText();
    if (canvasDirty) await saveCanvas();

    const platformLabel = post.platform === 'instagram' ? 'Instagram' : 'LinkedIn';
    const isVideo = post.format === ('video' as typeof post.format);

    if (!caption.trim()) {
      toast.error('Adicione uma caption antes de publicar.');
      return;
    }
    if (!confirm(`Publicar agora no ${platformLabel}?\n\nCaption: ${caption.slice(0, 80)}...\n\nEsta acao e irreversivel.`)) return;

    setPostingLive(true);
    try {
      // Auto-exporta a imagem no formato certo antes de publicar (não há mais
      // botão Exportar). Vídeo já vem armazenado, não precisa render.
      if (!isVideo) {
        const url = await exportImage();
        if (!url) { toast.error('Falha ao renderizar a imagem — verifique o canvas.'); return; }
      }
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

  // Agendar RENDERIZA a imagem junto (senão o post agendado sai sem imagem e o
  // publicador/cron falha na hora — foi o que sumiu um post agendado). Setar a
  // data = exportar + agendar. Bloqueado pelo portão do fundo de IA (D/E) se pendente.
  async function handleSchedule(value: string) {
    if (!post) return;
    if (!value) {
      await update(post.id, {
        scheduled_date: null,
        status: post.status === 'scheduled' ? 'approved' : post.status,
      });
      toast.success('Agendamento removido');
      return;
    }
    const iso = localInputToIso(value);
    if (iso && new Date(iso).getTime() < Date.now()) {
      toast.error('Não dá pra agendar no passado.');
      return;
    }
    if (post.format !== ('video' as typeof post.format)) {
      const url = await exportImage();
      if (!url) return; // exportImage já avisou (fundo pendente ou canvas não pronto)
    }
    await update(post.id, { scheduled_date: iso, status: 'scheduled' });
    toast.success('Agendado — imagem renderizada.');
  }

  const isDirty = textDirty || canvasDirty;
  const platformLabel = post.platform === 'instagram' ? 'Instagram' : 'LinkedIn';
  const isAlreadyPublished = !!post.published_url;

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card/60 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" onClick={() => { const from = (location.state as { from?: string } | null)?.from; if (from) navigate(from); else navigate(-1); }}>
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
            <Button variant="outline" size="sm" onClick={() => void runHive()} disabled={hiveBusy} title="Gerar a imagem com a Hive (decide M01 frase ou M02 rosto + pensamento)">
              {hiveBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              Hive
            </Button>
          )}
          <Button variant="accent" size="sm" onClick={() => void saveAll()} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isDirty ? 'Salvar' : 'Salvo'}
          </Button>
          {!isAlreadyPublished && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleStandby()}
              disabled={approving}
              className="border-emerald-500 text-emerald-600 hover:bg-emerald-50"
              title="Aprovar sem data — exporta a imagem e deixa o post pronto no Kanban (aprovado, sem agendamento)"
            >
              {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PauseCircle className="h-4 w-4" />}
              Stand-by
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
              Publicar
            </Button>
          )}
        </div>
      </header>

      {/* Portão do fundo de IA (M01-D Campo / M01-E Matéria): revisar antes de publicar. */}
      {bgGatePending(post) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/40 bg-amber-500/10 px-6 py-2.5">
          <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
            <Wand2 className="h-4 w-4 shrink-0" />
            <span>
              <b>Imagem gerada por IA</b> ({(post.visual_decision as { variant?: string })?.variant}) — revise antes de publicar. Aprove ou regenere.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void regenerateBg()} disabled={bgBusy}>
              {bgBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              Regenerar imagem
            </Button>
            <Button
              variant="default" size="sm" onClick={() => void approveBg()} disabled={bgBusy}
              className="bg-amber-600 text-white hover:bg-amber-700"
            >
              <CheckCircle2 className="h-4 w-4" /> Aprovar imagem
            </Button>
          </div>
        </div>
      )}

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
              initialPreset={derivePreset(post.platform, post.format, post.metadata?.canvas_size as string | undefined, !!post.visual_decision)}
              // Nunca passa undefined na montagem: o state `fabricJson` só é
              // preenchido por um effect DEPOIS do mount, e abrir o post direto
              // de uma lista fazia o CanvasStudio montar sem conteúdo e perder a
              // janela de hidratação (canvas transparente = editor "em branco").
              // Cai no fabric persistido do post até o state chegar.
              initialFabricJson={fabricJson ?? post.carousel_fabric_json?.[0]}
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
                  onChange={(e) => void handleSchedule(e.target.value)}
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
