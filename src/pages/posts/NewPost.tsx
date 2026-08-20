// Fluxo de criação de conteúdo (Wizard).
// FORMAT: Imagem ou Vídeo.
//   Imagem → escolhe QUANTIDADE (3–5) → gera N posts INDEPENDENTES de uma vez
//            (cada um com código único + nota de viralização) → fila de revisão →
//            revisa cada post aprovando/rejeitando TÍTULO e LEGENDA separados →
//            preview da imagem → Agendar ou Stand-by.
//   Vídeo → sub-seletor: Vídeo pronto | Cortes (em breve) | Roteiro.
//     Vídeo pronto → upload+transcrição → gera SÓ a legenda → preview travado → agendar.
//     Roteiro → gera um roteiro → preview travado → salva rascunho no Kanban.
// Todos os fluxos compartilham o mesmo motor de Aprovar/Corrigir/Rejeitar +
// learn-from-feedback + regeneração.

import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Check, Edit3, FileText, Film, Image as ImageIcon,
  Layers, Loader2, MessageCircle, PauseCircle, RefreshCw, Scissors, Sparkles, TrendingUp,
  UploadCloud, Video, Wand2, X, Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { usePostStore } from '@/store/postStore';
import { useAuthStore } from '@/store/authStore';
import { beeApi, aiApi, postApi } from '@/lib/api';
import { isTextPending } from '@/lib/postReview';
import { edge } from '@/lib/edge';
import { renderBeeQuote } from '@/lib/templates/resolve';
import { renderFabricToDataUrl } from '@/lib/templates/renderPost';
import { getLayoutDimensions, type BeeQuoteSize } from '@/lib/templates/beeQuote';
import { uploadAssetImage, uploadVideo } from '@/lib/storage';
import { composeItemSlide, clearItemDecision } from '@/lib/hive/batchCompose';
import { toast } from 'sonner';
import { v4 as uuid } from 'uuid';
import { StaticCanvasPreview } from '@/components/posts/wizard/StaticCanvasPreview';
import { ScheduleModal } from '@/components/posts/wizard/ScheduleModal';
import { FeedbackDialog, FeedbackActionType } from '@/components/posts/wizard/FeedbackDialog';
import { AiEditDialog } from '@/components/posts/wizard/AiEditDialog';
import { SnippetRegenDialog } from '@/components/posts/wizard/SnippetRegenDialog';
import { PostChatPanel } from '@/components/posts/wizard/PostChatPanel';
import type { AiVariation, BeeEditorial, BeeAvatar, Platform, PostContent, TargetAvatar, UserPost, QaResult } from '@/types';

type WizardState =
  | 'FORMAT' | 'BATCH_CONFIG'
  | 'VIDEO_FORMAT' | 'VIDEO_UPLOAD'
  | 'GENERATING'
  | 'REVIEW_QUEUE' | 'REVIEW_ONE'   // fluxo imagem em lote
  | 'TEXT_PREVIEW'                   // fluxo vídeo pronto / roteiro (item único)
  | 'IMAGE_PREVIEW';                // design de um post de imagem aprovado

type WizardFlow = 'image' | 'video_ready' | 'roteiro';
type FieldStatus = 'pending' | 'approved' | 'rejected';

const MAX_VIDEO_MB = 200;
const BATCH_MIN = 1;
const BATCH_MAX = 5;
const BATCH_DEFAULT = 3;
// Autochecagem interna: abaixo disso o post é regenerado (invisível ao usuário).
const QA_PASS = 70;
const QA_MAX_RETRIES = 1;   // 1 nova tentativa (2 gerações no total, no pior caso)
const PLATFORMS: Platform[] = ['linkedin', 'instagram'];

// Um post de imagem dentro do lote gerado. Cada um é independente e revisado
// individualmente (título e legenda separados).
interface BatchItem {
  post: UserPost;
  variation: AiVariation;        // texto PRISTINO (baseline da medição)
  fabricJson: object;
  templateId?: string;
  quote: string;                 // título atual (pode mudar ao rejeitar)
  caption: string;               // legenda atual
  hiveDecision?: Record<string, unknown>;  // decisão do motor visual (variante/scores/reasons)
  score: number | null;
  reason: string | null;
  codigo: string;
  sizeId: BeeQuoteSize;
  pick: { editorialSlug: string; platform: Platform; targetAvatar: TargetAvatar };
  tituloStatus: FieldStatus;
  legendaStatus: FieldStatus;
  editRounds: number;            // quantas correções a IA precisou
  aiQuote: string;               // última frase gerada pela IA (baseline da medição)
  aiCaption: string;             // última legenda gerada pela IA (baseline da medição)
  manualEdits: number;           // quantas vezes o humano editou texto à mão
  qa?: QaResult | null;          // autochecagem interna (não exibida; guia a regeneração)
}

function isSameDay(iso: string, ref: Date): boolean {
  const d = new Date(iso);
  return d.getFullYear() === ref.getFullYear()
    && d.getMonth() === ref.getMonth()
    && d.getDate() === ref.getDate();
}

// BEE-DDMMAA-G{global}-D{dia}
// G{global} já é um número sequencial ÚNICO por post — é o identificador do post,
// não uma "versão". (Removido o antigo -V{lote}: dava a impressão errada de que
// cada post era a versão N de um mesmo post. Cada post é único e independente.)
function buildCodigo(date: Date, global: number, day: number): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yy = String(date.getFullYear()).slice(-2);
  return `BEE-${dd}${mm}${yy}-G${global}-D${day}`;
}

// Barra de potencial de viralização (verde ≥70 / amarelo ≥40 / vermelho).
function ViralityBar({ score, reason }: { score?: number | null; reason?: string | null }) {
  if (score == null) return null;
  const color = score >= 70 ? 'bg-emerald-500' : score >= 40 ? 'bg-amber-500' : 'bg-rose-500';
  const label = score >= 70 ? 'Alto' : score >= 40 ? 'Médio' : 'Baixo';
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1 text-muted-foreground">
          <TrendingUp className="h-3.5 w-3.5" /> Potencial de viralização
        </span>
        <span className="font-semibold">{score}/100 · {label}</span>
      </div>
      <div className="h-2 rounded-full bg-secondary overflow-hidden">
        <div className={cn('h-full transition-all', color)} style={{ width: `${score}%` }} />
      </div>
      {reason && <p className="text-[11px] text-muted-foreground italic">"{reason}"</p>}
    </div>
  );
}

function StatusPill({ status }: { status: FieldStatus }) {
  if (status === 'approved') {
    return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600"><Check className="h-3 w-3 mr-1" />Aprovado</Badge>;
  }
  if (status === 'rejected') {
    return <Badge variant="destructive"><X className="h-3 w-3 mr-1" />Rejeitado</Badge>;
  }
  return <Badge variant="outline">Pendente</Badge>;
}

