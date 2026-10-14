// Serviço comum de AJUSTES de peças (docs/identidade/Hive_Ajustes_e_Alternativas_de_Pecas_v1.md).
// Toda mudança vira um CANDIDATO sobre a versão-base: altera só os componentes autorizados
// (mutable_paths), mostra a comparação e só muda a peça ativa ao APLICAR — validação final
// no banco (apply_piece_candidate). Usado pela revisão do ciclo, editor e chat.
import { db } from '@/lib/db';
import { edge, type HiveSeed } from '@/lib/edge';
import { generateHiveImage } from '@/lib/hive/runVisual';
import { imageKind, seedFromDecision } from '@/lib/campaign/produce';
import type { UserPost } from '@/types';

export type PieceAction = 'adjust_text' | 'swap_image' | 'swap_template' | 'explore_visual' | 'other_approach' | 'vary_both';
export type Component = 'quote' | 'caption' | 'image' | 'visual';

export interface PieceCandidate {
  id: string; post_id: string; operation_id: string; base_version: number; base_candidate_id: string | null;
  action: PieceAction; mutable_paths: Component[]; field_paths: string[]; instruction: string | null; selected_template_id: string | null;
  preserved: Components; proposal: Proposal | null; diff: DiffItem[] | null; affected_components: Component[]; impact: string | null;
  status: 'generating' | 'ready' | 'applied' | 'discarded' | 'failed' | 'conflict' | 'rejected'; error: string | null; created_at: string;
}
export interface Components { quote: string; caption: string; variant: string | null; image_ref: string | null }
export interface Proposal extends Partial<Components> {
  carousel_fabric_json?: unknown[]; rendered_slides?: Record<string, string>; visual_decision?: Record<string, unknown>;
}
export interface DiffItem { component: Component | 'template'; before: string | null; after: string | null }

export const ACTION_LABELS: Record<PieceAction, string> = {
  adjust_text: 'Ajustar texto', swap_image: 'Trocar imagem', swap_template: 'Trocar template',
  explore_visual: 'Explorar visual', other_approach: 'Outra abordagem', vary_both: 'Variar design e imagem',
};
export const PRESERVED_LABELS: Record<Component, string> = { quote: 'Frase mantida', caption: 'Legenda mantida', image: 'Imagem mantida', visual: 'Template mantido' };

// ---------------- leitura do estado atual ----------------
type Vd = { variant?: string; image_ref?: string | null; asset?: { url?: string; width?: number; height?: number; espaco_texto?: string; texto_cor?: string; origin?: string; photo_generation_id?: string } } | null;
const vdOf = (p: UserPost) => (p.visual_decision ?? null) as Vd;

// Recurso de imagem ATIVO (identidade): decisão visual ou 1ª imagem não-espiral do canvas.
export function imageRefOf(p: UserPost): string | null {
  const vd = vdOf(p);
  if (vd?.image_ref) return vd.image_ref;
  if (vd?.asset?.url) return vd.asset.url;
  const objs = ((p.carousel_fabric_json as Array<{ objects?: Array<{ type?: string; src?: string }> }> | null)?.[0]?.objects) ?? [];
  return objs.find((o) => (o.type === 'Image' || o.type === 'image') && o.src && !/espiral|spiral/i.test(o.src))?.src ?? null;
}

export function componentsOf(p: UserPost): Components {
  return { quote: (p.carousel_text?.quote as string | undefined) ?? '', caption: p.caption ?? '', variant: vdOf(p)?.variant ?? null, image_ref: imageRefOf(p) };
}

function keepAssetOf(p: UserPost): Parameters<typeof generateHiveImage>[0]['keepAsset'] {
  const vd = vdOf(p);
  const kind = imageKind(vd?.variant);
  const ref = imageRefOf(p);
  if (kind === 'none' || !ref) return null;
  if (kind === 'photo') {
    const a = vd?.asset ?? {};
    return { url: ref, kind: 'photo', width: a.width ?? null, height: a.height ?? null, espaco_texto: a.espaco_texto ?? null, texto_cor: a.texto_cor ?? null, origin: a.origin, photo_generation_id: a.photo_generation_id };
  }
  return { url: ref, kind: 'bg' };
}

