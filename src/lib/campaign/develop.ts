// Desenvolvimento e validação do conteúdo-mãe (Telas 10–11).
// Ciclo de aprendizado preservado: cada versão gerada pela IA vira uma
// ai_variation PRISTINA; na validação, ai_reviews mede quanto o humano editou.
import { db } from '@/lib/db';
import { aiApi } from '@/lib/api';
import { edge } from '@/lib/edge';
import { contentApi, cycleApi, ideaApi } from '@/lib/campaignApi';
import type {
  AiVariation, Campaign, CampaignCycle, Content, ContentBody, Idea, UserPost,
} from '@/types';

type DevResult = Awaited<ReturnType<typeof edge.contentDevelop>>;

async function registerAiVersion(idea: Idea, r: DevResult): Promise<{ generation_id: string; variation_id: string }> {
  const generation = await aiApi.createGeneration({
    editorial_slug: idea.editorial_slug ?? undefined, platform: 'linkedin', target_avatar: 'ambos',
    briefing: `Ideia-mãe: ${idea.title}`, variations_count: 1,
  });
  const [variation] = await aiApi.createVariations(generation.id, [{
    idx: 0, quote: r.frase, caption: r.texto,
    headline_type: r.meta.headline_type ?? undefined, analogy: r.meta.analogy ?? undefined,
    virality_score: r.meta.virality_score, virality_reason: r.meta.virality_reason,
  }]);
  return { generation_id: generation.id, variation_id: variation.id };
}

// Desenvolve em paralelo (3 por vez) as ideias aprovadas que ainda não têm conteúdo.
export async function developIdeas(
  cycle: CampaignCycle, ideas: Idea[], existing: Content[],
  onProgress?: (done: number, total: number, content?: Content) => void,
): Promise<{ contents: Content[]; cycle: CampaignCycle }> {
  const todo = ideas.filter((i) => i.status === 'approved' && !existing.some((c) => c.idea_id === i.id));
  const updatedCycle = cycle.status === 'pauta_approved' ? await cycleApi.update(cycle.id, { status: 'developing' }) : cycle;
  const created: Content[] = [];
  let done = 0;
  const queue = [...todo];
  async function worker() {
    while (queue.length) {
      const idea = queue.shift()!;
      const r = await edge.contentDevelop({ idea_id: idea.id, mode: 'develop' });
      const ids = await registerAiVersion(idea, r);
      const content = await contentApi.create({
        idea_id: idea.id, campaign_id: cycle.campaign_id, cycle_id: cycle.id,
        title: idea.title, strategic_function: idea.strategic_function ?? null, editorial_slug: idea.editorial_slug ?? null,
        body: { frase: r.frase, texto: r.texto }, considered: r.considered, status: 'pending_validation',
        versions: [{ at: new Date().toISOString(), body: { frase: r.frase, texto: r.texto }, note: 'Hive' }],
        position: idea.position,
        metadata: {
          ...ids, ai_rounds: 0, manual_edits: 0, qa_score: r.meta.qa_score, virality_score: r.meta.virality_score,
          virality_reason: r.meta.virality_reason, headline_type: r.meta.headline_type, analogy: r.meta.analogy,
        },
      });
      await ideaApi.update(idea.id, { status: 'developed' });
      created.push(content);
      done++;
      onProgress?.(done, todo.length, content);
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, todo.length) }, worker));
  return { contents: created, cycle: updatedCycle };
}

// "Ajustar com a Hive" / "Nova versão": nova versão da IA = nova variação pristina.
export async function reviseWithHive(content: Content, idea: Idea, mode: 'adjust' | 'new_version', instruction?: string): Promise<Content> {
  const r = await edge.contentDevelop({ idea_id: idea.id, mode, current: content.body, instruction });
  const ids = await registerAiVersion(idea, r);
  const body = { frase: r.frase, texto: r.texto };
  return contentApi.update(content.id, {
    body, considered: r.considered,
    versions: [...content.versions, { at: new Date().toISOString(), body, note: mode === 'adjust' ? `Ajuste: ${instruction}` : 'Nova versão' }],
    metadata: {
      ...content.metadata, ...ids, ai_rounds: (content.metadata?.ai_rounds ?? 0) + 1, qa_score: r.meta.qa_score,
      virality_score: r.meta.virality_score, virality_reason: r.meta.virality_reason, headline_type: r.meta.headline_type, analogy: r.meta.analogy,
    },
  });
}

