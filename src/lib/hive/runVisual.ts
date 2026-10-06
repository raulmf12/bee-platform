// Orquestrador da Hive (Etapa 3, ponta a ponta) para UM post:
//   texto aprovado -> hive-decide (manifestação M01/M02 + variante + destaque
//   + imagem na hierarquia) -> compositor (M01 gráfico/textura, M02 foto do
//   Marcos) -> render Fabric -> upload -> devolve slide + imagem + decisão.
//
// Quem chama (ex: PostEditor) grava no post: carousel_fabric_json, rendered_slides,
// visual_decision e image_status='pending' — e pode carregar o slide no editor.
//
// Canvas v1 = feed 1080x1350 (serve Instagram E LinkedIn).

import { edge, type HiveSeed } from '@/lib/edge';
import { loadHiveDesign } from './loadDesign';
import { composeM01, pickM01BgUrl, type ComposedSlide } from './composeM01';
import { analyzeTextZone, clearZoneCache } from './imageZone';
import { composeM02 } from './composeM02';
import { composeM03 } from './composeM03';
import { ensureM01Asset, clearM01AssetCache } from './marcosImage';
import { generateMarcosPhoto, TEXT_SPACE_TO_PLACE } from './marcosPhoto';
import { imageDims, listMarcosPhotos } from './assetLib';
import { renderFabricToDataUrl } from '@/lib/templates/renderPost';
import { uploadAssetImage } from '@/lib/storage';

const CANVAS = { w: 1080, h: 1350 };

export interface HiveVisualResult {
  slide: ComposedSlide;
  dataUrl: string;
  publicUrl: string;
  decision: Awaited<ReturnType<typeof edge.hiveDecide>>['decision'];
}

