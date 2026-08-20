// Orquestrador da Hive (Etapa 3, ponta a ponta) para UM post:
//   texto aprovado -> hive-decide (variante + destaque) -> composeM01 (camadas)
//   -> render Fabric -> upload -> devolve slide + imagem + decisão.
//
// Quem chama (ex: PostEditor) grava no post: carousel_fabric_json, rendered_slides,
// visual_decision e image_status='pending' — e pode carregar o slide no editor.
//
// Canvas v1 = feed 1080x1350 (serve Instagram E LinkedIn).

import { edge } from '@/lib/edge';
import { loadM01Design } from './loadDesign';
import { composeM01, type ComposedSlide } from './composeM01';
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
}): Promise<HiveVisualResult> {
  const text = params.text.trim();
  if (!text) throw new Error('Sem texto pra compor a imagem.');

  // 1) Decisão (a IA lê as regras da base e escolhe variante/destaque).
  const { decision } = await edge.hiveDecide({
    text,
    platform: params.platform,
    editorial_slug: params.editorialSlug,
    target_avatar: params.targetAvatar,
    post_id: params.postId,
  });

  // 2) Composição: pega a receita frozen da variante escolhida.
  const design = await loadM01Design();
  const recipe = design.variacoes.find((v) => v.id === decision.variant) ?? design.variacoes[0];
  if (!recipe) throw new Error('Nenhuma variação frozen do M01 na base.');

  const allowHl = Boolean(recipe.limites?.destaque_permitido) && decision.highlight?.target;
  const slide = composeM01({
    recipe,
    colors: design.colors,
    spiralUrl: design.spiralUrl,
    text,
    highlight: allowHl ? { target: decision.highlight!.target } : null,
    canvas: CANVAS,
  });

  // 3) Render (full-res) + upload.
  const dataUrl = await renderFabricToDataUrl(slide, { width: CANVAS.w, height: CANVAS.h });
  if (!dataUrl) throw new Error('Falha ao renderizar a imagem da Hive.');

  const { publicUrl } = await uploadAssetImage({
    userId: params.userId,
    assetId: params.postId,
    dataUrl,
    filename: 'hive-render.png',
  });

  return { slide, dataUrl, publicUrl, decision };
}
