// Composição da Hive para o fluxo de REVIEW do NewPost, com caches:
//  - o design (recipes/tokens/assets) é carregado uma vez;
//  - a DECISÃO (variante+destaque) é decidida uma vez por post (rede) e reusada
//    nas re-composições locais quando o texto muda (rápido, sem rede).
// Assim a prévia do review já mostra a peça da Hive sem uma chamada por tecla.

import { edge } from '@/lib/edge';
import { loadM01Design, type DesignData } from './loadDesign';
import { composeM01, type ComposedSlide } from './composeM01';

let _design: Promise<DesignData> | null = null;
function design(): Promise<DesignData> {
  return (_design ??= loadM01Design());
}

interface CachedDecision { variant: string; highlight: { target?: string } | null; full: Record<string, unknown> }
const _decisions = new Map<string, CachedDecision>();

// Zera a decisão de um post — usar quando o CONTEÚDO muda de fato (regeneração
// do post inteiro), pra Hive re-decidir a variante.
export function clearItemDecision(postId: string): void {
  _decisions.delete(postId);
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
  if (!recipe) throw new Error('Sem variação frozen do M01 na base.');

  const allowHl = Boolean(recipe.limites?.destaque_permitido) && dec.highlight?.target;
  const fabricJson = composeM01({
    recipe,
    colors: d.colors,
    spiralUrl: d.spiralUrl,
    assets: d.assets,
    text: params.text,
    highlight: allowHl ? { target: dec.highlight!.target! } : null,
    canvas: { w: 1080, h: 1350 },
  });

  return { fabricJson, decision: dec.full };
}
