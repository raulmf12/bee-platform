// Motor de imagem do Marcos (M02) — resolve QUAL imagem entra na peça, seguindo
// a HIERARQUIA definida pelo motor de decisão:
//   1. foto REAL do Marcos (ou gerada já existente) — o hive-decide já escolheu
//      e devolveu em `decision.asset`;
//   2. se não houver imagem adequada e a variação permitir (C/D), GERA uma cena
//      plausível e honesta (edge generate-image-ai), sobe na biblioteca como
//      `generated` (vira candidata reusável) e devolve.
//
// A geração só acontece quando `generate:true` (fluxo real) — a prévia não gera
// (evita custo por tecla); nela, sem foto real, a M02 mostra o layout com fundo
// placeholder até finalizar.

import { edge } from '@/lib/edge';
import { imageDims, blobFromBase64, uploadDesignAsset, saveDesignAsset } from './assetLib';
import type { M02Asset } from './composeM02';
import type { DesignAsset } from './composeM01';

// --- M01-D (Campo) / M01-E (Matéria): fundo gerado por IA quando a biblioteca
// não tem asset. Uma geração por (kind, post), cacheada. Vira candidata reusável.
const _m01Cache = new Map<string, DesignAsset>();

export async function ensureM01Asset(kind: 'photo' | 'texture', postId: string): Promise<DesignAsset | null> {
  const key = `${kind}|${postId}`;
  const cached = _m01Cache.get(key);
  if (cached) return cached;
  const prompt = kind === 'photo'
    ? 'Fotografia atmosférica e contemplativa com profundidade real, névoa suave, cores dessaturadas e muito espaço negativo (floresta ao amanhecer, horizonte, caminho na neblina, vale entre montanhas). Sem texto, sem logo, sem pessoas olhando para a câmera. Vertical.'
    : 'Textura orgânica sutil e elegante (sombra de folhas em parede clara, fibra de papel, superfície mineral), baixo contraste, luz suave, fundo predominantemente claro/creme. Sem texto, sem logo.';
  const res = await edge.generateImage({ prompt, aspect_ratio: '3:4', style_hint: 'Marcos Piccini / Bee — sóbrio, silencioso, sistêmico' });
  if (!res.success || !res.image_base64) return null;
  const mime = res.mime_type || 'image/png';
  const dataUrl = `data:${mime};base64,${res.image_base64}`;
  const dims = await imageDims(dataUrl);
  const blob = blobFromBase64(dataUrl.split(',')[1], mime);
  const { path, publicUrl } = await uploadDesignAsset(blob);
  await saveDesignAsset({
    kind, title: `${kind === 'photo' ? 'Campo' : 'Matéria'} — gerada`, url: publicUrl, storage_path: path,
    mime_type: mime, width: dims.w, height: dims.h, origin: 'generated',
    semantic: kind === 'photo' ? { natureza: true, profundidade: 'alta', espaco_texto: 'baixo', generated: true } : { organico: true, sutil: true, generated: true },
    tags: ['m01', 'gerada'],
  });
  const asset: DesignAsset = { url: publicUrl, width: dims.w, height: dims.h };
  _m01Cache.set(key, asset);
  return asset;
}

export function clearM01AssetCache(postId: string): void {
  for (const k of _m01Cache.keys()) if (k.endsWith(`|${postId}`)) _m01Cache.delete(k);
}

export interface DecisionAssetInfo {
  mode?: string;
  variant?: string;
  asset?: {
    id?: string; url: string; width?: number | null; height?: number | null;
    origin?: string; espaco_texto?: string | null; texto_cor?: string | null; source_image_id?: string;
  } | null;
  image_generation?: {
    needed: boolean; prompt: string; forbid?: string[];
    must_have?: Record<string, unknown>; scene_hint?: string;
  } | null;
}

export interface ResolvedM02 {
  asset: M02Asset | null;
  sourceImageId: string | null;   // p/ gravar na visual_decision (diversidade por fonte)
}

// gera no máximo uma vez por (post, variante) — a prévia recompõe a cada tecla.
const _genCache = new Map<string, ResolvedM02>();

export async function resolveM02Asset(
  decision: DecisionAssetInfo,
  opts: { postId?: string; generate?: boolean } = {},
): Promise<ResolvedM02> {
  // 1) O motor já escolheu uma imagem (foto real, adaptada ou gerada existente).
  if (decision.asset?.url) {
    return {
      asset: {
        url: decision.asset.url,
        width: decision.asset.width ?? null,
        height: decision.asset.height ?? null,
        espaco_texto: decision.asset.espaco_texto ?? null,
        texto_cor: decision.asset.texto_cor ?? null,
        origin: decision.asset.origin,
      },
      sourceImageId: decision.asset.source_image_id ?? decision.asset.id ?? null,
    };
  }

  const gen = decision.image_generation;
  if (!gen?.needed || !opts.generate) return { asset: null, sourceImageId: null };

  const key = `${opts.postId ?? 'nopost'}|${decision.variant ?? 'v'}`;
  const cached = _genCache.get(key);
  if (cached) return cached;

  const prompt = [gen.prompt, gen.forbid?.length ? `Evite: ${gen.forbid.join(', ')}.` : '']
    .filter(Boolean).join(' ');
  const res = await edge.generateImage({
    prompt,
    aspect_ratio: '3:4',
    style_hint: 'Marcos Piccini / Bee — sóbrio, real, luz natural, sem estética de banco de imagens',
  });
  if (!res.success || !res.image_base64) throw new Error('A IA não retornou a imagem do Marcos.');

  const mime = res.mime_type || 'image/png';
  const dataUrl = `data:${mime};base64,${res.image_base64}`;
  const dims = await imageDims(dataUrl);

  // Sobe na biblioteca (design bucket, mesma origem -> CORS ok pro render) como
  // 'generated': vira candidata reusável e a diversidade passa a contá-la por fonte.
  const blob = blobFromBase64(dataUrl.split(',')[1], mime);
  const { path, publicUrl } = await uploadDesignAsset(blob);
  const semantic = { ...(gen.must_have ?? {}), espaco_texto: 'baixo', generated: true, person: 'marcos' };
  const id = await saveDesignAsset({
    kind: 'photo', title: `M02 ${decision.variant ?? ''} — gerada`.trim(), url: publicUrl, storage_path: path,
    mime_type: mime, width: dims.w, height: dims.h,
    origin: 'generated', semantic, tags: ['m02', 'gerada'], person_slug: 'marcos',
  });

  const resolved: ResolvedM02 = {
    asset: { url: publicUrl, width: dims.w, height: dims.h, espaco_texto: 'baixo', origin: 'generated' },
    sourceImageId: id || null,
  };
  _genCache.set(key, resolved);
  return resolved;
}

export function clearMarcosGenCache(postId: string, variant?: string): void {
  if (variant) { _genCache.delete(`${postId}|${variant}`); return; }
  for (const k of _genCache.keys()) if (k.startsWith(`${postId}|`)) _genCache.delete(k);
}
