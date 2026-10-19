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
import { formatInZone, isoToLocalInput, localInputToIso, nowLocalInput, scheduleTimeZone } from '@/lib/schedule';
import { approvePieceOnServer, registerManualPublication } from '@/lib/approval';
import { scheduleAt, unschedule } from '@/lib/scheduling';
import { recordReviewSafely } from '@/lib/measurement';
import { useReadiness } from '@/lib/readiness';
import { extractSlotText } from '@/lib/templates/extract';
import { generateHiveImage } from '@/lib/hive/runVisual';
import { bgGatePending } from '@/lib/hive/bgGate';
import { MarcosPhotoReview } from '@/components/hive/MarcosPhotoReview';
import { PostCoach } from '@/components/ai/PostCoach';
import { isPublishedHistory, PUBLISHED_HISTORY_MSG, userMessage } from '@/lib/errors';
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
  const { posts, load, update, refreshOne, applyServer } = usePostStore();
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
  // Garante o auto-render-ao-abrir só UMA vez por post (evita loop no effect).
  const autoRenderedRef = useRef<string | null>(null);
  // Nº de objetos do canvas AO VIVO (atualizado no onChange, pareado com o
  // imageDataUrl). Serve de guarda anti-branco: se a hidratação falhou, o canvas
  // vem com 0 objetos e NÃO deixamos exportar/subir uma imagem em branco.
  const liveObjsRef = useRef(-1);
  // Assinatura do fabric já hidratado + chave que força o CanvasStudio a
  // remontar quando dados FRESCOS do banco chegam (ex: a peça da Hive foi
  // persistida DEPOIS que o editor abriu com uma cópia velha do store).
  const hydratedFabricRef = useRef<string | null>(null);
  const [canvasKey, setCanvasKey] = useState(0);
  // Últimos valores na tela: o salvamento só limpa o "pendente" se nada mudou enquanto gravava.
  const latestText = useRef({ title: '', briefing: '', caption: '' });
  latestText.current = { title, briefing, caption };
  const latestFabric = useRef<object | undefined>(undefined);
  latestFabric.current = fabricJson;
  // O que falta para agendar (mesma regra do servidor), relido a cada gravação da peça.
  const readiness = useReadiness(post?.id, 'schedule', post?.updated_at);
  // Autosave que falhou: avisa (uma vez) e mantém a edição pendente nesta tela.
  const warnSave = (e: unknown) => toast.error(`Não foi possível salvar automaticamente: ${userMessage(e)} Suas alterações continuam nesta tela.`, { id: 'autosave-fail' });

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!post) return;
    setTitle(post.title ?? '');
    setBriefing(post.briefing ?? '');
    setCaption(post.caption ?? '');
    setFabricJson(post.carousel_fabric_json?.[0]);
    hydratedFabricRef.current = JSON.stringify(post.carousel_fabric_json?.[0] ?? null);
    setTextDirty(false);
    setCanvasDirty(false);
    lastUploadedHash.current = null;
    canvasLoadedAt.current = Date.now();
    // carrega a variacao pristina (o que a IA gerou) pra alimentar o coach
    setVariation(null);
    if (post.id) void aiApi.variationForPost(post.id).then(setVariation).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post?.id]);

  // RE-HIDRATA quando o fabric do post muda no store (dados frescos do banco,
  // ex: após finalize/refresh) e o usuário NÃO tem edições pendentes — corrige o
  // editor mostrando uma versão velha (creme) enquanto o banco tem a certa (navy).
  useEffect(() => {
    if (!post) return;
    if (canvasDirty || textDirty) return; // nunca sobrescreve edição não salva
    const sig = JSON.stringify(post.carousel_fabric_json?.[0] ?? null);
    if (hydratedFabricRef.current === null || sig === hydratedFabricRef.current) return;
    hydratedFabricRef.current = sig;
    setFabricJson(post.carousel_fabric_json?.[0]);
    setImageDataUrl(undefined);
    liveObjsRef.current = -1;
    lastUploadedHash.current = null;
    autoRenderedRef.current = null;
    setCanvasKey((k) => k + 1); // força o CanvasStudio a remontar e re-hidratar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post?.carousel_fabric_json, post?.id]);

  // Auto-save de texto (1.5s)
  useEffect(() => {
    if (!textDirty || !post) return;
    const t = setTimeout(() => void saveText().catch(warnSave), 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, briefing, caption, textDirty]);

  // AVISO ANTES DE SAIR/RECARREGAR com edição pendente — evita perder a legenda/
  // texto que ainda não foi auto-salvo (ex: um Cmd+Shift+R no meio da edição).
  useEffect(() => {
    if (!textDirty && !canvasDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [textDirty, canvasDirty]);

  // Auto-save de canvas (3s; dedup por hash)
  useEffect(() => {
    if (!canvasDirty || !post || !imageDataUrl) return;
    const t = setTimeout(() => void saveCanvas().catch(warnSave), 3000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageDataUrl, fabricJson, canvasDirty]);

  // AUTO-RENDER AO ABRIR: post de imagem SEM render sobe a imagem sozinho quando
  // o canvas AO VIVO já produziu um frame (imageDataUrl) — basta abrir o post.
  // A guarda anti-branco do exportImage impede subir vazio se a hidratação falhar.
  // Uma vez por post; pulado se o fundo de IA está pendente.
  useEffect(() => {
    if (!post || post.format === ('video' as typeof post.format)) return;
    if (post.rendered_slides?.slide1) return;      // já tem imagem
    if (bgGatePending(post)) return;               // precisa aprovar a imagem de IA antes
    if (!imageDataUrl) return;                      // canvas ainda não renderizou
    if (liveObjsRef.current <= 0) return;           // canvas em branco (hidratação falhou)
    if (autoRenderedRef.current === post.id) return;
    autoRenderedRef.current = post.id;
    void exportImage({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageDataUrl, post?.id]);

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

  // SALVAR DE VERDADE (doc 02 §6): as funções lançam o erro para quem chamou — aprovar/agendar
  // não seguem com conteúdo que não foi gravado. O autosave só limpa o "pendente" se o texto
  // ainda é o mesmo que foi enviado (uma edição feita durante o salvamento continua pendente).
  async function saveText() {
    if (!post) return;
    const sent = { title, briefing, caption };
    // Cada save manual conta pra métrica de inteligência da IA (quanto o
    // humano precisou mexer depois de gerado).
    await update(post.id, { ...sent, manual_edits: (post.manual_edits ?? 0) + 1 });
    const now = latestText.current;
    if (now.title === sent.title && now.briefing === sent.briefing && now.caption === sent.caption) setTextDirty(false);
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
      // A arte salva foi preservada, mas a tela não carregou: não é um "salvo".
      throw new Error('A arte não carregou nesta tela (canvas em branco). Nada foi salvo por cima — dê um refresh antes de editar.');
    }
    const sent = fabricJson;
    await update(post.id, {
      carousel_fabric_json: [sent],
      manual_edits: (post.manual_edits ?? 0) + 1,
    });
    if (latestFabric.current === sent) setCanvasDirty(false);
    // AUTO-RENDER: todo post de imagem renderiza sozinho ao salvar (dedup por
    // hash; silencioso; bloqueado só se o fundo de IA estiver pendente). Garante
    // que rendered_slides fica sempre em dia — sem post agendado "sem imagem".
    if (post.format !== ('video' as typeof post.format)) await exportImage({ silent: true });
  }

  // Grava o que estiver pendente; lança com a mensagem do que NÃO foi salvo.
  async function flushPending(): Promise<void> {
    if (textDirty) {
      try { await saveText(); } catch (e) { throw new Error(`Não foi possível salvar o texto: ${userMessage(e)}`); }
    }
    if (canvasDirty) {
      try { await saveCanvas(); } catch (e) { throw new Error(`Texto salvo; não foi possível salvar a arte: ${userMessage(e)}`); }
    }
  }

  async function saveAll() {
    setSaving(true);
    try {
      await flushPending();
      // Garante a renderização mesmo quando nada estava "dirty" (ex: post antigo sem imagem).
      const url = post && post.format !== ('video' as typeof post.format) ? await exportImage({ silent: true }) : 'ok';
      toast.success(url ? 'Texto e arte salvos' : 'Edição salva; a imagem final ainda não foi preparada');
    } catch (e) {
      toast.error(`${userMessage(e, 'Não foi possível salvar.')} Suas alterações continuam nesta tela.`);
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(status: PostStatus) {
    if (!post) return;
    if (isPublishedHistory(post) && status !== 'archived') { toast.info(PUBLISHED_HISTORY_MSG); return; }
    // Aprovar e agendar têm comandos próprios (prontidão, pacote); publicado manual é um registro.
    if (status === 'approved') { await handleStandby(); return; }
    if (status === 'scheduled') { toast.info('Para agendar, escolha a data e a hora no campo "Data de publicação".'); return; }
    try {
      if (status === 'published') {
        if (!confirm('Marcar como publicado manualmente? Use quando você postou fora da Hive.')) return;
        applyServer(await registerManualPublication(post.id, prompt('Link da publicação (opcional):') || null));
      } else {
        await update(post.id, { status, ...(post.status === 'scheduled' ? { scheduled_date: null } : {}) });
      }
    } catch (e) { toast.error(userMessage(e, 'Não foi possível mudar o status.')); return; }
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
  async function regenerateBg(adjustNote?: string) {
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
        seed, forceBg: true, context: post.caption ?? undefined, photoAdjust: adjustNote,
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

  // Renderiza o canvas AO VIVO e sobe pro Storage no formato certo (Instagram =
  // JPEG, LinkedIn = PNG). Chamado AUTOMATICAMENTE ao salvar, agendar, abrir (se
  // faltar imagem) e em Stand-by/Publicar. Dedup por hash. Guarda anti-branco:
  // não sobe render vazio quando a hidratação falha. silent=true (auto) não
  // mostra toasts de erro pra não spammar durante a edição.
  async function exportImage(opts?: { silent?: boolean }): Promise<string | null> {
    const silent = opts?.silent ?? false;
    if (!post) return null;
    if (post.format === ('video' as typeof post.format)) return post.rendered_slides?.slide1 ?? null;
    // PORTÃO DO FUNDO DE IA (M01-D/E, M02): não deixa exportar/publicar até a
    // imagem gerada por IA ser aprovada explicitamente. Ver bgGate.ts.
    if (bgGatePending(post)) {
      if (!silent) toast.error('Aprove a imagem de IA antes (barra no topo do editor).');
      return null;
    }
    if (!imageDataUrl || !currentUser) {
      if (!silent) toast.error('Renderiza o canvas antes (edita qualquer elemento).');
      return null;
    }
    // GUARDA ANTI-BRANCO: se o canvas AO VIVO não tem objetos, a hidratação
    // falhou (canvas em branco) — NÃO sobe um render vazio por cima. O post que
    // TEM fabric salvo com objetos mas o canvas veio vazio = hidratação quebrada:
    // pede refresh em vez de destruir a arte com um branco.
    const storedObjs = (post.carousel_fabric_json?.[0] as { objects?: unknown[] } | undefined)?.objects?.length ?? 0;
    if (storedObjs > 0 && liveObjsRef.current === 0) {
      if (!silent) toast.error('O canvas não carregou a arte (tela em branco). Dá um refresh e tente de novo.');
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
    // Exportar PREPARA o arquivo; não é revisão humana (doc 02 §6.3 · T11). A aprovação do visual
    // acontece no "Aprovar" (approve_piece), que confere que este é o arquivo apresentado.
    await update(post.id, { rendered_slides: { slide1: publicUrl } });
    return publicUrl;
  }

  // STAND-BY — aprova o post SEM data: fica pronto no Kanban (aprovado) mas não
  // agendado. Exporta a imagem automaticamente no formato certo. É também o
  // instrumento de medição da eficácia da IA: aprovar sem tocar no texto = a IA
  // acertou; aprovar depois de editar = errou, e o diff vira lição pro próximo.
  // APROVAR (antes "Stand-by") — doc 02 §8.1: confirma salvamentos, prepara a imagem final, e o
  // SERVIDOR aprova a peça com o arquivo apresentado (approve_piece). Sem data: fica "Peça aprovada ·
  // sem data". Já agendada: aprova e MANTÉM a data (nunca desagenda em silêncio). A medição da IA
  // vem depois e não derruba a aprovação se falhar (fica pendente para reprocessar).
  async function handleStandby() {
    if (!post || !currentUser) return;
    setApproving(true);
    try {
      try { await flushPending(); } catch (e) { toast.error(`Aprovação não concluída. ${userMessage(e)}`); return; }
      let rendered: string | null = post.rendered_slides?.slide1 ?? null;
      if (post.format !== ('video' as typeof post.format)) {
        rendered = await exportImage();
        if (!rendered) { toast.error('Stand-by não concluído: a imagem final não ficou pronta. A peça continua como estava.'); return; }
      }
      let approved;
      try { approved = await approvePieceOnServer(post.id, rendered); }
      catch (e) { toast.error(`Não foi possível salvar esta aprovação: ${userMessage(e)}`); return; }
      applyServer(approved);
      const where = approved.status === 'scheduled' && approved.scheduled_date
        ? `continua agendada para ${formatInZone(approved.scheduled_date)}` : 'aprovada · sem data';

      // Posts de EXEMPLO e peças sem geração pristina não entram na medição.
      const variation = (post.metadata as { is_sample?: boolean })?.is_sample ? null : await aiApi.variationForPost(post.id).catch(() => null);
      if (!variation) { toast.success(`Peça ${where}.`); return; }
      const quoteFinal = extractSlotText(fabricJson ?? post.carousel_fabric_json?.[0]) ?? '';
      const m = await recordReviewSafely(currentUser.id, { post_id: post.id, variation, quote_final: quoteFinal, caption_final: caption });
      if (!m.review) { toast.success(`Peça ${where}.${m.state === 'pending' ? ' (A medição da IA fica para depois.)' : ''}`); return; }

      // Régua graduada (item 2): ajuste cosmético não é erro cheio e não vira
      // lição — destilar de uma vírgula gasta uma chamada Gemini à toa.
      const sev = severidadeOf(m.review);
      if (sev === 'reescrita') {
        toast.success(`Peça ${where} — a IA vai aprender com a sua correção`);
        // Fire-and-forget: destilar a licao nao pode segurar a aprovacao.
        void edge.learnFromCorrection({ review_id: m.review.id }).catch((e) => console.warn('[learn-from-correction]', e));
      } else if (sev === 'ajuste') {
        toast.success(`Peça ${where} — só um ajuste fino, a IA quase acertou`);
      } else {
        toast.success(`Peça ${where} — sem alterações, a IA acertou 🎯`);
      }
      void almaApi.emitEvento({
        tipo: sev === 'reescrita' ? 'post_corrigido' : sev === 'ajuste' ? 'post_ajustado' : 'post_aprovado_intacto',
        descricao:
          sev === 'reescrita' ? `Reescrita em "${(post.title ?? '').slice(0, 50)}" — a IA aprende com ela`
          : sev === 'ajuste' ? `Ajuste fino em "${(post.title ?? '').slice(0, 50)}"`
          : `A IA acertou de primeira: "${(post.title ?? '').slice(0, 50)}"`,
        source: 'posts',
      });
    } catch (e) {
      console.error(e);
      toast.error(`Erro ao aprovar: ${userMessage(e)}`);
    } finally {
      setApproving(false);
    }
  }

  // Gera a imagem do post pela HIVE: decide a manifestação (M01 frase / M02 rosto
  // + pensamento) e a variante -> compõe as camadas (M02 usa foto real do Marcos,
  // gera só no fallback) -> renderiza -> sobe -> grava no post e carrega no editor.
  async function runHive(fraseOverride?: string) {
    if (!post || !currentUser) return;
    const frase = fraseOverride?.trim() || (post.carousel_text?.quote as string | undefined)?.trim() || title.trim();
    if (!frase) { toast.error('Sem frase pra compor a imagem.'); return; }
    setHiveBusy(true);
    try {
      // Se o post JÁ tem uma decisão visual, RE-RENDERIZA o MESMO template (via
      // seed) — mesma variante, mesmo destaque, mesmo texto — só num fabric novo
      // e limpo (composeM01 6.0.0) que carrega/renderiza certo. É como um post
      // com o fabric salvo corrompido (editor 6.9.1 não recarrega) volta ao ar
      // no mesmo template. Sem decisão (1ª vez) → deixa a Hive decidir.
      const vd = post.visual_decision as { variant?: string; highlight?: HiveSeed['highlight']; subtitle?: string | null } | undefined;
      const seed: HiveSeed | undefined = vd?.variant ? {
        variant: vd.variant,
        manifestation: vd.variant.split('-')[0],
        highlight: vd.highlight ?? null,
        subtitle: vd.subtitle ?? null,
        poles: null,
        image_scene_hint: '',
        human_presence_adds_meaning: vd.variant.startsWith('M02-'),
        mode_reason: '',
        variant_reason: 're-render mesmo template',
      } : undefined;
      const { slide, dataUrl, publicUrl, decision } = await generateHiveImage({
        userId: currentUser.id,
        postId: post.id,
        text: frase,
        platform: post.platform as 'linkedin' | 'instagram',
        editorialSlug: post.metadata?.editorial_slug as string | undefined,
        seed, context: post.caption ?? undefined, previousDecision: post.visual_decision as Record<string, unknown> | null,
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

  // Texto reescrito pela Hive no Coach → aplica no post. Conta como correção da
  // IA (não edição manual). Legenda: grava direto, com Desfazer. Frase: troca o
  // texto da imagem e re-renderiza no MESMO template (imagem volta à aprovação).
  async function applyHiveText(field: 'titulo' | 'legenda', text: string) {
    if (!post) return;
    const rounds = (post.ai_edit_rounds ?? 0) + 1;
    if (field === 'legenda') {
      const prev = caption;
      setCaption(text);
      await update(post.id, { caption: text, ai_edit_rounds: rounds });
      setTextDirty(false);
      toast.success('Legenda aplicada', {
        action: { label: 'Desfazer', onClick: () => { setCaption(prev); void update(post.id, { caption: prev }); } },
      });
      return;
    }
    await update(post.id, { carousel_text: { ...(post.carousel_text ?? {}), quote: text }, ai_edit_rounds: rounds });
    await runHive(text);
  }

  async function handlePublishLive() {
    if (!post) return;
    // Salvar texto/canvas pendente antes (o export usa o canvas mais recente).
    try { await flushPending(); } catch (e) { toast.error(`Publicação não iniciada. ${userMessage(e)}`); return; }

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
      if (result.reused) {
        toast.info('Esta peça já foi publicada — nada foi enviado de novo.');
        await load();
        return;
      }
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
  // Agendar pelo editor = o mesmo comando da agenda (schedule-piece): prontidão + pacote imutável.
  // Peça ainda não aprovada: aprovar o que está na tela faz parte de agendar daqui (o produtor está
  // vendo a peça). Limpar a data retira da agenda.
  async function handleSchedule(value: string) {
    if (!post) return;
    if (isPublishedHistory(post)) { toast.info(PUBLISHED_HISTORY_MSG); return; }
    try {
      if (!value) {
        if (post.status !== 'scheduled' && !post.scheduled_date) return;
        await unschedule(post.id);
        await refreshOne(post.id);
        toast.success('Removido da agenda — a peça continua aprovada.');
        return;
      }
      const iso = localInputToIso(value);
      if (!iso || new Date(iso).getTime() < Date.now()) { toast.error('Não dá pra agendar no passado.'); return; }
      try { await flushPending(); } catch (e) { toast.error(`Agendamento não feito. ${userMessage(e)}`); return; }
      let current = post;
      if (post.format !== ('video' as typeof post.format)) {
        const url = await exportImage();
        if (!url) return; // exportImage já avisou (fundo pendente ou canvas não pronto)
        if (!['approved', 'scheduled'].includes(post.status)) current = await approvePieceOnServer(post.id, url);
      } else if (!['approved', 'scheduled'].includes(post.status)) {
        current = await approvePieceOnServer(post.id, null);
      }
      const r = await scheduleAt(current, iso);
      await refreshOne(post.id);
      toast.success(r.intent === 'reschedule' ? `Data atualizada para ${formatInZone(iso)}. O conteúdo programado permanece o mesmo.` : `Programado para ${formatInZone(iso)}. Esta é a versão que será publicada.`,
        { action: { label: 'Ver na agenda', onClick: () => navigate(`/agenda?focus=${post.id}`) } });
    } catch (e) {
      toast.error(userMessage(e, 'Não foi possível agendar.'));
    }
  }

  const isDirty = textDirty || canvasDirty;
  const platformLabel = post.platform === 'instagram' ? 'Instagram' : 'LinkedIn';
  const isAlreadyPublished = !!post.published_url;

  // Foto do Marcos gerada pelo motor fotográfico (M02): id da geração pra revisão.
  const photoGenId = ((post?.visual_decision as { asset?: { photo_generation_id?: string } } | null)?.asset?.photo_generation_id) ?? null;

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
            onBlur={() => { if (textDirty) void saveText().catch(warnSave); }}
            placeholder="Titulo do post"
            className="h-8 max-w-md border-transparent bg-transparent text-base font-semibold focus-visible:border-input"
          />
        </div>
        <div className="flex items-center gap-2">
          <PlatformBadge platform={post.platform} />
          <StatusBadge status={post.status} />
          <Select value={post.status} onValueChange={(v) => void setStatus(v as PostStatus)} disabled={isPublishedHistory(post)}>
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
            <Button variant="outline" size="sm" onClick={() => void runHive()} disabled={hiveBusy} title="Re-renderizar a imagem no MESMO template (mantém variante, texto e destaque). Se o post ainda não tem decisão, a Hive decide.">
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
              title={post.status === 'scheduled' ? 'Aprovar a peça como está — continua agendada na mesma data' : 'Peça aprovada · sem data: prepara a imagem final e deixa a peça pronta para agendar'}
            >
              {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PauseCircle className="h-4 w-4" />}
              {post.status === 'scheduled' ? 'Aprovar' : 'Aprovar · Stand-by'}
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
      {bgGatePending(post) && !photoGenId && (
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

      {/* Foto do Marcos (motor fotográfico): revisão lado a lado com as referências. */}
      {bgGatePending(post) && photoGenId && (
        <div className="border-b border-amber-500/40 bg-amber-500/5 px-6 py-3">
          <p className="mb-2 text-xs font-semibold text-amber-700 dark:text-amber-400">Foto do Marcos gerada por IA — toda imagem gerada precisa da sua aprovação antes de publicar.</p>
          <MarcosPhotoReview key={photoGenId} generationId={photoGenId} busy={bgBusy} onApprove={approveBg} onRegenerate={(note) => regenerateBg(note)} />
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
              key={`${post.id}:${canvasKey}`}
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
                // Conta os objetos do canvas AO VIVO (pareado com o dataUrl) —
                // guarda anti-branco no exportImage.
                liveObjsRef.current = (fj as { objects?: unknown[] }).objects?.length ?? 0;
                // Ignora as mudanças da hidratação inicial (~primeiros 2s): não
                // são edição manual do humano. Sem isso, só abrir o editor já
                // contava como edição e o contador nascia > 0.
                if (Date.now() - canvasLoadedAt.current > 2000) setCanvasDirty(true);
              }}
            />
          )}
        </div>

        <aside className="flex flex-col gap-3 overflow-y-auto">
          {/* Coach focado neste post: ancora as lições no que a IA gerou (variação
              pristina; sem ela, no texto atual) e reescreve o texto da peça. */}
          {post.format !== ('video' as typeof post.format) && (!!variation || !!post.caption || !!post.carousel_text?.quote) && (
            <PostCoach
              focus={{
                quote: variation?.quote ?? (post.carousel_text?.quote as string | undefined) ?? title,
                caption: variation?.caption ?? post.caption ?? '',
                editorial_slug: (post.metadata as { editorial_slug?: string })?.editorial_slug ?? null,
                platform: post.platform,
                target_avatar: (post.metadata as { target_avatar?: string })?.target_avatar ?? null,
              }}
              current={{ id: post.id, quote: (post.carousel_text?.quote as string | undefined) ?? title, caption }}
              onApply={applyHiveText}
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
                  onBlur={() => { if (textDirty) void saveText().catch(warnSave); }}
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
                  onBlur={() => { if (textDirty) void saveText().catch(warnSave); }}
                  className="text-xs leading-relaxed"
                />
                <p className="text-[10px] text-muted-foreground">{caption.length} chars</p>
              </div>

              {readiness && !readiness.ready && !isPublishedHistory(post) && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-[11px]" data-testid="readiness-missing">
                  <p className="font-semibold">Para agendar falta:</p>
                  <ul className="ml-4 list-disc">{readiness.missing.map((m, i) => <li key={i}>{m.reason}</li>)}</ul>
                </div>
              )}
              <div className="space-y-2 pt-2 border-t border-border">
                <Label htmlFor="sched">Data de publicação (opcional)</Label>
                <Input
                  id="sched"
                  type="datetime-local"
                  min={nowLocalInput()}
                  value={isoToLocalInput(post.scheduled_date)}
                  onChange={(e) => void handleSchedule(e.target.value)}
                  disabled={isPublishedHistory(post)}
                  className="text-xs"
                />
                <p className="text-[10px] text-muted-foreground">
                  {post.scheduled_date
                    ? `Publicação: ${formatInZone(post.scheduled_date)} (${scheduleTimeZone().replace('_', ' ')})`
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
