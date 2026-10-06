// Produção visual do ciclo (Telas 12–12C). "Se a Hive consegue produzir, ela produz":
//  - peça de VALIDAÇÃO (LinkedIn): texto já aprovado → visual M01-A (fixo) é
//    produzido e a peça nasce APROVADA;
//  - DESDOBRAMENTOS (ex.: Instagram): a Hive adapta o conteúdo validado, propõe
//    uma recomendação + alternativas de direção visual (só quando diferem de
//    verdade) e a pessoa escolhe/ajusta/aprova.
// Reusa o pipeline visual existente (generateHiveImage: decisão → composição →
// imagem de IA → render → upload) e mantém o ciclo de aprendizado (ai_variations).
import { generateHiveImage } from '@/lib/hive/runVisual';
import { edge, type HiveSeed, type GeneratedVariation } from '@/lib/edge';
import { aiApi } from '@/lib/api';
import { db } from '@/lib/db';
import { cycleApi } from '@/lib/campaignApi';
import { getPhotoGeneration, reviewMarcosPhoto } from '@/lib/hive/marcosPhoto';
import type { AiVariation, CampaignCycle, Content, Idea, IdeaChannel, UserPost } from '@/types';

export const AI_IMAGE_VARIANT = (v?: string) => v === 'M01-D' || v === 'M01-E' || (v?.startsWith('M02-') ?? false);

// Mesmo template da decisão atual (re-render sem 2ª IA) — igual ao PostEditor.runHive.
export function seedFromDecision(vd: unknown): HiveSeed | undefined {
  const d = vd as { variant?: string; highlight?: HiveSeed['highlight']; subtitle?: string | null } | null | undefined;
  if (!d?.variant) return undefined;
  return {
    variant: d.variant, manifestation: d.variant.split('-')[0], highlight: d.highlight ?? null, subtitle: d.subtitle ?? null,
    poles: null, image_scene_hint: '', human_presence_adds_meaning: d.variant.startsWith('M02-'), mode_reason: '', variant_reason: 're-render mesmo template',
  };
}

async function updatePiece(id: string, patch: Partial<UserPost>): Promise<UserPost> {
  const rows = await db.update<UserPost>('user_posts', { id: `eq.${id}` }, patch);
  if (!rows[0]) throw new Error('Peça não encontrada');
  return rows[0];
}

// Produz (ou refaz) o visual da peça com a Hive e grava.
export async function renderPiece(userId: string, piece: UserPost, opts: { seed?: HiveSeed; forceBg?: boolean; approve?: boolean; photoAdjust?: string } = {}): Promise<UserPost> {
  const text = (piece.carousel_text?.quote as string | undefined)?.trim() || piece.title || '';
  const r = await generateHiveImage({
    userId, postId: piece.id, text, platform: piece.platform as 'linkedin' | 'instagram',
    editorialSlug: piece.metadata?.editorial_slug as string | undefined, seed: opts.seed, forceBg: opts.forceBg,
    context: piece.caption ?? undefined, previousDecision: piece.visual_decision as Record<string, unknown> | null, photoAdjust: opts.photoAdjust,
  });
  // O upload reusa o mesmo caminho (upsert): o ?v= força o navegador a buscar a
  // peça refeita em vez de mostrar a versão antiga do cache.
  const slide1 = `${r.publicUrl.split('?')[0]}?v=${Date.now()}`;
  return updatePiece(piece.id, {
    carousel_fabric_json: [r.slide], rendered_slides: { slide1 }, visual_decision: r.decision as Record<string, unknown>,
    ...(opts.approve
      ? { status: 'approved', image_status: 'approved', image_approved: true }
      : { image_status: 'pending', image_approved: false }),
    metadata: { ...piece.metadata, ...(opts.forceBg ? { bg_approved: false } : {}) },
  });
}

export interface UnfoldTask { content: Content; idea?: Idea; channel: IdeaChannel; validation?: UserPost }