export async function generateHiveImage(params: {
  userId: string;
  postId: string;
  text: string;                          // texto aprovado (frase da imagem)
  platform?: 'linkedin' | 'instagram';
  editorialSlug?: string;
  targetAvatar?: string;
  // Modo execução: mantém a variante já escolhida (não re-decide). Usado pra
  // "Regenerar fundo" — quer OUTRO fundo, mas o MESMO template.
  seed?: HiveSeed;
  // Força um fundo de IA novo (M01-D/E): ignora o pool e gera do zero.
  forceBg?: boolean;
  // Texto-mãe completo (legenda): o motor fotográfico lê o conteúdo inteiro, não só a frase.
  context?: string;
  // Decisão visual anterior do post: re-render sem forceBg reaproveita a foto do Marcos já gerada.
  previousDecision?: Record<string, unknown> | null;
  // Pedido de ajuste do revisor (motor fotográfico) — gera de novo aplicando a nota.
  photoAdjust?: string;
}): Promise<HiveVisualResult> {
  const text = params.text.trim();
  if (!text) throw new Error('Sem texto pra compor a imagem.');

  // 1) Decisão (a IA lê as regras da base e escolhe manifestação/variante/destaque
  //    + a imagem na hierarquia: foto real do Marcos primeiro, gerar só se preciso).
  //    Com seed, executa a variante fixa (sem re-decidir).
  const { decision } = await edge.hiveDecide({
    text,
    platform: params.platform,
    editorial_slug: params.editorialSlug,
    target_avatar: params.targetAvatar,
    post_id: params.postId,
    seed: params.seed,
  });

  // 2) Composição: pega a receita frozen da variante escolhida (M01 ou M02).
  const design = await loadHiveDesign();
  const recipe = design.variacoes.find((v) => v.id === decision.variant) ?? design.variacoes[0];
  if (!recipe) throw new Error('Nenhuma variação frozen na base.');

  const allowHl = Boolean(recipe.limites?.destaque_permitido) && decision.highlight?.target;
  const highlight = allowHl ? { target: decision.highlight!.target } : null;

  let slide: ComposedSlide;
  if (recipe.manifestacao_id === 'M03') {
    slide = composeM03({
      recipe, colors: design.colors, spiralUrl: design.spiralUrl,
      text, highlight, canvas: CANVAS, diagram: decision.diagram ?? null,
    });
  } else if (recipe.manifestacao_id === 'M02') {
    // MOTOR FOTOGRÁFICO DO MARCOS (docs/fotografia/01–06): estilo F01–F04,
    // identidade travada pelas referências por nível, portões de qualidade e
    // aprovação humana. Menor fabricação: se o texto pede prova real (ou nenhum
    // estilo foi aprovado ainda), usa uma FOTO REAL dele — nunca inventa.
    const prev = (params.previousDecision?.asset ?? null) as { url?: string; photo_generation_id?: string; espaco_texto?: string; width?: number; height?: number; origin?: string } | null;
    let asset: { url: string; width: number | null; height: number | null; espaco_texto: string; texto_cor: string; origin: string; preComposed?: boolean };
    let photoMeta: Record<string, unknown> = {};
    if (params.seed && !params.forceBg && !params.photoAdjust && prev?.url && prev.photo_generation_id) {
      asset = { url: prev.url, width: prev.width ?? null, height: prev.height ?? null, espaco_texto: prev.espaco_texto ?? 'esquerda', texto_cor: 'claro', origin: 'generated', preComposed: true };
      photoMeta = { photo_generation_id: prev.photo_generation_id };
    } else {
      const r = await generateMarcosPhoto({ text: [params.context, text].filter(Boolean).join('\n\n'), postId: params.postId, adjustNote: params.photoAdjust });
      if (r.status === 'generated' && r.generation.image_url) {
        const g = r.generation;
        const url = g.image_url as string;
        const dims = await imageDims(url).catch(() => ({ w: 0, h: 0 }));
        asset = { url, width: dims.w || null, height: dims.h || null, espaco_texto: TEXT_SPACE_TO_PLACE[g.text_space] ?? 'esquerda', texto_cor: 'claro', origin: 'generated', preComposed: true };
        photoMeta = { photo_generation_id: g.id, photo_style: g.style_id, photo_variant: g.variant_id, photo_auto_status: g.auto_status, photo_attempts: r.attempts.length };
      } else {
        const real = decision.asset?.url ? decision.asset : (await listMarcosPhotos().catch(() => [])).find((p) => p.is_active !== false && p.origin === 'real');
        if (!real?.url) throw new Error('Sem foto real do Marcos para este post.');
        const tags = (real as { semantic?: { espaco_texto?: string; texto_cor?: string } }).semantic;
        asset = { url: real.url, width: (real as { width?: number }).width ?? null, height: (real as { height?: number }).height ?? null,
          espaco_texto: (decision.asset?.espaco_texto ?? tags?.espaco_texto ?? 'esquerda') as string, texto_cor: (decision.asset?.texto_cor ?? tags?.texto_cor ?? 'claro') as string, origin: 'real' };
        photoMeta = { photo_origin: 'real', photo_fallback: r.status === 'needs_real_photo' ? `prova real: ${r.reason}` : 'nenhum estilo fotográfico aprovado ainda' };
      }
    }
    slide = composeM02({
      recipe, colors: design.colors, spiralUrl: design.spiralUrl,
      text, subtitle: decision.subtitle ?? null, highlight, canvas: CANVAS, asset,
    });
    (decision as Record<string, unknown>).asset = { ...asset, ...photoMeta };
  } else {
    // M01-D (Campo) e M01-E (Matéria) têm fundo de IA: se a biblioteca não tem
    // asset, gera um agora (senão fica placeholder). Demais M01 = sem imagem.
    // forceBg = "Regenerar fundo": ignora o pool e gera um novo do zero.
    let assets = design.assets;
    const isD = recipe.id === 'M01-D', isE = recipe.id === 'M01-E';
    if (params.forceBg && (isD || isE)) {
      clearM01AssetCache(params.postId);
      const a = await ensureM01Asset(isD ? 'photo' : 'texture', params.postId);
      if (a) { assets = isD ? { ...design.assets, photos: [a] } : { ...design.assets, textures: [a] }; clearZoneCache(a.url); }
    } else if (isD && design.assets.photos.length === 0) {
      const a = await ensureM01Asset('photo', params.postId);
      if (a) assets = { ...design.assets, photos: [a] };
    } else if (isE && design.assets.textures.length === 0) {
      const a = await ensureM01Asset('texture', params.postId);
      if (a) assets = { ...design.assets, textures: [a] };
    }
    // Posicionamento pós-imagem (D/E): leva o texto pra zona de espaço negativo.
    const bgUrl = pickM01BgUrl(recipe, assets, text);
    const layout = bgUrl ? await analyzeTextZone(bgUrl) : null;
    slide = composeM01({
      recipe, colors: design.colors, spiralUrl: design.spiralUrl, assets,
      text, highlight, canvas: CANVAS, layout,
    });
  }

  // 3) Render (full-res, JPEG p/ publicar — Instagram exige, LinkedIn aceita) + upload.
  const dataUrl = await renderFabricToDataUrl(slide, { width: CANVAS.w, height: CANVAS.h, format: 'jpeg' });
  if (!dataUrl) throw new Error('Falha ao renderizar a imagem da Hive.');

  const { publicUrl } = await uploadAssetImage({
    userId: params.userId,
    assetId: params.postId,
    dataUrl,
    filename: 'hive-render.png',
  });

  return { slide, dataUrl, publicUrl, decision };
}