export function NewPost() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { create, posts, load: loadPosts } = usePostStore();
  const currentUser = useAuthStore((s) => s.currentUser);
  // Retomada: /posts/novo?retomar=1[&post=<id>] reconstrói a fila de aprovação
  // de textos dos posts que ficaram pendentes (rodado uma vez, no mount).
  const resumeStarted = useRef(false);

  const [state, setState] = useState<WizardState>('FORMAT');
  const [flow, setFlow] = useState<WizardFlow>('image');
  const [genLabel, setGenLabel] = useState('Deixe a mágica acontecer...');
  const [genProgress, setGenProgress] = useState(0); // 0-100, barra de progresso do lote

  // Dados Mestre (para Auto-seleção)
  const [editorials, setEditorials] = useState<BeeEditorial[]>([]);
  const [avatars, setAvatars] = useState<BeeAvatar[]>([]);

  // --- Fluxo IMAGEM (lote) ---
  const [batchQuantity, setBatchQuantity] = useState(BATCH_DEFAULT);
  // Seleção manual (opcional). Vazio = a IA escolhe e varia sozinha.
  const [selPlatforms, setSelPlatforms] = useState<Platform[]>([]);
  const [selEditorials, setSelEditorials] = useState<string[]>([]);
  const [batch, setBatch] = useState<BatchItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [correctingField, setCorrectingField] = useState<'titulo' | 'legenda' | null>(null);
  const [correctingMode, setCorrectingMode] = useState<'corrigir' | 'rejeitar'>('rejeitar');
  // Rejeição do post inteiro (título + legenda) via diálogo de motivo.
  const [correctingWhole, setCorrectingWhole] = useState(false);
  // Limites de seleção dependem da quantidade: até min(2, qty) plataformas e até qty editorias.
  const maxPlatforms = Math.min(PLATFORMS.length, batchQuantity);
  const maxEditorials = batchQuantity;
  // Ao reduzir a quantidade, apara seleções que passaram do novo limite.
  useEffect(() => {
    setSelPlatforms((p) => p.slice(0, Math.min(PLATFORMS.length, batchQuantity)));
    setSelEditorials((e) => e.slice(0, batchQuantity));
  }, [batchQuantity]);
  const [editingQuote, setEditingQuote] = useState(false);
  const [quoteDraft, setQuoteDraft] = useState('');
  const [savingQuote, setSavingQuote] = useState(false);
  const [editingCaption, setEditingCaption] = useState(false);
  const [captionDraft, setCaptionDraft] = useState('');
  const [savingCaption, setSavingCaption] = useState(false);
  // Editar com IA: qual campo está no modal de refino iterativo (+ se aplicando).
  const [aiEditField, setAiEditField] = useState<'titulo' | 'legenda' | null>(null);
  const [aiEditBusy, setAiEditBusy] = useState(false);
  // Regenerar trecho: seleção capturada no título OU na legenda + opções geradas.
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const captionRef = useRef<HTMLTextAreaElement>(null);
  const [snippetSel, setSnippetSel] = useState<{ field: 'titulo' | 'legenda'; start: number; end: number; text: string } | null>(null);
  const [snippetOpen, setSnippetOpen] = useState(false);
  const [snippetBusy, setSnippetBusy] = useState(false);
  const [snippetOptions, setSnippetOptions] = useState<string[]>([]);
  // Chat de brainstorm lateral (vê o post e aplica sugestões).
  const [chatOpen, setChatOpen] = useState(false);
  // Fecha as edições (manual e IA) ao trocar de post ou voltar pra fila.
  useEffect(() => {
    setEditingQuote(false); setEditingCaption(false); setAiEditField(null);
    setSnippetOpen(false); setSnippetSel(null); setSnippetOptions([]);
    setChatOpen(false);
  }, [activeId]);
  const [imageScheduleId, setImageScheduleId] = useState<string | null>(null);

  // --- Fluxo VÍDEO PRONTO / ROTEIRO (item único) ---
  const [draftPost, setDraftPost] = useState<UserPost | null>(null);
  const [videoCaption, setVideoCaption] = useState('');
  const [scriptTitulo, setScriptTitulo] = useState('');
  const [scriptRoteiro, setScriptRoteiro] = useState('');

  // Estado do vídeo enviado (persistido entre regenerações — não reenvia)
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [transcript, setTranscript] = useState('');
  const [visualSummary, setVisualSummary] = useState('');
  const [videoContentType, setVideoContentType] = useState('');
  const [uploadPct, setUploadPct] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modais
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackAction, setFeedbackAction] = useState<FeedbackActionType>('correct');
  const [scheduleOpen, setScheduleOpen] = useState(false);

  useEffect(() => {
    void loadPosts();
    void beeApi.editorials().then(setEditorials).catch(console.error);
    void beeApi.avatars().then(setAvatars).catch(console.error);
  }, [loadPosts]);

  // Retomada da aprovação de textos: reconstrói a fila a partir do banco.
  useEffect(() => {
    if (searchParams.get('retomar') !== '1' || resumeStarted.current) return;
    resumeStarted.current = true;
    void resumeTextReview(searchParams.get('post'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const activeItem = batch.find((it) => it.post.id === activeId) ?? null;

  // Prévia = HIVE: pro item ativo (posts de imagem), compõe a peça real da Hive
  // (decide 1x por post, cacheado; re-compõe local quando a frase muda) e
  // sobrescreve o fabricJson, pra o review já mostrar o resultado final. Se a
  // Hive falhar, mantém o template clássico que já estava no item.
  useEffect(() => {
    const item = activeItem;
    if (!item || flow !== 'image') return;
    let cancelled = false;
    void (async () => {
      try {
        const { fabricJson, decision } = await composeItemSlide({
          postId: item.post.id,
          text: item.quote,
          platform: item.post.platform === 'instagram' ? 'instagram' : 'linkedin',
          editorialSlug: item.pick.editorialSlug,
        });
        if (!cancelled) patchItem(item.post.id, { fabricJson, hiveDecision: decision });
      } catch (e) {
        console.error('[Hive preview] mantém template clássico', e);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeItem?.post.id, activeItem?.quote, flow]);

  // Nome legível da editoria a partir do slug (cai no próprio slug se não achar).
  function editorialName(slug: string): string {
    return editorials.find((e) => e.slug === slug)?.name ?? slug;
  }

  // Recria UM BatchItem a partir de um post salvo (tudo já persistido: texto,
  // legenda, fabric, editoria, e o status por campo em metadata).
  async function rebuildItem(p: UserPost): Promise<BatchItem> {
    const meta = (p.metadata ?? {}) as Record<string, unknown>;
    const ct = (p.carousel_text ?? {}) as PostContent;
    const quote = (ct.quote as string) ?? '';
    const caption = p.caption ?? (ct.caption as string) ?? '';
    const sizeId = (meta.canvas_size as BeeQuoteSize) ?? (p.platform === 'instagram' ? 'square' : 'portrait');
    const variation = await aiApi.variationForPost(p.id).catch(() => null);
    const fabricJson = (p.carousel_fabric_json?.[0] ?? {}) as object;
    // Baseline da medição: a variação pristina se existir; senão o texto atual.
    const baseline: AiVariation = variation ?? {
      id: '', generation_id: (meta.batch_id as string) ?? '', user_id: p.user_id,
      idx: (meta.variation_idx as number) ?? 1, quote, caption,
      headline_type: (ct.headline_type as string) ?? null,
      analogy: (ct.analogy as string) ?? null,
      virality_score: p.virality_score ?? null, virality_reason: p.virality_reason ?? null,
      post_id: p.id, created_at: p.created_at,
    };
    return {
      post: p, variation: baseline, fabricJson, templateId: p.template_id ?? undefined,
      quote, caption, score: p.virality_score ?? null, reason: p.virality_reason ?? null,
      codigo: p.codigo ?? '', sizeId,
      pick: {
        editorialSlug: (meta.editorial_slug as string) ?? '',
        platform: p.platform,
        targetAvatar: (meta.target_avatar as TargetAvatar) ?? 'ambos',
      },
      tituloStatus: (meta.titulo_status as FieldStatus) ?? 'pending',
      legendaStatus: (meta.legenda_status as FieldStatus) ?? 'pending',
      editRounds: p.ai_edit_rounds ?? 0,
      aiQuote: variation?.quote ?? quote,
      aiCaption: variation?.caption ?? caption,
      manualEdits: p.manual_edits ?? 0,
      qa: null,
    };
  }

  // Retoma a aprovação de textos: busca os posts de imagem com texto pendente e
  // remonta a fila. focusId opcional cai direto na revisão daquele post.
  async function resumeTextReview(focusId: string | null) {
    setFlow('image');
    setState('GENERATING');
    setGenProgress(15);
    setGenLabel('Recuperando seus posts pendentes de aprovação...');
    try {
      const all = await postApi.list();
      const pending = all.filter(isTextPending);
      if (!pending.length) {
        toast.info('Nenhum post pendente de aprovação de texto.');
        navigate('/');
        return;
      }
      const items = await Promise.all(pending.map(rebuildItem));
      setGenProgress(100);
      setBatch(items);
      const focus = focusId && items.find((it) => it.post.id === focusId);
      if (focus) {
        setActiveId(focus.post.id);
        setState('REVIEW_ONE');
      } else {
        setActiveId(null);
        setState('REVIEW_QUEUE');
      }
    } catch (e) {
      console.error(e);
      toast.error('Erro ao recuperar os posts pendentes.');
      navigate('/');
    }
  }

  function patchItem(id: string, patch: Partial<BatchItem>) {
    setBatch((prev) => prev.map((it) => (it.post.id === id ? { ...it, ...patch } : it)));
  }

  // Persiste o ESTÁGIO de revisão no metadata do post (status por campo +
  // review_stage), pra poder RETOMAR a aprovação de textos depois de sair.
  // Fire-and-forget: mescla no metadata atual e atualiza o item em memória.
  function persistReview(item: BatchItem, meta: Record<string, unknown>) {
    const nextMeta = { ...(item.post.metadata ?? {}), ...meta };
    patchItem(item.post.id, { post: { ...item.post, metadata: nextMeta } });
    void postApi.update(item.post.id, { metadata: nextMeta }).catch((e) => console.error('[persistReview]', e));
  }

  // Monta o carousel_text a partir dos valores ATUAIS do item (não do post
  // original em memória, que pode estar defasado após uma regeneração).
  function itemCarouselText(item: BatchItem, overrides: Record<string, unknown>) {
    return {
      quote: item.quote,
      caption: item.caption,
      headline_type: item.variation.headline_type,
      analogy: item.variation.analogy,
      virality_score: item.score,
      virality_reason: item.reason,
      ...overrides,
    };
  }

  // --- LÓGICA DE AUTO-SELEÇÃO (compartilhada por todos os fluxos) ---
  function editorialWeight(e: BeeEditorial): number {
    const h = (e.frequency_hint ?? '').toLowerCase();
    if (h.includes('semana')) return 4;
    if (h.includes('pelo menos') || h.includes('1-2')) return 3;
    return 1;
  }

  function weightedPick<T>(items: T[], weight: (x: T) => number): T {
    const total = items.reduce((s, x) => s + Math.max(0.1, weight(x)), 0);
    let r = Math.random() * total;
    for (const x of items) {
      r -= Math.max(0.1, weight(x));
      if (r <= 0) return x;
    }
    return items[items.length - 1];
  }

  function autoChoose() {
    const recent = [...posts].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    const lastEditorial = recent.map((p) => p.metadata?.editorial_slug as string | undefined).find(Boolean);
    const lastPlatform = recent.map((p) => p.platform).find(Boolean);

    let pool = editorials.filter((e) => e.slug !== lastEditorial);
    if (pool.length === 0) pool = editorials;
    const editorial = weightedPick(pool, editorialWeight);

    const platform: Platform = lastPlatform === 'linkedin' ? 'instagram' : 'linkedin';

    const avatarPool: TargetAvatar[] = ['ambos', 'ambos', 'ambos', ...(avatars.map((a) => a.slug as TargetAvatar))];
    const targetAvatar = avatarPool[Math.floor(Math.random() * avatarPool.length)];

    return { editorial, platform, targetAvatar };
  }

  function resetDraft() {
    setDraftPost(null);
    setVideoCaption('');
    setScriptTitulo('');
    setScriptRoteiro('');
  }

  // ==========================================================================
  // FLUXO IMAGEM — geração em LOTE (3–5 posts independentes)
  // ==========================================================================
  // Monta as escolhas (editoria/plataforma/avatar) de cada post do lote.
  // Respeita a seleção manual (rotacionando quando há menos itens que posts);
  // sem seleção, a IA varia sozinha (plataforma alternada, editoria sem repetir).
  function buildPicks(quantity: number) {
    const picks: { editorial: BeeEditorial; platform: Platform; targetAvatar: TargetAvatar }[] = [];
    const avatarPool: TargetAvatar[] = ['ambos', 'ambos', 'ambos', ...avatars.map((a) => a.slug as TargetAvatar)];
    // ponto de partida da alternância automática: o oposto da última plataforma usada
    const lastPlatform = [...posts]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .map((p) => p.platform).find(Boolean);
    let autoPlat: Platform = lastPlatform === 'linkedin' ? 'instagram' : 'linkedin';
    let lastEdi: string | null = null;

    for (let i = 0; i < quantity; i++) {
      // plataforma
      let platform: Platform;
      if (selPlatforms.length) {
        platform = selPlatforms[i % selPlatforms.length];
      } else {
        platform = autoPlat;
        autoPlat = autoPlat === 'linkedin' ? 'instagram' : 'linkedin';
      }
      // editoria
      let editorial: BeeEditorial;
      if (selEditorials.length) {
        const slug = selEditorials[i % selEditorials.length];
        editorial = editorials.find((e) => e.slug === slug) ?? editorials[0];
      } else {
        let pool = editorials.filter((e) => e.slug !== lastEdi);
        if (!pool.length) pool = editorials;
        editorial = weightedPick(pool, editorialWeight);
        lastEdi = editorial.slug;
      }
      const targetAvatar = avatarPool[Math.floor(Math.random() * avatarPool.length)];
      picks.push({ editorial, platform, targetAvatar });
    }
    return picks;
  }

  // Gera UM post (título + legenda) e roda a autochecagem INTERNA. Se reprovar
  // (nota < QA_PASS), regenera até QA_MAX_RETRIES vezes usando o que falhou como
  // briefing, e devolve a melhor versão. Invisível ao usuário.
  async function generateOneWithQa(
    pick: { editorial: BeeEditorial; platform: Platform; targetAvatar: TargetAvatar },
    idx: number,
    quantity: number,
  ) {
    type Cand = { v: any; qa: QaResult | null; qaScore: number };
    let best: Cand | null = null;
    let briefing: string | undefined;

    for (let attempt = 0; attempt <= QA_MAX_RETRIES; attempt++) {
      const pctBase = ((idx + (attempt === 0 ? 0.15 : 0.5)) / quantity) * 100;
      setGenProgress(Math.round(pctBase));
      setGenLabel(attempt === 0
        ? `Escrevendo o post ${idx + 1} de ${quantity} — ${pick.editorial.name} · ${pick.platform}...`
        : `Refinando o post ${idx + 1} para bater a régua de qualidade...`);

      const res = await edge.generateContent({
        editorial_slug: pick.editorial.slug,
        target_avatar: pick.targetAvatar,
        target_platform: pick.platform === 'instagram' ? 'instagram' : 'linkedin',
        quote_max_chars: 200,
        variations: 1,
        briefing,
      });
      const v = res.variations?.[0] ?? res;

      setGenLabel(`Checando a qualidade do post ${idx + 1}...`);
      let qa: QaResult | null = null;
      try {
        const q = await edge.qaCheck({
          quote: v.quote, caption: v.caption,
          target_platform: pick.platform === 'instagram' ? 'instagram' : 'linkedin',
          editorial_slug: pick.editorial.slug,
        });
        qa = { score: q.score ?? 100, checks: q.checks, resumo: q.resumo };
      } catch {
        qa = null; // sem QA disponível: não trava o fluxo
      }
      const qaScore = qa?.score ?? 100; // sem critérios cadastrados => passa
      const cand: Cand = { v, qa, qaScore };
      if (!best || qaScore > best.qaScore) best = cand;
      if (qaScore >= QA_PASS) break;

      const failed = (qa?.checks ?? []).filter((c) => !c.passed);
      briefing = failed.length
        ? `A versão anterior falhou nestes critérios de qualidade — corrija especificamente: ${failed.map((f) => `${f.titulo}: ${f.nota}`).join(' | ')}`
        : 'Aumente a qualidade, a força do gancho e a densidade do texto.';
    }

    const v = best!.v;
    return {
      quote: v.quote as string,
      caption: v.caption as string,
      headline_type: v.headline_type_used as string | undefined,
      analogy: v.analogy_used as string | undefined,
      score: (v.virality_score ?? null) as number | null,
      reason: (v.virality_reason ?? null) as string | null,
      qa: best!.qa,
    };
  }

  async function handleStartImageBatch() {
    if (editorials.length === 0) {
      toast.error('Carregando conhecimentos... aguarde 1 segundo.');
      return;
    }
    const quantity = batchQuantity;
    setFlow('image');
    setState('GENERATING');
    setGenProgress(2);
    setGenLabel('Preparando o lote...');
    try {
      const picks = buildPicks(quantity);
      const now = new Date();
      const baseGlobal = posts.length;
      const baseDay = posts.filter((p) => isSameDay(p.created_at, now)).length;

      const items: BatchItem[] = [];
      for (let i = 0; i < quantity; i++) {
        const pick = picks[i];
        const sizeId: BeeQuoteSize = pick.platform === 'instagram' ? 'square' : 'portrait';

        // gera + autochecagem interna (pode regenerar)
        const fresh = await generateOneWithQa(pick, i, quantity);

        setGenLabel(`Montando o post ${i + 1} de ${quantity}...`);
        setGenProgress(Math.round(((i + 0.85) / quantity) * 100));

        const generation = await aiApi.createGeneration({
          editorial_slug: pick.editorial.slug,
          target_avatar: pick.targetAvatar,
          platform: pick.platform,
          variations_count: 1,
        });
        const [row] = await aiApi.createVariations(generation.id, [{
          idx: 1,
          quote: fresh.quote,
          caption: fresh.caption,
          headline_type: fresh.headline_type,
          analogy: fresh.analogy,
          virality_score: fresh.score,
          virality_reason: fresh.reason,
        }]);

        const codigo = buildCodigo(now, baseGlobal + i + 1, baseDay + i + 1);
        const { fabricJson, templateId } = await renderBeeQuote(sizeId, fresh.quote);

        const post = await create({
          template_id: templateId,
          title: pick.editorial.name,
          platform: pick.platform,
          format: 'image',
          status: 'pending_approval',
          codigo,
          virality_score: fresh.score,
          virality_reason: fresh.reason,
          caption: fresh.caption,
          carousel_text: {
            quote: fresh.quote,
            caption: fresh.caption,
            headline_type: fresh.headline_type,
            analogy: fresh.analogy,
            virality_score: fresh.score,
            virality_reason: fresh.reason,
          },
          carousel_fabric_json: [fabricJson],
          metadata: {
            canvas_size: sizeId,
            editorial_slug: pick.editorial.slug,
            target_avatar: pick.targetAvatar,
            variation_idx: 1,
            batch_id: generation.id,
            auto_generated: true,
            qa_score: fresh.qa?.score ?? null,
            // Estágio do wizard — permite retomar a aprovação de textos depois.
            review_stage: 'texto',
            titulo_status: 'pending',
            legenda_status: 'pending',
          },
        });

        await aiApi.linkVariationToPost(row.id, post.id);

        items.push({
          post, variation: row, fabricJson, templateId,
          quote: fresh.quote, caption: fresh.caption, score: fresh.score, reason: fresh.reason, codigo, sizeId,
          pick: { editorialSlug: pick.editorial.slug, platform: pick.platform, targetAvatar: pick.targetAvatar },
          tituloStatus: 'pending', legendaStatus: 'pending', editRounds: 0,
          aiQuote: fresh.quote, aiCaption: fresh.caption, manualEdits: 0, qa: fresh.qa,
        });
      }

      setGenProgress(100);
      setBatch(items);
      setActiveId(null);
      setState('REVIEW_QUEUE');
    } catch (e) {
      console.error(e);
      toast.error('Erro ao gerar os posts. Tente novamente.');
      setState('FORMAT');
    }
  }

  // Aprova/Rejeita um campo (título=quote ou legenda=caption) do post ativo.
  function approveField(field: 'titulo' | 'legenda') {
    if (!activeItem) return;
    patchItem(activeItem.post.id, field === 'titulo' ? { tituloStatus: 'approved' } : { legendaStatus: 'approved' });
    persistReview(activeItem, field === 'titulo' ? { titulo_status: 'approved' } : { legenda_status: 'approved' });
  }

  // Abre o feedback pra IA regenerar um campo. mode 'corrigir' APROVEITA o texto
  // atual (refina mantendo a essência); 'rejeitar' cria do zero (nova ideia).
  // O título usa os dois; a legenda usa só 'rejeitar'.
  function openFieldFeedback(field: 'titulo' | 'legenda', mode: 'corrigir' | 'rejeitar') {
    if (!activeItem) return;
    if (mode === 'rejeitar') {
      patchItem(activeItem.post.id, field === 'titulo' ? { tituloStatus: 'rejected' } : { legendaStatus: 'rejected' });
    }
    setCorrectingWhole(false);
    setCorrectingField(field);
    setCorrectingMode(mode);
    setFeedbackAction('correct');
    setFeedbackOpen(true);
  }

  // Rejeição do POST INTEIRO: pergunta o motivo e regenera título + legenda juntos.
  function openWholeFeedback() {
    if (!activeItem) return;
    setCorrectingField(null);
    setCorrectingWhole(true);
    setFeedbackAction('discard'); // título do diálogo: "Motivo da rejeição total"
    setFeedbackOpen(true);
  }

  // Edição manual da frase (título): re-renderiza a imagem, persiste e conta como
  // edição manual — a medição registra que o humano reescreveu à mão.
  async function saveManualQuote(item: BatchItem) {
    const txt = quoteDraft.trim();
    if (!txt || txt === item.quote) { setEditingQuote(false); return; }
    setSavingQuote(true);
    try {
      const { fabricJson, templateId } = await renderBeeQuote(item.sizeId, txt);
      await postApi.update(item.post.id, {
        carousel_text: itemCarouselText(item, { quote: txt }),
        carousel_fabric_json: [fabricJson],
      });
      patchItem(item.post.id, {
        quote: txt, fabricJson, templateId,
        manualEdits: item.manualEdits + 1,
        tituloStatus: 'pending',
      });
      persistReview(item, { titulo_status: 'pending' });
      setEditingQuote(false);
      toast.success('Frase editada à mão. Aprove quando estiver bom.');
    } catch (e) {
      console.error(e);
      toast.error(`Erro ao salvar a frase: ${(e as Error).message.slice(0, 140)}`);
    } finally {
      setSavingQuote(false);
    }
  }

  // Edição manual da legenda: persiste e conta como edição manual.
  async function saveManualCaption(item: BatchItem) {
    const txt = captionDraft.trim();
    if (!txt || txt === item.caption) { setEditingCaption(false); return; }
    setSavingCaption(true);
    try {
      await postApi.update(item.post.id, {
        caption: txt,
        carousel_text: itemCarouselText(item, { caption: txt }),
      });
      patchItem(item.post.id, {
        caption: txt,
        manualEdits: item.manualEdits + 1,
        legendaStatus: 'pending',
      });
      persistReview(item, { legenda_status: 'pending' });
      setEditingCaption(false);
      toast.success('Legenda editada à mão. Aprove quando estiver bom.');
    } catch (e) {
      console.error(e);
      toast.error(`Erro ao salvar a legenda: ${(e as Error).message.slice(0, 140)}`);
    } finally {
      setSavingCaption(false);
    }
  }

  // Aplica um texto JÁ PRONTO num campo (usado pelo chat de brainstorm ao clicar
  // "Aplicar"). Re-renderiza a imagem se for título; volta o campo pra pendente.
  async function commitFieldText(item: BatchItem, field: 'titulo' | 'legenda', text: string) {
    const novo = text.trim();
    if (!novo) return;
    if (field === 'titulo') {
      const { fabricJson, templateId } = await renderBeeQuote(item.sizeId, novo);
      await postApi.update(item.post.id, {
        carousel_text: itemCarouselText(item, { quote: novo }),
        carousel_fabric_json: [fabricJson],
      });
      patchItem(item.post.id, {
        quote: novo, aiQuote: novo, fabricJson, templateId,
        editRounds: item.editRounds + 1, tituloStatus: 'pending',
      });
      persistReview(item, { titulo_status: 'pending' });
    } else {
      await postApi.update(item.post.id, {
        caption: novo,
        carousel_text: itemCarouselText(item, { caption: novo }),
      });
      patchItem(item.post.id, {
        caption: novo, aiCaption: novo,
        editRounds: item.editRounds + 1, legendaStatus: 'pending',
      });
      persistReview(item, { legenda_status: 'pending' });
    }
  }

  // Editar com IA: ajuste CIRÚRGICO do campo aberto no modal. A IA muda só o que
  // foi pedido e preserva o resto (não é regeneração do zero, não aprende lição).
  // Fica no modal — o texto atualiza ao vivo pra você refinar de novo se quiser.
  async function applyAiEdit(instruction: string) {
    if (!activeItem || !aiEditField) return;
    const item = activeItem;
    const field = aiEditField;
    const isTitulo = field === 'titulo';
    setAiEditBusy(true);
    try {
      const res = await edge.editText({
        field,
        text: isTitulo ? item.quote : item.caption,
        instruction,
        counterpart: isTitulo ? item.caption : item.quote,
        target_platform: item.pick.platform === 'instagram' ? 'instagram' : 'linkedin',
        editorial_slug: item.pick.editorialSlug,
        max_chars: isTitulo ? 200 : undefined,
      });
      const novo = (res.text ?? '').trim();
      if (!novo) { toast.error('A IA não retornou texto. Reformule o pedido.'); return; }

      if (isTitulo) {
        const { fabricJson, templateId } = await renderBeeQuote(item.sizeId, novo);
        await postApi.update(item.post.id, {
          carousel_text: itemCarouselText(item, { quote: novo }),
          carousel_fabric_json: [fabricJson],
        });
        patchItem(item.post.id, {
          quote: novo, aiQuote: novo, fabricJson, templateId,
          editRounds: item.editRounds + 1, tituloStatus: 'pending',
        });
        persistReview(item, { titulo_status: 'pending' });
      } else {
        await postApi.update(item.post.id, {
          caption: novo,
          carousel_text: itemCarouselText(item, { caption: novo }),
        });
        patchItem(item.post.id, {
          caption: novo, aiCaption: novo,
          editRounds: item.editRounds + 1, legendaStatus: 'pending',
        });
        persistReview(item, { legenda_status: 'pending' });
      }
      toast.success('Ajuste aplicado. Refine de novo ou aprove.');
    } catch (e) {
      console.error(e);
      toast.error('Erro ao editar com IA. Tente de novo.');
    } finally {
      setAiEditBusy(false);
    }
  }

  // Regenerar trecho: captura a seleção atual do textarea (título ou legenda) e
  // abre o modal de opções. Exige um trecho minimamente selecionado.
  function openSnippetRegen(field: 'titulo' | 'legenda') {
    const el = field === 'titulo' ? titleRef.current : captionRef.current;
    const draft = field === 'titulo' ? quoteDraft : captionDraft;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const text = draft.slice(start, end).trim();
    if (end - start < 3 || !text) {
      toast.info(field === 'titulo'
        ? 'Selecione um trecho do título primeiro.'
        : 'Selecione um trecho da legenda primeiro (uma frase, uma analogia…).');
      return;
    }
    setSnippetSel({ field, start, end, text });
    setSnippetOptions([]);
    setSnippetOpen(true);
  }

  // Pede as alternativas do trecho à IA (pode gerar de novo com outra orientação).
  async function generateSnippetOptions(instruction: string) {
    if (!snippetSel || !activeItem) return;
    const draft = snippetSel.field === 'titulo' ? quoteDraft : captionDraft;
    setSnippetBusy(true);
    try {
      const res = await edge.regenerateSnippet({
        field: snippetSel.field,
        full_text: draft,
        snippet: snippetSel.text,
        instruction,
        count: 5,
        editorial_slug: activeItem.pick.editorialSlug,
        target_platform: activeItem.pick.platform === 'instagram' ? 'instagram' : 'linkedin',
      });
      setSnippetOptions(res.options ?? []);
      if (!res.options?.length) toast.info('A IA não trouxe opções. Tente reformular a orientação.');
    } catch (e) {
      console.error(e);
      toast.error(`Erro ao gerar opções: ${(e as Error).message.slice(0, 120)}`);
    } finally {
      setSnippetBusy(false);
    }
  }

  // Substitui SÓ o trecho selecionado pela opção escolhida (no rascunho do campo
  // em edição — a pessoa ainda salva à mão depois).
  function pickSnippetOption(option: string) {
    if (!snippetSel) return;
    const draft = snippetSel.field === 'titulo' ? quoteDraft : captionDraft;
    const next = draft.slice(0, snippetSel.start) + option + draft.slice(snippetSel.end);
    if (snippetSel.field === 'titulo') setQuoteDraft(next); else setCaptionDraft(next);
    const label = snippetSel.field === 'titulo' ? 'título' : 'legenda';
    setSnippetOpen(false);
    setSnippetSel(null);
    setSnippetOptions([]);
    toast.success(`Trecho substituído. Revise e salve o ${label}.`);
  }

  // Regenera SÓ o campo rejeitado, mantendo o outro (que você já pode ter
  // aprovado). Usa uma geração fresca e troca apenas o texto daquele campo.
  async function regenerateField(
    item: BatchItem,
    field: 'titulo' | 'legenda',
    briefing: string,
    mode: 'corrigir' | 'rejeitar' = 'rejeitar',
  ) {
    setState('GENERATING');
    setGenLabel(field === 'titulo' ? 'Reescrevendo o título...' : 'Reescrevendo a legenda...');

    // "corrigir" APROVEITA o texto atual (refina mantendo a essência);
    // "rejeitar" cria um texto NOVO do zero. Em AMBOS, o campo regenerado fica
    // interligado ao OUTRO (título ↔ legenda) pra manter o mesmo assunto.
    const alvo = field === 'titulo' ? 'frase da imagem' : 'legenda';
    const atual = field === 'titulo' ? item.quote : item.caption;
    const outroLabel = field === 'titulo' ? 'legenda' : 'frase da imagem (título)';
    const outroTexto = field === 'titulo' ? item.caption : item.quote;
    const elo = `A ${outroLabel} deste post é: "${outroTexto}". A nova ${alvo} deve falar do MESMO assunto e ficar coerente com essa ${outroLabel} — não mude de tema.`;
    const effectiveBriefing = mode === 'corrigir'
      ? `Aproveite e aprimore a ${alvo} atual, mantendo a essência e o sentido dela. Texto atual: "${atual}". ${elo} Ajuste pedido: ${briefing || 'deixe mais forte, claro e afiado'}`
      : `Gere uma NOVA ${alvo} para este post, diferente da anterior (que foi rejeitada). ${elo} ${alvo === 'frase da imagem' ? 'Frase' : 'Legenda'} anterior rejeitada: "${atual}". Motivo da rejeição / o que ajustar: ${briefing || 'traga um ângulo melhor'}`;

    try {
      const res = await edge.generateContent({
        editorial_slug: item.pick.editorialSlug,
        target_avatar: item.pick.targetAvatar,
        target_platform: item.pick.platform === 'instagram' ? 'instagram' : 'linkedin',
        quote_max_chars: 200,
        variations: 1,
        briefing: effectiveBriefing || undefined,
      });
      const fresh = res.variations?.[0] ?? res;

      let patch: Partial<BatchItem> = {
        editRounds: item.editRounds + 1,
        score: fresh.virality_score ?? item.score,
        reason: fresh.virality_reason ?? item.reason,
      };

      if (field === 'titulo') {
        const { fabricJson, templateId } = await renderBeeQuote(item.sizeId, fresh.quote);
        patch = { ...patch, quote: fresh.quote, aiQuote: fresh.quote, fabricJson, templateId, tituloStatus: 'pending' };
        await postApi.update(item.post.id, {
          carousel_text: itemCarouselText(item, { quote: fresh.quote, virality_score: patch.score, virality_reason: patch.reason }),
          carousel_fabric_json: [fabricJson],
          virality_score: patch.score ?? null,
          virality_reason: patch.reason ?? null,
        });
      } else {
        patch = { ...patch, caption: fresh.caption, aiCaption: fresh.caption, legendaStatus: 'pending' };
        await postApi.update(item.post.id, {
          caption: fresh.caption,
          carousel_text: itemCarouselText(item, { caption: fresh.caption, virality_score: patch.score, virality_reason: patch.reason }),
          virality_score: patch.score ?? null,
          virality_reason: patch.reason ?? null,
        });
      }

      patchItem(item.post.id, patch);
      persistReview(item, field === 'titulo' ? { titulo_status: 'pending' } : { legenda_status: 'pending' });
      toast.success(field === 'titulo'
        ? (mode === 'corrigir' ? 'Frase corrigida (aproveitada).' : 'Frase nova gerada do zero.')
        : 'Legenda regenerada.');
    } catch (e) {
      console.error(e);
      toast.error('Erro ao regenerar. Tente de novo.');
      // Volta o campo pra pendente pra não travar preso em "rejeitado".
      patchItem(item.post.id, field === 'titulo' ? { tituloStatus: 'pending' } : { legendaStatus: 'pending' });
    } finally {
      setState('REVIEW_ONE');
    }
  }

  // Rejeita o post INTEIRO: gera um título E uma legenda completamente novos,
  // do zero, com outro ângulo. Mantém o mesmo post (não descarta), só troca o
  // conteúdo e volta os dois campos pra pendente. Reseta a autochecagem.
  async function regenerateWholePost(item: BatchItem, briefing = '') {
    clearItemDecision(item.post.id); // conteúdo novo -> a Hive re-decide a variante
    setState('GENERATING');
    setGenProgress(35);
    setGenLabel('Gerando um post totalmente novo — título e legenda do zero...');
    const effectiveBriefing = [
      'Crie um post completamente NOVO sobre o mesmo tema, do zero, com um ângulo DIFERENTE do atual —',
      'nova frase da imagem E nova legenda, coerentes entre si. Não repita a abordagem anterior.',
      `Frase anterior rejeitada (evite repetir): "${item.quote}".`,
      briefing ? `Motivo da rejeição / o que ajustar: ${briefing}` : '',
    ].filter(Boolean).join(' ').trim();
    try {
      const res = await edge.generateContent({
        editorial_slug: item.pick.editorialSlug,
        target_avatar: item.pick.targetAvatar,
        target_platform: item.pick.platform === 'instagram' ? 'instagram' : 'linkedin',
        quote_max_chars: 200,
        variations: 1,
        briefing: effectiveBriefing,
      });
      const fresh = res.variations?.[0] ?? res;
      const score = fresh.virality_score ?? item.score;
      const reason = fresh.virality_reason ?? item.reason;
      const { fabricJson, templateId } = await renderBeeQuote(item.sizeId, fresh.quote);
      await postApi.update(item.post.id, {
        caption: fresh.caption,
        carousel_text: itemCarouselText(item, { quote: fresh.quote, caption: fresh.caption, virality_score: score, virality_reason: reason }),
        carousel_fabric_json: [fabricJson],
        virality_score: score ?? null,
        virality_reason: reason ?? null,
      });
      patchItem(item.post.id, {
        quote: fresh.quote, caption: fresh.caption,
        aiQuote: fresh.quote, aiCaption: fresh.caption,
        fabricJson, templateId,
        score, reason,
        tituloStatus: 'pending', legendaStatus: 'pending',
        editRounds: item.editRounds + 1,
        qa: null,
      });
      persistReview(item, { review_stage: 'texto', titulo_status: 'pending', legenda_status: 'pending' });
      toast.success('Post novo gerado — título e legenda do zero.');
    } catch (e) {
      console.error(e);
      toast.error('Erro ao regenerar o post. Tente de novo.');
    } finally {
      setState('REVIEW_ONE');
    }
  }

  // Descarta um post do lote (apaga do banco e tira da fila).
  async function discardBatchPost(item: BatchItem) {
    try {
      await postApi.delete(item.post.id);
    } catch (e) {
      console.error(e);
    }
    const remaining = batch.filter((it) => it.post.id !== item.post.id);
    setBatch(remaining);
    toast.info('Post descartado.');
    if (remaining.length === 0) {
      navigate('/');
    } else {
      setActiveId(null);
      setState('REVIEW_QUEUE');
    }
  }

  // Finaliza um post de imagem aprovado: renderiza a imagem no Storage, grava a
  // medição (ai_reviews) + as métricas, define status (agendado ou stand-by) e
  // volta pra fila (ou encerra se era o último).
  async function finalizeImageItem(item: BatchItem, date: Date | null) {
    if (!currentUser) {
      toast.error('Sessão expirada. Faça login novamente.');
      return;
    }
    setScheduleOpen(false);
    setImageScheduleId(null);
    try {
      // item.fabricJson já é a peça da HIVE (composta no review pelo efeito de
      // prévia). Renderiza nas dimensões certas: Hive é sempre 1080x1350 (4:5,
      // serve IG e LinkedIn); se caiu no template clássico, usa as dims dele.
      const isHive = !!item.hiveDecision;
      const dims = isHive ? { width: 1080, height: 1350 } : getLayoutDimensions(item.sizeId);
      const dataUrl = await renderFabricToDataUrl(item.fabricJson, dims);
      let renderedSlides: Record<string, string> | undefined;
      if (dataUrl) {
        const { publicUrl } = await uploadAssetImage({
          userId: currentUser.id, assetId: item.post.id, dataUrl, filename: 'render.png',
        });
        renderedSlides = { slide1: publicUrl };
      }

      // Medição da eficácia. Baseline = último texto da IA (item.aiQuote); final =
      // o que vai ao ar. Se o humano editou a frase à mão (manualEdits>0), o final
      // difere do baseline → registra drift; senão, intacto. As regenerações da IA
      // contam em ai_edit_rounds; as edições manuais, em manual_edits. Mantém os
      // FKs (variation_id/generation_id) da linha real.
      void aiApi
        .recordReview({
          post_id: item.post.id,
          variation: { ...item.variation, quote: item.aiQuote, caption: item.aiCaption },
          quote_final: item.quote,
          caption_final: item.caption,
        })
        .catch(console.error);

      await postApi.update(item.post.id, {
        status: date ? 'scheduled' : 'approved',
        ai_edit_rounds: item.editRounds,
        manual_edits: item.manualEdits,
        ...(date ? { scheduled_date: date.toISOString() } : {}),
        carousel_fabric_json: [item.fabricJson],
        ...(renderedSlides ? { rendered_slides: renderedSlides } : {}),
        ...(item.hiveDecision ? { visual_decision: item.hiveDecision, image_status: 'pending' as const } : {}),
      });

      toast.success(date ? `Post agendado! (${item.codigo})` : `Post em stand-by (${item.codigo})`);

      const remaining = batch.filter((it) => it.post.id !== item.post.id);
      setBatch(remaining);
      if (remaining.length === 0) {
        navigate('/');
      } else {
        setActiveId(null);
        setState('REVIEW_QUEUE');
      }
    } catch (err) {
      console.error(err);
      toast.error(`Erro ao finalizar: ${(err as Error).message.slice(0, 120)}`);
    }
  }

  // Edição manual: persiste as métricas atuais e abre o editor completo.
  async function handleManualEditItem(item: BatchItem) {
    try {
      await postApi.update(item.post.id, { ai_edit_rounds: item.editRounds });
    } catch (e) {
      console.error(e);
    }
    navigate(`/posts/${item.post.id}`);
  }

  // ==========================================================================
  // FLUXO VÍDEO PRONTO
  // ==========================================================================
  async function handleVideoFile(f: File) {
    if (!currentUser) { toast.error('Sessão expirada. Faça login.'); return; }
    if (!f.type.startsWith('video/')) { toast.error('Selecione um arquivo de vídeo.'); return; }
    const sizeMB = f.size / 1024 / 1024;
    if (sizeMB > MAX_VIDEO_MB) { toast.error(`Limite ${MAX_VIDEO_MB}MB (atual: ${sizeMB.toFixed(0)}MB)`); return; }

    const assetId = uuid();
    setState('GENERATING');
    setUploadPct(0);
    setGenLabel('Enviando seu vídeo...');
    try {
      const { path, publicUrl } = await uploadVideo(currentUser.id, assetId, f, (pct) => setUploadPct(pct));
      setVideoPath(path);
      setVideoUrl(publicUrl);

      setGenLabel('Transcrevendo o vídeo (pode levar um minuto)...');
      const proc = await edge.processVideo({ storage_path: path, mime_type: f.type });
      if (!proc.transcript || proc.transcript.trim().length < 20) {
        toast.error('Não consegui transcrever este vídeo (áudio ausente ou muito curto).');
        setState('VIDEO_UPLOAD');
        return;
      }
      const ct = proc.detected_content_type || proc.content_type || '';
      setTranscript(proc.transcript);
      setVisualSummary(proc.visual_summary);
      setVideoContentType(ct);

      await runVideoCaption({
        transcript: proc.transcript,
        visualSummary: proc.visual_summary,
        contentType: ct,
        videoPath: path,
        videoUrl: publicUrl,
        fileName: f.name,
      });
    } catch (e) {
      console.error(e);
      toast.error(`Falha no vídeo: ${(e as Error).message.slice(0, 160)}`);
      setState('VIDEO_UPLOAD');
    }
  }

  // Gera a legenda do vídeo (1ª vez ou regeneração). Recebe o transcript por
  // parâmetro pra não depender de setState assíncrono.
  async function runVideoCaption(params: {
    transcript: string; visualSummary: string; contentType: string;
    videoPath: string; videoUrl: string; fileName?: string; briefing?: string;
  }) {
    if (params.transcript.trim().length < 20) {
      toast.error('Transcrição muito curta pra gerar legenda.');
      setState('VIDEO_UPLOAD');
      return;
    }
    const pick = autoChoose();
    setState('GENERATING');
    setGenLabel('Escrevendo a legenda do vídeo...');

    try {
      const res = await edge.generateCaptionFromVideo({
        transcript: params.transcript,
        visual_summary: params.visualSummary,
        content_type: params.contentType,
        editorial_slug: pick.editorial.slug,
        target_avatar: pick.targetAvatar,
        briefing: params.briefing || undefined,
      });
      setVideoCaption(res.caption);

      const post = await create({
        title: params.fileName?.replace(/\.[^.]+$/, '') || pick.editorial.name,
        platform: pick.platform,
        format: 'video' as 'image',
        status: 'pending_approval',
        caption: res.caption,
        carousel_text: {
          transcript: params.transcript,
          visual_summary: params.visualSummary,
          caption: res.caption,
        },
        metadata: {
          video_path: params.videoPath,
          video_url: params.videoUrl,
          editorial_slug: pick.editorial.slug,
          target_avatar: pick.targetAvatar,
          content_type: params.contentType,
          source: 'video-upload',
          auto_generated: true,
        },
      });
      setDraftPost(post);
      setState('TEXT_PREVIEW');
    } catch (e) {
      console.error(e);
      toast.error(`Erro ao gerar legenda: ${(e as Error).message.slice(0, 140)}`);
      setState('VIDEO_UPLOAD');
    }
  }

  // ==========================================================================
  // FLUXO ROTEIRO
  // ==========================================================================
  async function handleStartScriptGeneration(extraBriefing?: string) {
    if (editorials.length === 0) {
      toast.error('Carregando conhecimentos... aguarde 1 segundo.');
      return;
    }
    setFlow('roteiro');
    setState('GENERATING');
    setGenLabel('Escrevendo seu roteiro...');
    try {
      const pick = autoChoose();
      const res = await edge.generateScript({
        editorial_slug: pick.editorial.slug,
        target_avatar: pick.targetAvatar,
        platform: pick.platform,
        briefing: extraBriefing || undefined,
      });
      setScriptTitulo(res.titulo);
      setScriptRoteiro(res.roteiro);

      const post = await create({
        title: res.titulo || pick.editorial.name,
        platform: pick.platform,
        format: 'video' as 'image',
        status: 'pending_approval',
        caption: res.roteiro,
        carousel_text: { titulo: res.titulo, roteiro: res.roteiro },
        metadata: {
          editorial_slug: pick.editorial.slug,
          target_avatar: pick.targetAvatar,
          content_kind: 'roteiro',
          source: 'script',
          auto_generated: true,
        },
      });
      setDraftPost(post);
      setState('TEXT_PREVIEW');
    } catch (e) {
      console.error(e);
      toast.error('Erro ao gerar roteiro. Tente novamente.');
      setState('VIDEO_FORMAT');
    }
  }

  // ==========================================================================
  // AÇÕES DE TEXTO (vídeo pronto / roteiro)
  // ==========================================================================
  const handleApproveText = () => {
    if (flow === 'video_ready') { setScheduleOpen(true); return; }
    void approveRoteiro(); // roteiro
  };

  async function approveRoteiro() {
    if (!draftPost) return;
    try {
      await postApi.update(draftPost.id, { status: 'draft' });
      toast.success('Roteiro salvo como rascunho no Kanban!');
      navigate('/');
    } catch (e) {
      console.error(e);
      toast.error('Erro ao salvar o roteiro.');
    }
  }

  const openFeedback = (action: FeedbackActionType) => {
    setCorrectingField(null);
    setFeedbackAction(action);
    setFeedbackOpen(true);
  };

  // Feedback do vídeo/roteiro (post inteiro): aprende e regenera.
  async function submitVideoRoteiroFeedback(feedbackText: string, facet: 'texto' | 'legenda' | 'ambos') {
    if (!draftPost) return;
    const meta = draftPost.metadata as { editorial_slug?: string; target_avatar?: string } | undefined;

    let quoteOrig = '';
    let capOrig = '';
    if (flow === 'video_ready') {
      capOrig = videoCaption;
    } else {
      quoteOrig = scriptTitulo;
      capOrig = scriptRoteiro;
    }

    try {
      const res = await edge.learnFromFeedback({
        post_id: draftPost.id,
        feedback_text: feedbackText,
        quote_original: quoteOrig,
        caption_original: capOrig,
        editorial_slug: meta?.editorial_slug ?? null,
        platform: draftPost.platform,
        target_avatar: meta?.target_avatar ?? null,
        facet_focus: facet,
      });

      const learnings = res.learnings ?? [];
      toast[learnings.length > 0 ? 'success' : 'info'](
        learnings.length > 0
          ? `A I.A aprendeu ${learnings.length} lição(ões) com seu feedback!`
          : 'Feedback processado (sem regras novas geradas).',
      );

      const wasCorrect = feedbackAction === 'correct';
      const briefing = wasCorrect ? feedbackText : undefined;
      const vid = { transcript, visualSummary, contentType: videoContentType, videoPath: videoPath ?? '', videoUrl: videoUrl ?? '' };

      await postApi.delete(draftPost.id);
      resetDraft();
      toast.info(wasCorrect ? 'Regenerando com base no aprendizado...' : 'Descartado. Gerando uma proposta nova...');

      if (flow === 'roteiro') {
        await handleStartScriptGeneration(briefing);
      } else {
        await runVideoCaption({ ...vid, briefing });
      }
    } catch (err) {
      console.error(err);
      toast.error('Ocorreu um erro ao processar seu feedback.');
    }
  }

  // Roteador do FeedbackDialog: imagem (campo) vs vídeo/roteiro (post inteiro).
  async function handleFeedbackSubmit(feedbackText: string, facet: 'texto' | 'legenda' | 'ambos') {
    // Rejeição do post inteiro (título + legenda): aprende e regenera os dois.
    if (flow === 'image' && correctingWhole && activeItem) {
      const item = activeItem;
      setCorrectingWhole(false);
      try {
        await edge.learnFromFeedback({
          post_id: item.post.id,
          feedback_text: feedbackText,
          quote_original: item.quote,
          caption_original: item.caption,
          editorial_slug: item.pick.editorialSlug,
          platform: item.pick.platform,
          target_avatar: item.pick.targetAvatar,
          facet_focus: facet,
        });
      } catch (e) {
        console.error(e);
      }
      await regenerateWholePost(item, feedbackText);
      return;
    }
    if (flow === 'image' && correctingField && activeItem) {
      const item = activeItem;
      const field = correctingField;
      setCorrectingField(null);
      // Aprende com o feedback explícito, depois regenera só aquele campo.
      try {
        await edge.learnFromFeedback({
          post_id: item.post.id,
          feedback_text: feedbackText,
          quote_original: item.quote,
          caption_original: item.caption,
          editorial_slug: item.pick.editorialSlug,
          platform: item.pick.platform,
          target_avatar: item.pick.targetAvatar,
          facet_focus: facet,
        });
      } catch (e) {
        console.error(e);
      }
      await regenerateField(item, field, feedbackText, correctingMode);
      return;
    }
    await submitVideoRoteiroFeedback(feedbackText, facet);
  }

  // Vídeo pronto: agendamento (o "visual" é o próprio vídeo no Storage).
  const handleVideoScheduleConfirm = async (date: Date | null) => {
    if (!draftPost) return;
    setScheduleOpen(false);
    try {
      if (date) {
        await postApi.update(draftPost.id, { status: 'scheduled', scheduled_date: date.toISOString() });
        toast.success('Vídeo agendado com sucesso!');
      } else {
        await postApi.update(draftPost.id, { status: 'approved' });
        toast.success('Vídeo em stand-by — publique quando quiser.');
      }
      navigate('/');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao agendar o vídeo.');
    }
  };

  // ==========================================================================
  // DERIVADOS DE RENDER
  // ==========================================================================
  const headerSubtitle =
    state === 'FORMAT' ? 'Escolha o que você quer criar.' :
    state === 'BATCH_CONFIG' ? 'Quantos posts a IA deve gerar de uma vez?' :
    state === 'VIDEO_FORMAT' ? 'Que tipo de conteúdo de vídeo?' :
    state === 'VIDEO_UPLOAD' ? 'Envie o vídeo já gravado.' :
    state === 'GENERATING' ? 'Deixe a mágica acontecer...' :
    state === 'REVIEW_QUEUE' ? 'Revise cada post do lote.' :
    state === 'REVIEW_ONE' ? 'Aprove ou rejeite o título e a legenda.' :
    state === 'TEXT_PREVIEW'
      ? (flow === 'roteiro' ? 'Avalie o roteiro (texto fixo).' : 'Avalie a legenda (texto fixo).')
      : 'Avalie o design visual (imagem fechada).';

  const previewDims = activeItem ? getLayoutDimensions(activeItem.sizeId) : getLayoutDimensions('portrait');
  const bothApproved = !!activeItem && activeItem.tituloStatus === 'approved' && activeItem.legendaStatus === 'approved';

  function handleBack() {
    if (state === 'FORMAT') { navigate(-1); return; }
    if (state === 'REVIEW_ONE') { setActiveId(null); setState('REVIEW_QUEUE'); return; }
    if (state === 'IMAGE_PREVIEW') { setState('REVIEW_ONE'); return; }
    setState('FORMAT');
  }

  // --- RENDERIZAÇÃO ---
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 lg:p-8 min-h-screen">
      <header className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={handleBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="font-display text-2xl font-bold">Criação de Conteúdo</h1>
          <p className="text-sm text-muted-foreground">{headerSubtitle}</p>
        </div>
      </header>

      {/* MODAIS */}
      <FeedbackDialog
        open={feedbackOpen}
        onOpenChange={setFeedbackOpen}
        actionType={feedbackAction}
        onSubmit={handleFeedbackSubmit}
        lockedFacet={correctingField ? (correctingField === 'titulo' ? 'texto' : 'legenda') : undefined}
      />

      <AiEditDialog
        open={aiEditField !== null}
        onOpenChange={(o) => { if (!o) setAiEditField(null); }}
        fieldLabel={aiEditField === 'titulo' ? 'o título' : 'a legenda'}
        currentText={aiEditField === 'titulo' ? (activeItem?.quote ?? '') : (activeItem?.caption ?? '')}
        busy={aiEditBusy}
        onApply={applyAiEdit}
      />

      <SnippetRegenDialog
        open={snippetOpen}
        onOpenChange={(o) => { if (!o) { setSnippetOpen(false); setSnippetOptions([]); } }}
        snippet={snippetSel?.text ?? ''}
        busy={snippetBusy}
        options={snippetOptions}
        onGenerate={generateSnippetOptions}
        onPick={pickSnippetOption}
      />

      {state === 'REVIEW_ONE' && activeItem && (
        <PostChatPanel
          key={activeItem.post.id}
          open={chatOpen}
          onClose={() => setChatOpen(false)}
          postId={activeItem.post.id}
          post={{
            quote: activeItem.quote,
            caption: activeItem.caption,
            editorial_slug: activeItem.pick.editorialSlug,
            platform: activeItem.pick.platform === 'instagram' ? 'instagram' : 'linkedin',
            target_avatar: activeItem.pick.targetAvatar,
          }}
          onApply={(field, text) => commitFieldText(activeItem, field, text)}
        />
      )}

      <ScheduleModal
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        onConfirm={flow === 'image'
          ? (date) => {
              const item = batch.find((it) => it.post.id === imageScheduleId);
              return item ? finalizeImageItem(item, date) : Promise.resolve();
            }
          : handleVideoScheduleConfirm}
        platform={(flow === 'image' ? activeItem?.pick.platform : draftPost?.platform) || 'linkedin'}
        allowPublishNow={flow !== 'image'}
      />

      {/* FORMAT: imagem vs vídeo */}
      {state === 'FORMAT' && (
        <div className="grid gap-4 sm:grid-cols-2 mt-8">
          <Card className="hover:border-accent hover:bg-accent/5 transition-colors cursor-pointer" onClick={() => { setFlow('image'); setState('BATCH_CONFIG'); }}>
            <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
              <div className="rounded-full bg-accent/20 p-4">
                <ImageIcon className="h-8 w-8 text-accent" />
              </div>
              <div>
                <h3 className="font-display font-bold text-lg">Post de Imagem</h3>
                <p className="text-sm text-muted-foreground max-w-[220px] mt-1">A IA gera de 1 a 5 posts pra você revisar e aprovar.</p>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:border-accent hover:bg-accent/5 transition-colors cursor-pointer" onClick={() => setState('VIDEO_FORMAT')}>
            <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
              <div className="rounded-full bg-accent/20 p-4">
                <Video className="h-8 w-8 text-accent" />
              </div>
              <div>
                <h3 className="font-display font-bold text-lg">Post de Vídeo</h3>
                <p className="text-sm text-muted-foreground max-w-[220px] mt-1">Legenda de um vídeo pronto ou um roteiro pra gravar.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* BATCH_CONFIG: quantos posts + plataforma/editoria (opcional) */}
      {state === 'BATCH_CONFIG' && (
        <div className="mt-8 space-y-4">
          {/* Quantidade */}
          <Card>
            <CardContent className="py-8 flex flex-col items-center gap-5 text-center">
              <div className="rounded-full bg-accent/20 p-4"><Layers className="h-8 w-8 text-accent" /></div>
              <div>
                <h3 className="font-display font-bold text-lg">Quantos posts?</h3>
                <p className="text-sm text-muted-foreground max-w-sm mt-1">
                  De 1 a 5. A IA gera cada um, checa a qualidade sozinha e refaz o que não passar na régua.
                </p>
              </div>
              <div className="flex gap-2">
                {Array.from({ length: BATCH_MAX - BATCH_MIN + 1 }, (_, i) => BATCH_MIN + i).map((n) => (
                  <Button
                    key={n}
                    variant={batchQuantity === n ? 'accent' : 'outline'}
                    className="h-14 w-14 text-lg font-bold"
                    onClick={() => setBatchQuantity(n)}
                  >
                    {n}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Plataforma (opcional) */}
          <Card>
            <CardContent className="p-5 space-y-3">
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <h4 className="font-semibold">Plataforma <span className="text-xs font-normal text-muted-foreground">(opcional)</span></h4>
                <span className="text-xs text-muted-foreground">
                  {selPlatforms.length ? `${selPlatforms.length}/${maxPlatforms} selecionada(s)` : `até ${maxPlatforms} — vazio = a IA varia`}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {PLATFORMS.map((p) => {
                  const on = selPlatforms.includes(p);
                  return (
                    <Button
                      key={p}
                      variant={on ? 'accent' : 'outline'}
                      size="sm"
                      className="capitalize"
                      onClick={() => setSelPlatforms((cur) => {
                        if (cur.includes(p)) return cur.filter((x) => x !== p);
                        if (cur.length >= maxPlatforms) { toast.info(`Máximo ${maxPlatforms} plataforma(s) para ${batchQuantity} post(s).`); return cur; }
                        return [...cur, p];
                      })}
                    >
                      {on && <Check className="h-3.5 w-3.5 mr-1" />}{p}
                    </Button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Linha editorial (opcional) */}
          <Card>
            <CardContent className="p-5 space-y-3">
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <h4 className="font-semibold">Linha editorial <span className="text-xs font-normal text-muted-foreground">(opcional)</span></h4>
                <span className="text-xs text-muted-foreground">
                  {selEditorials.length ? `${selEditorials.length}/${maxEditorials} selecionada(s)` : `até ${maxEditorials} — vazio = a IA varia`}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {editorials.map((e) => {
                  const on = selEditorials.includes(e.slug);
                  return (
                    <Button
                      key={e.slug}
                      variant={on ? 'accent' : 'outline'}
                      size="sm"
                      onClick={() => setSelEditorials((cur) => {
                        if (cur.includes(e.slug)) return cur.filter((x) => x !== e.slug);
                        if (cur.length >= maxEditorials) { toast.info(`Máximo ${maxEditorials} linha(s) editorial(is) para ${batchQuantity} post(s).`); return cur; }
                        return [...cur, e.slug];
                      })}
                    >
                      {on && <Check className="h-3.5 w-3.5 mr-1" />}{e.name}
                    </Button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-center pt-1">
            <Button variant="accent" size="lg" onClick={() => void handleStartImageBatch()}>
              <Sparkles className="h-4 w-4 mr-2" /> Gerar {batchQuantity} {batchQuantity === 1 ? 'post' : 'posts'}
            </Button>
          </div>
        </div>
      )}

      {/* VIDEO_FORMAT: vídeo pronto / cortes / roteiro */}
      {state === 'VIDEO_FORMAT' && (
        <div className="grid gap-4 sm:grid-cols-3 mt-8">
          <Card className="hover:border-accent hover:bg-accent/5 transition-colors cursor-pointer" onClick={() => { setFlow('video_ready'); setState('VIDEO_UPLOAD'); }}>
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <div className="rounded-full bg-accent/20 p-4"><Film className="h-7 w-7 text-accent" /></div>
              <div>
                <h3 className="font-display font-bold">Vídeo pronto</h3>
                <p className="text-xs text-muted-foreground mt-1">Já gravou. Gera só a legenda pra postar.</p>
              </div>
            </CardContent>
          </Card>

          <Card className="opacity-50 cursor-not-allowed">
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center relative">
              <Badge variant="secondary" className="absolute top-3 right-3">Em breve</Badge>
              <div className="rounded-full bg-secondary p-4"><Scissors className="h-7 w-7 text-muted-foreground" /></div>
              <div>
                <h3 className="font-display font-bold">Cortes</h3>
                <p className="text-xs text-muted-foreground mt-1">Fatiar um vídeo longo em cortes.</p>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:border-accent hover:bg-accent/5 transition-colors cursor-pointer" onClick={() => handleStartScriptGeneration()}>
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <div className="rounded-full bg-accent/20 p-4"><FileText className="h-7 w-7 text-accent" /></div>
              <div>
                <h3 className="font-display font-bold">Roteiro</h3>
                <p className="text-xs text-muted-foreground mt-1">Gera um roteiro pra você gravar.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* VIDEO_UPLOAD: envio do vídeo pronto */}
      {state === 'VIDEO_UPLOAD' && (
        <Card className="border-dashed border-2 hover:border-accent transition-colors">
          <CardContent className="py-16">
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleVideoFile(f); }}
            />
            <div
              className="flex flex-col items-center gap-4 text-center cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="rounded-full bg-accent/20 p-5"><UploadCloud className="h-9 w-9 text-accent" /></div>
              <div>
                <h3 className="font-display font-bold text-lg">Envie seu vídeo</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm">Clique pra selecionar. MP4/MOV até {MAX_VIDEO_MB}MB. A IA transcreve e escreve a legenda.</p>
              </div>
              <Button variant="accent" className="mt-2">Selecionar vídeo</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* GENERATING */}
      {state === 'GENERATING' && (
        <Card className="border-accent/40 shadow-lg">
          <CardContent className="flex flex-col items-center gap-4 py-20 text-center">
            <Zap className="h-12 w-12 animate-pulse text-accent" />
            <div className="space-y-2">
              <h2 className="font-display text-xl font-bold">Sua I.A está trabalhando...</h2>
              <p className="text-muted-foreground max-w-md mx-auto min-h-[2.5rem]">{genLabel}</p>
            </div>
            {/* Barra de progresso do lote (imagem) — mostra que está andando mesmo se demorar */}
            {flow === 'image' && genProgress > 0 && (
              <div className="w-full max-w-sm">
                <div className="h-2.5 rounded-full bg-secondary overflow-hidden">
                  <div className="h-full bg-accent transition-all duration-500" style={{ width: `${genProgress}%` }} />
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">{genProgress}%</p>
              </div>
            )}
            {/* Barra de upload do vídeo */}
            {uploadPct > 0 && uploadPct < 100 && (
              <div className="w-full max-w-xs">
                <div className="h-2 rounded-full bg-secondary overflow-hidden">
                  <div className="h-full bg-accent transition-all" style={{ width: `${uploadPct}%` }} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">{uploadPct}% enviado</p>
              </div>
            )}
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mt-2" />
          </CardContent>
        </Card>
      )}

      {/* REVIEW_QUEUE: fila dos posts do lote */}
      {state === 'REVIEW_QUEUE' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {batch.length} post(s) na fila. Clique pra revisar cada um.
            </p>
            <Button variant="ghost" size="sm" onClick={() => navigate('/')}>Concluir depois</Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {batch.map((it) => {
              const done = it.tituloStatus === 'approved' && it.legendaStatus === 'approved';
              return (
                <Card
                  key={it.post.id}
                  className="cursor-pointer hover:border-accent transition-colors"
                  onClick={() => { setActiveId(it.post.id); setState('REVIEW_ONE'); }}
                >
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="outline" className="font-mono text-[10px]">{it.codigo}</Badge>
                      <Badge variant="outline">{it.pick.platform}</Badge>
                    </div>
                    <Badge className="bg-accent/15 text-accent hover:bg-accent/15 border-accent/30">
                      {editorialName(it.pick.editorialSlug)}
                    </Badge>
                    <p className="font-display text-sm font-medium leading-snug line-clamp-3">"{it.quote}"</p>
                    <ViralityBar score={it.score} />
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      <span title="Edições feitas à mão neste post">✋ {it.manualEdits} à mão</span>
                      <span title="Ajustes/regeneragões com IA neste post">🤖 {it.editRounds} com IA</span>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      {done
                        ? <Badge className="bg-emerald-600 text-white hover:bg-emerald-600"><Check className="h-3 w-3 mr-1" />Pronto pro design</Badge>
                        : <span className="text-xs text-muted-foreground flex items-center gap-1"><ArrowRight className="h-3 w-3" /> Revisar</span>}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* REVIEW_ONE: revisão de título + legenda de um post */}
      {state === 'REVIEW_ONE' && activeItem && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="font-mono text-xs">{activeItem.codigo}</Badge>
              <Badge className="bg-accent/15 text-accent hover:bg-accent/15 border-accent/30">
                {editorialName(activeItem.pick.editorialSlug)}
              </Badge>
              <span className="text-[11px] text-muted-foreground flex items-center gap-2">
                <span title="Edições feitas à mão neste post">✋ {activeItem.manualEdits} à mão</span>
                <span title="Ajustes/regeneragões com IA neste post">🤖 {activeItem.editRounds} com IA</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="text-accent border-accent/40 hover:bg-accent/10" onClick={() => setChatOpen(true)}>
                <MessageCircle className="h-4 w-4 mr-1" /> Assistente de geração de conteúdo
              </Button>
              <Badge variant="outline">{activeItem.pick.platform}</Badge>
            </div>
          </div>

          <Card><CardContent className="p-4"><ViralityBar score={activeItem.score} reason={activeItem.reason} /></CardContent></Card>

          {/* TÍTULO (frase da imagem) */}
          <Card className="shadow-sm">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <Badge variant="outline">Título (frase da imagem)</Badge>
                <StatusPill status={activeItem.tituloStatus} />
              </div>
              {editingQuote ? (
                <div className="space-y-2">
                  <Textarea
                    ref={titleRef}
                    rows={2}
                    maxLength={200}
                    value={quoteDraft}
                    onChange={(e) => setQuoteDraft(e.target.value)}
                    onSelect={(e) => {
                      const el = e.currentTarget;
                      const start = el.selectionStart ?? 0;
                      const end = el.selectionEnd ?? 0;
                      setSnippetSel(end > start ? { field: 'titulo', start, end, text: quoteDraft.slice(start, end) } : null);
                    }}
                    className="font-display text-lg leading-relaxed"
                    placeholder="Escreva a frase da imagem…"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="accent" disabled={savingQuote} onClick={() => void saveManualQuote(activeItem)}>
                      <Check className="h-4 w-4 mr-1" /> {savingQuote ? 'Salvando…' : 'Salvar frase'}
                    </Button>
                    <Button size="sm" variant="outline" disabled={savingQuote} onClick={() => setEditingQuote(false)}>Cancelar</Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-accent border-accent/40 hover:bg-accent/10"
                      disabled={savingQuote || snippetSel?.field !== 'titulo'}
                      onClick={() => openSnippetRegen('titulo')}
                      title={snippetSel?.field === 'titulo' ? 'Gerar opções para o trecho selecionado' : 'Selecione um trecho do título primeiro'}
                    >
                      <Sparkles className="h-4 w-4 mr-1" /> Regenerar trecho
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Dica: selecione um trecho acima e clique em <span className="text-accent font-medium">Regenerar trecho</span> pra ver outras opções.
                  </p>
                </div>
              ) : (
                <>
                  <p className="font-display text-lg font-medium leading-relaxed">"{activeItem.quote}"</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={activeItem.tituloStatus === 'approved' ? 'accent' : 'outline'}
                      onClick={() => approveField('titulo')}
                    >
                      <Check className="h-4 w-4 mr-1" /> Aprovar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setAiEditField('titulo')}>
                      <Wand2 className="h-4 w-4 mr-1" /> Editar com IA
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setQuoteDraft(activeItem.quote); setEditingQuote(true); }}>
                      <Edit3 className="h-4 w-4 mr-1" /> Editar à mão
                    </Button>
                    <Button size="sm" variant="outline" className="text-destructive hover:bg-destructive/10" onClick={() => openFieldFeedback('titulo', 'rejeitar')}>
                      <RefreshCw className="h-4 w-4 mr-1" /> Rejeitar
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* LEGENDA */}
          <Card className="shadow-sm">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <Badge variant="outline">Legenda do post</Badge>
                <StatusPill status={activeItem.legendaStatus} />
              </div>
              {editingCaption ? (
                <div className="space-y-2">
                  <Textarea
                    ref={captionRef}
                    rows={14}
                    value={captionDraft}
                    onChange={(e) => setCaptionDraft(e.target.value)}
                    onSelect={(e) => {
                      const el = e.currentTarget;
                      const start = el.selectionStart ?? 0;
                      const end = el.selectionEnd ?? 0;
                      setSnippetSel(end > start ? { field: 'legenda', start, end, text: captionDraft.slice(start, end) } : null);
                    }}
                    className="text-sm leading-relaxed min-h-[340px] resize-y"
                    placeholder="Escreva a legenda…"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="accent" disabled={savingCaption} onClick={() => void saveManualCaption(activeItem)}>
                      <Check className="h-4 w-4 mr-1" /> {savingCaption ? 'Salvando…' : 'Salvar legenda'}
                    </Button>
                    <Button size="sm" variant="outline" disabled={savingCaption} onClick={() => setEditingCaption(false)}>Cancelar</Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-accent border-accent/40 hover:bg-accent/10"
                      disabled={savingCaption || snippetSel?.field !== 'legenda'}
                      onClick={() => openSnippetRegen('legenda')}
                      title={snippetSel?.field === 'legenda' ? 'Gerar opções para o trecho selecionado' : 'Selecione um trecho da legenda primeiro'}
                    >
                      <Sparkles className="h-4 w-4 mr-1" /> Regenerar trecho
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Dica: selecione uma frase ou analogia acima e clique em <span className="text-accent font-medium">Regenerar trecho</span> pra ver outras opções.
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-sm whitespace-pre-wrap leading-relaxed text-muted-foreground">{activeItem.caption}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={activeItem.legendaStatus === 'approved' ? 'accent' : 'outline'}
                      onClick={() => approveField('legenda')}
                    >
                      <Check className="h-4 w-4 mr-1" /> Aprovar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setAiEditField('legenda')}>
                      <Wand2 className="h-4 w-4 mr-1" /> Editar com IA
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setCaptionDraft(activeItem.caption); setEditingCaption(true); }}>
                      <Edit3 className="h-4 w-4 mr-1" /> Editar à mão
                    </Button>
                    <Button size="sm" variant="outline" className="text-destructive hover:bg-destructive/10" onClick={() => openFieldFeedback('legenda', 'rejeitar')}>
                      <RefreshCw className="h-4 w-4 mr-1" /> Rejeitar
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Ações do post */}
          <Card className="border-t-4 border-t-accent bg-accent/5">
            <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
              <div>
                <p className="font-semibold flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-accent" /> Título e legenda aprovados?
                </p>
                <p className="text-xs text-muted-foreground max-w-[340px] mt-1">
                  Aprove os dois pra avançar pro design. A IA já regenerou {activeItem.editRounds}x este post.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="text-destructive hover:bg-destructive/10" onClick={openWholeFeedback}>
                  <RefreshCw className="h-4 w-4 mr-1" /> Rejeitar
                </Button>
                <Button
                  variant="accent"
                  disabled={!bothApproved}
                  onClick={() => {
                    persistReview(activeItem, { review_stage: 'design', titulo_status: 'approved', legenda_status: 'approved' });
                    setState('IMAGE_PREVIEW');
                  }}
                >
                  <ArrowRight className="h-4 w-4 mr-1" /> Ir pro design
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TEXT_PREVIEW: vídeo pronto / roteiro (item único) */}
      {state === 'TEXT_PREVIEW' && (
        <div className="space-y-6">
          {flow === 'video_ready' && (
            <div className="grid gap-6 md:grid-cols-2">
              <Card className="shadow-md overflow-hidden">
                <CardContent className="p-0">
                  {videoUrl ? (
                    <video src={videoUrl} controls className="w-full max-h-[420px] bg-black" />
                  ) : (
                    <div className="p-6 text-sm text-muted-foreground">Vídeo indisponível.</div>
                  )}
                </CardContent>
              </Card>
              <Card className="shadow-md">
                <CardContent className="p-6">
                  <Badge variant="outline" className="mb-2">Legenda do Vídeo</Badge>
                  <p className="text-sm whitespace-pre-wrap leading-relaxed text-muted-foreground">{videoCaption}</p>
                </CardContent>
              </Card>
            </div>
          )}

          {flow === 'roteiro' && (
            <Card className="shadow-md">
              <CardContent className="p-6 space-y-3">
                <Badge variant="outline">Roteiro do Vídeo</Badge>
                {scriptTitulo && <h2 className="font-display text-xl font-bold">{scriptTitulo}</h2>}
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{scriptRoteiro}</p>
              </CardContent>
            </Card>
          )}

          <Card className="border-t-4 border-t-accent bg-accent/5">
            <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
              <div>
                <p className="font-semibold flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-accent" /> O que achou?
                </p>
                <p className="text-xs text-muted-foreground max-w-[320px] mt-1">
                  O texto está travado. Se não gostou, use "Corrigir" — a I.A aprende com seu feedback e regenera.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="text-destructive hover:bg-destructive/10" onClick={() => openFeedback('discard')}>
                  Rejeitar Totalmente
                </Button>
                <Button variant="outline" onClick={() => openFeedback('correct')}>
                  Corrigir
                </Button>
                <Button variant="accent" onClick={handleApproveText}>
                  {flow === 'video_ready' ? 'Aprovar e Agendar' : 'Aprovar e Salvar Rascunho'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* IMAGE_PREVIEW: design de um post de imagem aprovado */}
      {state === 'IMAGE_PREVIEW' && activeItem && (
        <div className="space-y-6">
          <Card className="shadow-md overflow-hidden">
            <CardContent className="p-0">
              <div className="bg-secondary/20 p-4 border-b text-center text-sm font-medium text-muted-foreground flex justify-between items-center">
                <span className="font-mono text-xs">{activeItem.codigo}</span>
                <Badge variant="outline" className="bg-background">{activeItem.pick.platform}</Badge>
              </div>
              <div className="p-8 flex justify-center bg-secondary/10">
                <StaticCanvasPreview
                  key={activeItem.quote}
                  fabricJson={activeItem.fabricJson}
                  width={previewDims.width}
                  height={previewDims.height}
                  className="shadow-2xl rounded-sm"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-t-4 border-t-accent bg-accent/5">
            <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
              <div>
                <p className="font-semibold flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-accent" /> Gostou do design?
                </p>
                <p className="text-xs text-muted-foreground max-w-[300px] mt-1">
                  Agende agora ou deixe em stand-by pra postar depois. Se cortou o texto, abra a edição manual.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => void handleManualEditItem(activeItem)}>
                  <Edit3 className="h-4 w-4 mr-1" /> Edição Manual
                </Button>
                <Button variant="outline" onClick={() => void finalizeImageItem(activeItem, null)}>
                  <PauseCircle className="h-4 w-4 mr-1" /> Stand-by
                </Button>
                <Button variant="accent" onClick={() => { setImageScheduleId(activeItem.post.id); setScheduleOpen(true); }}>
                  Agendar
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