// O que ainda falta produzir no ciclo (idempotente: retoma de onde parou).
export function productionTodo(contents: Content[], ideas: Idea[], pieces: UserPost[]): { validation: UserPost[]; unfold: UnfoldTask[] } {
  const validated = contents.filter((c) => c.status === 'validated');
  const validation = pieces.filter((p) => p.piece_role === 'validation' && p.status !== 'archived' && !p.rendered_slides?.slide1);
  const unfold: UnfoldTask[] = [];
  for (const c of validated) {
    const idea = ideas.find((i) => i.id === c.idea_id);
    const vPiece = pieces.find((p) => p.content_id === c.id && p.piece_role === 'validation');
    for (const ch of idea?.channels ?? []) {
      if (vPiece && ch.platform === vPiece.platform && (ch.account_id ?? null) === (vPiece.account_id ?? null)) continue;
      const done = pieces.some((p) => p.content_id === c.id && p.piece_role === 'unfold' && (p.account_id ?? null) === (ch.account_id ?? null) && p.platform === ch.platform);
      if (!done) unfold.push({ content: c, idea, channel: ch, validation: vPiece });
    }
  }
  return { validation, unfold };
}

// Alternativas "só com ganho real": uma por variante visual distinta (máx. 3).
export function distinctAlternatives(vars: GeneratedVariation[]): GeneratedVariation[] {
  const seen = new Set<string>();
  const out: GeneratedVariation[] = [];
  for (const v of vars) {
    const key = v.hive_seed?.variant ?? `txt-${out.length}`;
    if (seen.has(key) || !v.quote?.trim()) continue;
    seen.add(key);
    out.push(v);
    if (out.length === 3) break;
  }
  return out.length ? out : vars.slice(0, 1);
}

// Cria as propostas de um desdobramento (recomendada + alternativas) e produz os visuais.
export async function createUnfold(userId: string, cycle: CampaignCycle, t: UnfoldTask, editorialName?: string): Promise<UserPost[]> {
  const { content, idea, channel, validation } = t;
  const gen = await edge.generateContent({
    editorial_slug: content.editorial_slug ?? idea?.editorial_slug ?? 'provocacao-de-crenca',
    target_platform: channel.platform,
    variations: 1, // a frase é a mesma em todas as opções; outras opções variam design/imagem sob pedido
    ...(validation
      ? { reference_post_id: validation.id }
      : {
        mother_idea: { title: content.title, direction: idea?.summary ?? undefined },
        briefing: `CONTEÚDO JÁ VALIDADO pelo autor (adapte para ${channel.platform}, mesma linha de pensamento):\nFrase: ${content.body.frase ?? ''}\nTexto:\n${content.body.texto ?? ''}`,
      }),
  });
  // Uma peça recomendada por desdobramento; outras opções (design/imagem) só sob pedido, com a MESMA frase.
  const alts = distinctAlternatives(gen.variations?.length ? gen.variations : [gen]).slice(0, 1);
  const generation = await aiApi.createGeneration({
    editorial_slug: content.editorial_slug ?? undefined, platform: channel.platform, target_avatar: 'ambos',
    briefing: `Desdobramento de: ${content.title}`, variations_count: alts.length,
  });
  const variations = await aiApi.createVariations(generation.id, alts.map((v, idx) => ({
    idx, quote: v.quote, caption: v.caption, headline_type: v.headline_type_used, analogy: v.analogy_used,
    virality_score: v.virality_score ?? null, virality_reason: v.virality_reason ?? null,
  })));
  const group = crypto.randomUUID();
  const created: UserPost[] = [];
  for (const [idx, v] of alts.entries()) {
    const rows = await db.insert<UserPost>('user_posts', {
      user_id: cycle.user_id, platform: channel.platform, format: 'image', status: 'pending_approval',
      title: editorialName ?? content.title, caption: v.caption,
      carousel_text: { quote: v.quote, headline_type: v.headline_type_used ?? null, analogy: v.analogy_used ?? null, virality_score: v.virality_score ?? null, virality_reason: v.virality_reason ?? null },
      virality_score: v.virality_score ?? null, virality_reason: v.virality_reason ?? null,
      text_approved: true, content_id: content.id, campaign_id: content.campaign_id, cycle_id: content.cycle_id,
      account_id: channel.account_id ?? null, piece_role: 'unfold',
      alternative_group: group, alternative_rank: idx, is_recommended: idx === 0,
      metadata: {
        editorial_slug: content.editorial_slug, target_avatar: 'ambos', review_stage: 'design', batch_id: generation.id,
        ...(v.hive_seed ? { hive_seed: v.hive_seed } : {}), ...(validation ? { reused_from: validation.id, reused_from_platform: validation.platform } : {}),
      },
    });
    const piece = rows[0];
    if (!piece) continue;
    if (variations[idx]) await aiApi.linkVariationToPost(variations[idx].id, piece.id);
    created.push(await renderPiece(userId, piece, { seed: v.hive_seed }));
  }
  return created;
}

