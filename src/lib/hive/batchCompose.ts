// Composição da Hive para o fluxo de REVIEW do NewPost, com caches:
//  - o design (recipes/tokens/assets) é carregado uma vez;
//  - a DECISÃO (manifestação+variante+destaque+imagem) é decidida uma vez por
//    post (rede) e reusada nas re-composições locais quando o texto muda.
// Assim a prévia do review já mostra a peça da Hive sem uma chamada por tecla.
//
// M02: a prévia usa a foto REAL escolhida pelo motor (se houver). Quando a peça
// dependeria de GERAR a imagem, a prévia mostra o layout com fundo placeholder —
// a geração acontece ao finalizar (fluxo runVisual), pra não gerar por tecla.

import { edge, type HiveSeed } from '@/lib/edge';
import { loadHiveDesign, type DesignData } from './loadDesign';
import { composeM01, pickM01BgUrl, type ComposedSlide } from './composeM01';
import { analyzeTextZone } from './imageZone';
import { composeM02 } from './composeM02';
import { composeM03 } from './composeM03';
import { ensureM01Asset, clearMarcosGenCache, clearM01AssetCache } from './marcosImage';
import { renderM02Scene, clearM02SceneCache, type M02Place } from './m02Scene';
import { blobFromBase64, uploadDesignAsset, listMarcosPhotos } from './assetLib';

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
  clearM02SceneCache(postId);
}

export async function composeItemSlide(params: {
  postId: string;
  text: string;
  platform?: 'linkedin' | 'instagram';
  editorialSlug?: string;
  // Instagram: a FORMA ja escolhida na geracao (conteudo+template juntos). Quando
  // vem, o hive-decide so executa (sem 2a IA). Sem seed = re-decisao completa.
  seed?: HiveSeed;
}): Promise<{ fabricJson: ComposedSlide; decision: Record<string, unknown> }> {
  const d = await design();

  let dec = _decisions.get(params.postId);
  if (!dec) {
    const { decision } = await edge.hiveDecide({
      text: params.text,
      platform: params.platform,
      editorial_slug: params.editorialSlug,
      post_id: params.postId,
      seed: params.seed,
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
    // Gera a CENA do Marcos num ambiente real (prancha = estilo, foto real =
    // likeness) UMA vez por post (cacheada) — prévia e finalize mostram a mesma.
    const place: M02Place = 'esquerda';
    const decAsset = dec.full.asset as { url?: string } | undefined;
    let likeness = decAsset?.url;
    if (!likeness) {
      const photos = await listMarcosPhotos().catch(() => []);
      likeness = photos[0]?.url;
    }
    if (!likeness) throw new Error('Sem foto do Marcos pra compor a cena do M02.');
    const cacheKey = `${params.postId}|${dec.variant}|${place}`;
    const scene = await renderM02Scene({ variant: dec.variant, place, likenessUrls: [likeness], cacheKey });
    const mime = scene.dataUrl.slice(5, scene.dataUrl.indexOf(';'));
    const { publicUrl } = await uploadDesignAsset(blobFromBase64(scene.dataUrl.split(',')[1], mime));
    fabricJson = composeM02({
      recipe, colors: d.colors, spiralUrl: d.spiralUrl,
      text: params.text, subtitle: (dec.full.subtitle as string | null) ?? null,
      highlight, canvas: { w: 1080, h: 1350 },
      asset: { url: publicUrl, width: scene.width, height: scene.height, espaco_texto: scene.place, texto_cor: 'claro', origin: 'generated', preComposed: true },
    });
    dec.full.asset = { url: publicUrl, width: scene.width, height: scene.height, origin: 'generated', espaco_texto: scene.place, scene: true };
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
    // Posicionamento pós-imagem (D/E): analisa o fundo e leva o texto pra zona
    // de espaço negativo. Sem fundo (A/B/C) → layout null (mantém o recipe).
    const bgUrl = pickM01BgUrl(recipe, assets, params.text);
    const layout = bgUrl ? await analyzeTextZone(bgUrl) : null;
    fabricJson = composeM01({
      recipe, colors: d.colors, spiralUrl: d.spiralUrl, assets,
      text: params.text, highlight, canvas: { w: 1080, h: 1350 }, layout,
    });
  }

  return { fabricJson, decision: dec.full };
}
