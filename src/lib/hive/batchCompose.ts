// Composição da Hive para o fluxo de REVIEW do NewPost, com caches:
//  - o design (recipes/tokens/assets) é carregado uma vez;
//  - a DECISÃO (manifestação+variante+destaque+imagem) é decidida uma vez por
//    post (rede) e reusada nas re-composições locais quando o texto muda.
// Assim a prévia do review já mostra a peça da Hive sem uma chamada por tecla.
//
// M02: a prévia usa a foto REAL escolhida pelo motor (se houver). Quando a peça
// dependeria de GERAR a imagem, a prévia mostra o layout com fundo placeholder —
// a geração acontece ao finalizar (fluxo runVisual), pra não gerar por tecla.

import { edge } from '@/lib/edge';
import { loadHiveDesign, type DesignData } from './loadDesign';
import { composeM01, type ComposedSlide } from './composeM01';
import { composeM02 } from './composeM02';
import { composeM03 } from './composeM03';
import { resolveM02Asset, ensureM01Asset, clearMarcosGenCache, clearM01AssetCache, type DecisionAssetInfo } from './marcosImage';

let _design: Promise<DesignData> | null = null;
function design(): Promise<DesignData> {
  return (_design ??= loadHiveDesign());
}

interface CachedDecision { variant: string; highlight: { target?: string } | null; full: Record<string, unknown> }
const _decisions = new Map<string, CachedDecision>();

// Zera a decisão de um post — usar quando o CONTEÚDO muda de fato (regeneração
// do post inteiro), pra Hive re-decidir a manifestação/variante.
export function clearItemDecision(postId: string): void {
  _decisions.delete(postId);
  clearMarcosGenCache(postId);
  clearM01AssetCache(postId);
}

export async function composeItemSlide(params: {
  postId: string;
  text: string;
  platform?: 'linkedin' | 'instagram';
  editorialSlug?: string;
}): Promise<{ fabricJson: ComposedSlide; decision: Record<string, unknown> }> {
  const d = await design();

  let dec = _decisions.get(params.postId);
  if (!dec) {
    const { decision } = await edge.hiveDecide({
      text: params.text,
      platform: params.platform,
      editorial_slug: params.editorialSlug,
      post_id: params.postId,
    });
    dec = { variant: decision.variant, highlight: decision.highlight, full: decision as Record<string, unknown> };
    _decisions.set(params.postId, dec);
  }

  const recipe = d.variacoes.find((v) => v.id === dec!.variant) ?? d.variacoes[0];
  if (!recipe) throw new Error('Sem variação frozen na base.');

  const allowHl = Boolean(recipe.limites?.destaque_permitido) && dec.highlight?.target;
  const highlight = allowHl ? { target: dec.highlight!.target! } : null;

  let fabricJson: ComposedSlide;
  if (recipe.manifestacao_id === 'M03') {
    fabricJson = composeM03({
      recipe, colors: d.colors, spiralUrl: d.spiralUrl,
      text: params.text, highlight, canvas: { w: 1080, h: 1350 },
      diagram: (dec.full.diagram as { poleA?: string; poleB?: string } | null) ?? null,
    });
  } else if (recipe.manifestacao_id === 'M02') {
    // Usa a foto real do Marcos; se a peça depender de gerar (C/D sem foto real),
    // gera UMA vez (cacheada por post) — assim a prévia e o finalize mostram a
    // mesma imagem. A geração fica na hierarquia (real primeiro; isto é fallback).
    const resolved = await resolveM02Asset(dec.full as unknown as DecisionAssetInfo, { postId: params.postId, generate: true });
    fabricJson = composeM02({
      recipe, colors: d.colors, spiralUrl: d.spiralUrl,
      text: params.text, subtitle: (dec.full.subtitle as string | null) ?? null,
      highlight, canvas: { w: 1080, h: 1350 }, asset: resolved.asset,
    });
    // Grava a fonte da imagem na decisão persistida (diversidade + explicabilidade).
    if (resolved.sourceImageId && resolved.asset) {
      dec.full.asset = {
        url: resolved.asset.url, width: resolved.asset.width, height: resolved.asset.height,
        origin: resolved.asset.origin, espaco_texto: resolved.asset.espaco_texto,
        source_image_id: resolved.sourceImageId,
      };
    }
  } else {
    // M01-D/E com fundo de IA: gera uma vez por post (cacheada) se a biblioteca
    // estiver vazia — assim a prévia e o finalize já mostram a imagem gerada.
    let assets = d.assets;
    if (recipe.id === 'M01-D' && d.assets.photos.length === 0) {
      const a = await ensureM01Asset('photo', params.postId);
      if (a) assets = { ...d.assets, photos: [a] };
    } else if (recipe.id === 'M01-E' && d.assets.textures.length === 0) {
      const a = await ensureM01Asset('texture', params.postId);
      if (a) assets = { ...d.assets, textures: [a] };
    }
    fabricJson = composeM01({
      recipe, colors: d.colors, spiralUrl: d.spiralUrl, assets,
      text: params.text, highlight, canvas: { w: 1080, h: 1350 },
    });
  }

  return { fabricJson, decision: dec.full };
}