// Produz tudo o que falta no ciclo (2 por vez), reportando progresso.
export async function produceCycle(
  userId: string, cycle: CampaignCycle, data: { contents: Content[]; ideas: Idea[]; pieces: UserPost[] },
  editorialName: (slug?: string | null) => string | undefined,
  onProgress?: (done: number, total: number, piece?: UserPost) => void,
): Promise<UserPost[]> {
  const todo = productionTodo(data.contents, data.ideas, data.pieces);
  const tasks: Array<() => Promise<UserPost[]>> = [
    ...todo.validation.map((p) => async () => [await renderPiece(userId, p, { approve: true })]),
    ...todo.unfold.map((t) => () => createUnfold(userId, cycle, t, editorialName(t.content.editorial_slug))),
  ];
  const total = tasks.length;
  let done = 0;
  const out: UserPost[] = [];
  const errors: string[] = [];
  const queue = [...tasks];
  async function worker() {
    while (queue.length) {
      const task = queue.shift()!;
      try {
        const res = await task();
        out.push(...res);
        res.forEach((p) => onProgress?.(done, total, p));
      } catch (e) {
        errors.push((e as Error).message);
      }
      done++;
      onProgress?.(done, total);
    }
  }
  await Promise.all(Array.from({ length: Math.min(2, tasks.length) }, worker));
  if (errors.length) throw new Error(`${errors.length} de ${total} produções falharam: ${errors[0].slice(0, 140)}`);
  return out;
}

// 12B — escolher a direção: a escolhida segue; as demais do grupo são arquivadas.
export async function choosePiece(chosen: UserPost, group: UserPost[]): Promise<void> {
  const others = group.filter((p) => p.id !== chosen.id && p.status !== 'archived').map((p) => p.id);
  if (others.length) await db.update('user_posts', { id: `in.(${others.join(',')})` }, { status: 'archived' });
}

// 12C — ajustar o texto com a Hive (frase ou legenda). Frase nova → re-render no mesmo template.
export async function adjustPieceText(userId: string, piece: UserPost, field: 'titulo' | 'legenda', instruction: string): Promise<UserPost> {
  const quote = (piece.carousel_text?.quote as string | undefined) ?? '';
  const caption = piece.caption ?? '';
  const r = await edge.editText({
    field, text: field === 'titulo' ? quote : caption, instruction, counterpart: field === 'titulo' ? caption : quote,
    editorial_slug: piece.metadata?.editorial_slug as string | undefined, target_platform: piece.platform as 'linkedin' | 'instagram',
  });
  const updated = field === 'titulo'
    ? await updatePiece(piece.id, { carousel_text: { ...(piece.carousel_text ?? {}), quote: r.text }, ai_edit_rounds: (piece.ai_edit_rounds ?? 0) + 1 })
    : await updatePiece(piece.id, { caption: r.text, ai_edit_rounds: (piece.ai_edit_rounds ?? 0) + 1 });
  return field === 'titulo' ? renderPiece(userId, updated, { seed: seedFromDecision(updated.visual_decision) }) : updated;
}