// Ações disponíveis no estado atual (não oferecer o que não se aplica).
export function availability(p: UserPost, action: PieceAction): { ok: boolean; reason?: string } {
  if (p.status === 'published') return { ok: false, reason: 'Peça publicada: o histórico não muda.' };
  const kind = imageKind(vdOf(p)?.variant);
  if (action === 'explore_visual') return { ok: false, reason: 'Criação visual fora dos templates ainda não está disponível — use Trocar template.' };
  if (action === 'swap_image' && kind === 'none') return { ok: false, reason: 'Este template não usa imagem. Para adicionar uma, use Trocar template.' };
  if ((action === 'swap_template' || action === 'swap_image' || action === 'vary_both') && !p.rendered_slides?.slide1) return { ok: false, reason: 'A peça ainda não tem visual.' };
  return { ok: true };
}

// Compatibilidade de template com o recurso atual (o impacto é mostrado ANTES de aplicar).
export function templateImpact(current: string | null, target: string): { compatible: boolean; impact: string | null } {
  const a = imageKind(current), b = imageKind(target);
  if (a === b) return { compatible: true, impact: null };
  if (a === 'none') return { compatible: false, impact: b === 'photo' ? 'Este template usa foto: a peça vai ganhar uma foto nova.' : 'Este template usa imagem de fundo: a peça vai ganhar um fundo novo.' };
  if (b === 'none') return { compatible: false, impact: 'Este template não usa imagem: a imagem atual sai da peça.' };
  return { compatible: false, impact: a === 'photo' ? 'Este template usa fundo, não foto: a foto atual será trocada por um fundo.' : 'Este template usa foto: o fundo atual será trocado por uma foto.' };
}

// ---------------- criação do candidato ----------------
export interface CandidateRequest {
  action: PieceAction;
  field?: 'quote' | 'caption';           // ajustar texto
  instruction?: string;                   // pedido à Hive
  manualText?: string;                    // edição direta (vira candidato também)
  templateId?: string;                    // trocar template / variar
  acceptImpact?: boolean;                 // template incompatível: troca de imagem autorizada
  baseCandidate?: PieceCandidate | null;  // "pedir outro ajuste" a partir da proposta exibida
  operationId?: string;
}

const MUTABLE: Record<PieceAction, Component[]> = {
  adjust_text: [], swap_image: ['image', 'visual'], swap_template: ['visual'], explore_visual: ['visual'],
  other_approach: ['quote', 'caption', 'visual'], vary_both: ['visual', 'image'],
};

export async function createCandidate(userId: string, active: UserPost, req: CandidateRequest): Promise<PieceCandidate> {
  const av = availability(active, req.action);
  if (!av.ok) throw new Error(av.reason);
  // Base: versão ativa, ou a proposta exibida ("pedir outro ajuste" sobre ela).
  const prevProp = req.baseCandidate?.status === 'ready' ? req.baseCandidate.proposal : null;
  const base: UserPost = prevProp ? {
    ...active,
    carousel_text: { ...(active.carousel_text ?? {}), quote: prevProp.quote ?? componentsOf(active).quote },
    caption: prevProp.caption ?? active.caption,
    carousel_fabric_json: (prevProp.carousel_fabric_json ?? active.carousel_fabric_json) as UserPost['carousel_fabric_json'],
    rendered_slides: (prevProp.rendered_slides ?? active.rendered_slides) as UserPost['rendered_slides'],
    visual_decision: (prevProp.visual_decision ?? active.visual_decision) as UserPost['visual_decision'],
  } : active;
  const cur = componentsOf(base);
  let mutable: Component[] = req.action === 'adjust_text' ? (req.field === 'caption' ? ['caption'] : ['quote', 'visual']) : [...MUTABLE[req.action]];
  let impact: string | null = null;
  if (req.action === 'swap_template' && req.templateId) {
    const t = templateImpact(cur.variant, req.templateId);
    if (!t.compatible) {
      if (!req.acceptImpact) throw Object.assign(new Error(t.impact ?? 'Template incompatível com a imagem atual.'), { impact: t.impact });
      mutable = ['visual', 'image']; impact = t.impact;
    }
  }
  if (prevProp) mutable = [...new Set([...mutable, ...(req.baseCandidate!.mutable_paths)])];

  const [cand] = await db.insert<PieceCandidate>('piece_candidates', {
    user_id: userId, post_id: active.id, operation_id: req.operationId ?? crypto.randomUUID(), base_version: active.version ?? 1,
    base_candidate_id: req.baseCandidate?.id ?? null, action: req.action, mutable_paths: mutable,
    field_paths: req.field ? [req.field] : [], instruction: req.instruction ?? req.manualText ?? null, selected_template_id: req.templateId ?? null,
    preserved: componentsOf(active), status: 'generating', impact,
  });
  if (!cand) throw new Error('Falha ao registrar a proposta.');

  try {
    const proposal = await buildProposal(userId, base, cur, req, mutable, cand.id);
    const diff = diffOf(componentsOf(active), proposal);
    // Validação local (o banco valida de novo ao aplicar).
    const broken = (['quote', 'caption', 'image'] as Component[]).filter((c) => !mutable.includes(c) && changed(componentsOf(active), proposal, c));
    if (broken.length) {
      const [r] = await db.update<PieceCandidate>('piece_candidates', { id: `eq.${cand.id}` }, { status: 'rejected', proposal, diff, error: `A proposta alterou componente preservado: ${broken.join(', ')}.` });
      return r ?? cand;
    }
    const affected = diff.map((d) => (d.component === 'template' ? 'visual' : d.component)) as Component[];
    const [ready] = await db.update<PieceCandidate>('piece_candidates', { id: `eq.${cand.id}` }, { status: 'ready', proposal, diff, affected_components: [...new Set(affected)] });
    return ready ?? cand;
  } catch (e) {
    await db.update('piece_candidates', { id: `eq.${cand.id}` }, { status: 'failed', error: (e as Error).message.slice(0, 400) }).catch(() => {});
    throw e;
  }
}