// "Editar diretamente": edição humana (não cria variação — a validação mede o drift).
export async function editContent(content: Content, body: ContentBody): Promise<Content> {
  return contentApi.update(content.id, {
    body,
    versions: [...content.versions, { at: new Date().toISOString(), body, note: 'Edição manual' }],
    metadata: { ...content.metadata, manual_edits: (content.metadata?.manual_edits ?? 0) + 1 },
  });
}

// BEE-DDMMAA-G{global}-D{dia} — mesma nomenclatura do fluxo antigo.
export async function nextCodigo(offset = 0): Promise<string> {
  const rows = await db.select<{ created_at: string }>('user_posts', { select: 'created_at' });
  const now = new Date();
  const sameDay = (iso: string) => { const d = new Date(iso); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate(); };
  const dd = String(now.getDate()).padStart(2, '0'), mm = String(now.getMonth() + 1).padStart(2, '0'), yy = String(now.getFullYear()).slice(-2);
  return `BEE-${dd}${mm}${yy}-G${rows.length + 1 + offset}-D${rows.filter((r) => sameDay(r.created_at)).length + 1 + offset}`;
}

// Aprovar o conteúdo: valida a linha de pensamento. Se a ideia tem LinkedIn
// (formato de validação do Marcos), a peça do LinkedIn nasce com o texto
// aprovado (text_approved) — o visual M01-A é produzido na etapa seguinte.
export async function validateContent(
  content: Content, idea: Idea | undefined, campaign: Campaign, editorialName?: string,
): Promise<{ content: Content; piece: UserPost | null }> {
  const li = idea?.channels.find((c) => c.platform === 'linkedin');
  let piece: UserPost | null = null;
  if (li) {
    const meta = content.metadata ?? {};
    const rows = await db.insert<UserPost>('user_posts', {
      user_id: campaign.user_id,
      platform: 'linkedin', format: 'image', status: 'pending_approval',
      title: editorialName ?? content.title,
      caption: content.body.texto ?? '',
      carousel_text: {
        quote: content.body.frase ?? '', headline_type: meta.headline_type ?? null, analogy: meta.analogy ?? null,
        virality_score: meta.virality_score ?? null, virality_reason: meta.virality_reason ?? null,
      },
      codigo: await nextCodigo(),
      virality_score: meta.virality_score ?? null, virality_reason: meta.virality_reason ?? null,
      ai_edit_rounds: meta.ai_rounds ?? 0, manual_edits: meta.manual_edits ?? 0,
      text_approved: true,
      content_id: content.id, campaign_id: content.campaign_id, cycle_id: content.cycle_id, account_id: li.account_id ?? null,
      piece_role: 'validation',
      metadata: {
        editorial_slug: content.editorial_slug, target_avatar: 'ambos', review_stage: 'design',
        titulo_status: 'approved', legenda_status: 'approved', batch_id: meta.generation_id,
      },
    });
    piece = rows[0] ?? null;
    if (piece && meta.variation_id) {
      await aiApi.linkVariationToPost(meta.variation_id, piece.id);
      const variation = await db.selectOne<AiVariation>('ai_variations', { id: `eq.${meta.variation_id}` });
      if (variation) {
        void aiApi.recordReview({ post_id: piece.id, variation, quote_final: content.body.frase ?? '', caption_final: content.body.texto ?? '' })
          .catch(console.error);
      }
    }
  }
  const updated = await contentApi.update(content.id, {
    status: 'validated', metadata: { ...content.metadata, ...(piece ? { validation_post_id: piece.id } : {}) },
  });
  return { content: updated, piece };
}

export async function discardContent(content: Content): Promise<Content> {
  if (content.idea_id) await ideaApi.update(content.idea_id, { status: 'discarded' });
  return contentApi.update(content.id, { status: 'discarded' });
}

export async function finishValidation(cycle: CampaignCycle): Promise<CampaignCycle> {
  return cycleApi.update(cycle.id, { status: 'producing' });
}