// 12C — edição direta do texto (humana). Frase nova → re-render no mesmo template.
export async function editPieceText(userId: string, piece: UserPost, next: { quote: string; caption: string }): Promise<UserPost> {
  const quoteChanged = next.quote !== ((piece.carousel_text?.quote as string | undefined) ?? '');
  const updated = await updatePiece(piece.id, {
    carousel_text: { ...(piece.carousel_text ?? {}), quote: next.quote }, caption: next.caption, manual_edits: (piece.manual_edits ?? 0) + 1,
  });
  return quoteChanged ? renderPiece(userId, updated, { seed: seedFromDecision(updated.visual_decision) }) : updated;
}

// 12C — "Mantenha tudo e troque apenas essa imagem": novo fundo, mesmo template.
export async function swapPieceImage(userId: string, piece: UserPost, photoAdjust?: string): Promise<UserPost> {
  return renderPiece(userId, piece, { seed: seedFromDecision(piece.visual_decision), forceBg: true, photoAdjust });
}

// 12C — aprovar a peça: aprova também a imagem de IA (a pessoa acabou de revisá-la)
// e mede a edição humana (ai_reviews) contra a variação pristina.
export async function approvePiece(piece: UserPost): Promise<UserPost> {
  const variant = (piece.visual_decision as { variant?: string } | null)?.variant;
  // Foto do Marcos (motor fotográfico): aprovar a peça é a aprovação humana da foto.
  const photoId = (piece.visual_decision as { asset?: { photo_generation_id?: string } } | null)?.asset?.photo_generation_id;
  if (photoId) {
    const g = await getPhotoGeneration(photoId).catch(() => null);
    if (g?.review_status === 'pending') await reviewMarcosPhoto(photoId, 'approve').catch(console.error);
  }
  const approved = await updatePiece(piece.id, {
    status: 'approved', image_status: 'approved', image_approved: true,
    metadata: { ...piece.metadata, review_stage: 'done', ...(AI_IMAGE_VARIANT(variant) ? { bg_approved: true } : {}) },
  });
  // Opção nova (outro design/imagem) tem a MESMA frase da peça de origem: o
  // aprendizado mede a edição humana contra a variação pristina da origem.
  const altOf = piece.metadata?.alt_of as string | undefined;
  const variation = await db.selectOne<AiVariation>('ai_variations', { post_id: `eq.${piece.id}` })
    ?? (altOf ? await db.selectOne<AiVariation>('ai_variations', { post_id: `eq.${altOf}` }) : null);
  if (variation && piece.piece_role === 'unfold') {
    void aiApi.recordReview({
      post_id: piece.id, variation, quote_final: (approved.carousel_text?.quote as string | undefined) ?? '', caption_final: approved.caption ?? '',
    }).catch(console.error);
  }
  return approved;
}

export async function finishProduction(cycle: CampaignCycle): Promise<CampaignCycle> {
  return cycleApi.update(cycle.id, { status: 'ready' });
}

// ---------------- Outras opções (12B): design, imagem ou os dois — mesma frase ----------------
export type VaryMode = 'design' | 'image' | 'both';
const FAMILY_ORDER = ['M01-A', 'M01-B', 'M01-C', 'M01-D', 'M01-E', 'M02-A', 'M02-B', 'M02-C', 'M02-D'];
// Que tipo de imagem cada design carrega: nenhuma, fundo (M01-D/E) ou foto do Marcos (M02).
export function imageKind(variant?: string | null): 'none' | 'bg' | 'photo' {
  if (!variant) return 'none';
  if (variant.startsWith('M02-')) return 'photo';
  if (variant === 'M01-D' || variant === 'M01-E') return 'bg';
  return 'none';
}