function changed(a: Components, p: Proposal, c: Component): boolean {
  if (c === 'quote') return p.quote !== undefined && p.quote !== a.quote;
  if (c === 'caption') return p.caption !== undefined && p.caption !== a.caption;
  if (c === 'image') return p.image_ref !== undefined && (p.image_ref ?? null) !== (a.image_ref ?? null);
  return p.variant !== undefined && p.variant !== a.variant;
}

function diffOf(a: Components, p: Proposal): DiffItem[] {
  const out: DiffItem[] = [];
  if (changed(a, p, 'quote')) out.push({ component: 'quote', before: a.quote, after: p.quote ?? null });
  if (changed(a, p, 'caption')) out.push({ component: 'caption', before: a.caption, after: p.caption ?? null });
  if (changed(a, p, 'image')) out.push({ component: 'image', before: a.image_ref, after: p.image_ref ?? null });
  if (changed(a, p, 'visual')) out.push({ component: 'template', before: a.variant, after: p.variant ?? null });
  return out;
}

async function render(userId: string, piece: UserPost, opts: { text: string; caption: string; seed?: HiveSeed; keep: ReturnType<typeof keepAssetOf>; forceBg?: boolean; photoAdjust?: string; candId: string }): Promise<Proposal> {
  const r = await generateHiveImage({
    userId, postId: piece.id, text: opts.text, platform: piece.platform as 'linkedin' | 'instagram',
    editorialSlug: piece.metadata?.editorial_slug as string | undefined, seed: opts.seed, forceBg: opts.forceBg,
    context: opts.caption, previousDecision: piece.visual_decision as Record<string, unknown> | null, photoAdjust: opts.photoAdjust,
    keepAsset: opts.forceBg ? null : opts.keep, uploadKey: opts.candId, persistDecision: false,
  });
  const decision = r.decision as Record<string, unknown>;
  return {
    carousel_fabric_json: [r.slide], rendered_slides: { slide1: `${r.publicUrl.split('?')[0]}?v=${Date.now()}` }, visual_decision: decision,
    variant: (decision.variant as string) ?? null, image_ref: (decision.image_ref as string | null | undefined) ?? (decision.asset as { url?: string } | undefined)?.url ?? null,
  };
}

const seedFor = (base: UserPost, variant?: string | null): HiveSeed | undefined => {
  const s = seedFromDecision(base.visual_decision);
  if (!s) return undefined;
  if (!variant || variant === s.variant) return s;
  return { ...s, variant, manifestation: variant.split('-')[0], human_presence_adds_meaning: variant.startsWith('M02-'), variant_reason: 'template escolhido pelo autor' };
};

async function buildProposal(userId: string, base: UserPost, cur: Components, req: CandidateRequest, mutable: Component[], candId: string): Promise<Proposal> {
  const keep = keepAssetOf(base);
  switch (req.action) {
    case 'adjust_text': {
      const field = req.field ?? 'quote';
      const text = req.manualText?.trim() || (await edge.editText({
        field: field === 'quote' ? 'titulo' : 'legenda', text: field === 'quote' ? cur.quote : cur.caption, instruction: req.instruction ?? '',
        counterpart: field === 'quote' ? cur.caption : cur.quote, editorial_slug: base.metadata?.editorial_slug as string | undefined,
        target_platform: base.platform as 'linkedin' | 'instagram', post_id: base.id,
      })).text;
      if (field === 'caption') return { caption: text };
      // Frase nova: recompõe no MESMO template com o MESMO recurso de imagem (sem nova foto/fundo).
      return { quote: text, ...(await render(userId, base, { text, caption: cur.caption, seed: seedFor(base), keep, candId })) };
    }
    case 'swap_image':
      return render(userId, base, { text: cur.quote, caption: cur.caption, seed: seedFor(base), keep, forceBg: true, photoAdjust: req.instruction, candId });
    case 'swap_template': {
      if (!req.templateId) throw new Error('Escolha um template.');
      return render(userId, base, { text: cur.quote, caption: cur.caption, seed: seedFor(base, req.templateId), keep, forceBg: mutable.includes('image'), candId });
    }
    case 'vary_both':
      return render(userId, base, { text: cur.quote, caption: cur.caption, seed: seedFor(base, req.templateId ?? cur.variant), keep, forceBg: true, candId });
    case 'other_approach': {
      // Alternativa intelectual do MESMO conteúdo-mãe (mesma intenção/ACJ); ocupa o mesmo desdobramento.
      const gen = await edge.generateContent({
        editorial_slug: (base.metadata?.editorial_slug as string | undefined) ?? 'provocacao-de-crenca',
        target_platform: base.platform as 'linkedin' | 'instagram', variations: 1,
        ...(base.content_id ? { acj_content_id: base.content_id } : {}),
        briefing: [
          'OUTRA ABORDAGEM da MESMA peça: mesmo conteúdo-mãe, mesma intenção e mesmo movimento; mude a entrada, o desenvolvimento e o encerramento.',
          `Versão atual (não repita a estrutura):\nFrase: ${cur.quote}\nLegenda:\n${cur.caption}`,
          req.instruction ? `Pedido do autor: ${req.instruction}` : '',
        ].filter(Boolean).join('\n\n'),
      });
      const v = gen.variations?.[0] ?? gen;
      const quote = String(v.quote ?? '').trim(), caption = String(v.caption ?? '').trim();
      if (!quote) throw new Error('A Hive não trouxe outra abordagem.');
      return { quote, caption, ...(await render(userId, base, { text: quote, caption, seed: seedFor(base), keep, candId })) };
    }
    default:
      throw new Error('Ação indisponível.');
  }
}

// ---------------- aplicar / descartar ----------------
export async function applyCandidate(c: PieceCandidate): Promise<UserPost> {
  let post: UserPost | UserPost[];
  try {
    post = await db.rpc<UserPost | UserPost[]>('apply_piece_candidate', { cand_id: c.id });
  } catch (e) {
    // O RAISE do banco desfaz a marcação: registra o motivo fora da transação que falhou.
    const msg = (e as Error).message;
    const status = /conflito/i.test(msg) ? 'conflict' : /rejeitada/i.test(msg) ? 'rejected' : null;
    if (status) await db.update('piece_candidates', { id: `eq.${c.id}` }, { status, error: msg.replace(/^.*?(Conflito|Proposta rejeitada)/, '$1').slice(0, 400) }).catch(() => {});
    throw e;
  }
  const p = Array.isArray(post) ? post[0] : post;
  if (!p) throw new Error('A peça não foi atualizada.');
  return p;
}
export async function discardCandidate(c: PieceCandidate): Promise<void> {
  await db.update('piece_candidates', { id: `eq.${c.id}` }, { status: 'discarded' });
}
export async function updateScheduledPackage(postId: string): Promise<UserPost> {
  const p = await db.rpc<UserPost | UserPost[]>('update_scheduled_package', { pid: postId });
  return (Array.isArray(p) ? p[0] : p) as UserPost;
}