// Designs candidatos para uma nova opção. design = mesmo tipo de imagem (a imagem
// atual continua servindo); both = qualquer design ainda não oferecido.
export function variantCandidates(base: string, used: string[], mode: VaryMode): string[] {
  const pool = FAMILY_ORDER.filter((v) => v !== base && !used.includes(v));
  if (mode === 'design') {
    const kind = imageKind(base);
    const sameFamily = base.startsWith('M03') || base.startsWith('M04') ? [] : pool.filter((v) => imageKind(v) === kind);
    return sameFamily;
  }
  if (mode === 'both') {
    const kind = imageKind(base);
    return [...pool.filter((v) => imageKind(v) !== kind), ...pool.filter((v) => imageKind(v) === kind)];
  }
  return [];
}

// Cria `count` opções novas a partir da peça-base (mesma frase e legenda), no mesmo
// grupo de alternativas, e produz os visuais. Devolve as peças novas.
export async function createAlternatives(userId: string, base: UserPost, group: UserPost[], mode: VaryMode, count = 2): Promise<UserPost[]> {
  const baseVariant = (base.visual_decision as { variant?: string } | null)?.variant ?? null;
  if (!baseVariant) throw new Error('A peça ainda não tem design para variar.');
  if (mode === 'image' && imageKind(baseVariant) === 'none') throw new Error('Este design não usa imagem — peça outras opções de design.');
  const used = group.map((p) => (p.visual_decision as { variant?: string } | null)?.variant).filter(Boolean) as string[];
  const variants = mode === 'image' ? Array.from({ length: count }, () => baseVariant) : variantCandidates(baseVariant, used, mode).slice(0, count);
  if (!variants.length) throw new Error(mode === 'design' ? 'Não há outro design compatível com esta imagem.' : 'Todos os designs já foram oferecidos.');
  const groupId = base.alternative_group ?? crypto.randomUUID();
  if (!base.alternative_group) await updatePiece(base.id, { alternative_group: groupId, alternative_rank: 0 });
  let rank = Math.max(0, ...group.map((p) => p.alternative_rank ?? 0));
  const seedBase = seedFromDecision(base.visual_decision);
  const created: UserPost[] = [];
  for (const variant of variants) {
    const meta = { ...(base.metadata ?? {}), alt_mode: mode, alt_of: base.id } as Record<string, unknown>;
    delete meta.bg_approved;
    const rows = await db.insert<UserPost>('user_posts', {
      user_id: base.user_id, platform: base.platform, format: base.format, status: 'pending_approval',
      title: base.title, caption: base.caption, carousel_text: base.carousel_text, virality_score: base.virality_score ?? null, virality_reason: base.virality_reason ?? null,
      text_approved: base.text_approved ?? true, content_id: base.content_id ?? null, campaign_id: base.campaign_id ?? null, cycle_id: base.cycle_id ?? null,
      account_id: base.account_id ?? null, piece_role: base.piece_role ?? null,
      alternative_group: groupId, alternative_rank: ++rank, is_recommended: false, metadata: meta,
    });
    const piece = rows[0];
    if (!piece) continue;
    const seed: HiveSeed = { ...(seedBase as HiveSeed), variant, manifestation: variant.split('-')[0], human_presence_adds_meaning: variant.startsWith('M02-'),
      variant_reason: mode === 'design' ? 'outra opção de design (mesma imagem)' : mode === 'image' ? 'outra opção de imagem (mesmo design)' : 'outra opção de design e imagem' };
    // design: reaproveita a foto/fundo da base; image/both: imagem nova.
    created.push(await renderPiece(userId, { ...piece, visual_decision: mode === 'design' ? (base.visual_decision ?? undefined) : undefined }, { seed, forceBg: mode !== 'design' }));
  }
  return created;
}

// Reprogramar (ou agendar) uma peça aprovada direto da revisão.
export async function reschedulePiece(piece: UserPost, iso: string): Promise<UserPost> {
  return updatePiece(piece.id, { status: 'scheduled', scheduled_date: iso });
}
