// Renderiza o Fabric JSON JÁ HIDRATADO de um post numa imagem PNG (data URL).
//
// Diferente do thumbnail.ts (que parte de um template_config e hidrata), aqui o
// post já tem o canvas pronto em carousel_fabric_json — é só carregar e exportar.
// Usos: dar à persona uma imagem pra "ver" (downscaled) e rasterizar o post em
// full-res antes de publicar/agendar.
//
// IMPORTANTE: o slide hidratado (carousel_fabric_json[0]) NÃO carrega width/height
// próprios — só version/background/objects. As dimensões vêm do tamanho do layout
// (getLayoutDimensions), então quem chama precisa informá-las.

import * as fabric from 'fabric';
import { ensureFontsLoaded } from './layout';
import { getLayoutDimensions, type BeeQuoteSize } from './beeQuote';

// Largura de saída pra visão da persona — vai por rede pro modelo, não precisa 1080.
const PERSONA_OUT_WIDTH = 640;

// ============================================================================
// PRÉ-CARGA DE IMAGENS — a causa do "post bugado" na geração.
//
// O fundo de IA é um PNG pesado (~1,4 MB) servido SEM cache. O Fabric monta o
// canvas e exporta; se esse download não terminou/decodificou a tempo, a peça
// sai com a imagem faltando (fundo azul-marinho vazando) — ou o render volta
// null. O editor ao vivo "conserta" só porque fica renderizando até a imagem
// carregar. Aqui garantimos, ANTES de montar o canvas, que TODA imagem do slide
// está baixada e decodificada (aquece o cache do browser + valida). Se alguma
// não carregar após 1 retry, LANÇAMOS — nada bugado/nu passa silenciosamente.
// ============================================================================

function collectImageSources(fabricJson: object): string[] {
  const objs = (fabricJson as { objects?: Array<{ type?: string; src?: string }> }).objects ?? [];
  const srcs: string[] = [];
  for (const o of objs) {
    if ((o.type ?? '').toLowerCase() === 'image' && typeof o.src === 'string' && o.src) {
      srcs.push(o.src);
    }
  }
  return srcs;
}

function loadOneImage(src: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Casa com o crossOrigin que o Fabric usa ao hidratar — assim a entrada de
    // cache aquecida aqui é a MESMA que o loadFromJSON vai reaproveitar.
    img.crossOrigin = 'anonymous';
    let settled = false;
    const timer = setTimeout(() => finish(false, new Error(`timeout: ${src.slice(0, 80)}`)), timeoutMs);
    function finish(ok: boolean, err?: Error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (ok && img.naturalWidth > 0) resolve();
      else reject(err ?? new Error(`falha ao carregar: ${src.slice(0, 80)}`));
    }
    img.onload = () => {
      // decode() garante os bytes prontos pra pintar; se falhar, o onload já basta.
      if (typeof img.decode === 'function') {
        img.decode().then(() => finish(true)).catch(() => finish(true));
      } else {
        finish(true);
      }
    };
    img.onerror = () => finish(false);
    img.src = src;
  });
}

// Pré-carrega todas as imagens do slide (fundo IA, espiral, fotos). Cada uma tem
// timeout e 1 retry (a falha costuma ser transitória — rede/cache frio). Exportada
// pra prévia da revisão (StaticCanvasPreview) usar o MESMO aquecimento.
export async function preloadFabricImages(
  fabricJson: object,
  opts?: { timeoutMs?: number; retries?: number },
): Promise<void> {
  const timeoutMs = opts?.timeoutMs ?? 12_000;
  const retries = opts?.retries ?? 1;
  const srcs = collectImageSources(fabricJson);
  await Promise.all(
    srcs.map(async (src) => {
      let lastErr: unknown;
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          await loadOneImage(src, timeoutMs);
          return;
        } catch (e) {
          lastErr = e;
        }
      }
      throw lastErr instanceof Error ? lastErr : new Error(`Imagem não carregou: ${src.slice(0, 80)}`);
    }),
  );
}

// Núcleo compartilhado: carrega o fabric JSON num StaticCanvas off-DOM e exporta PNG.
// width/height são as dimensões REAIS do canvas; multiplier escala a saída (1 = full-res).
export async function renderFabricToDataUrl(
  fabricJson: object,
  opts: { width: number; height: number; multiplier?: number; format?: 'png' | 'jpeg'; quality?: number },
): Promise<string | null> {
  try {
    // A frase do Bee Quote é Playfair — sem ela a medição/render sai torto.
    // Inter é o apoio (M03) e Playfair 500 entra em títulos leves; garante ambas.
    await ensureFontsLoaded([
      { family: 'Playfair Display', weight: 'bold' },
      { family: 'Playfair Display', weight: '500' },
      { family: 'Inter', weight: '400' },
      { family: 'Inter', weight: '600' },
    ]);
    // Garante que TODAS as imagens (fundo IA pesado, espiral, fotos) estão baixadas
    // e decodificadas ANTES de montar o canvas. Sem isso, o export pode sair sem a
    // imagem de fundo (peça "bugada") ou falhar. Lança se alguma não carregar → o
    // chamador trata como erro em vez de persistir/agendar uma peça quebrada.
    await preloadFabricImages(fabricJson);
    const el = document.createElement('canvas');
    const bg = (fabricJson as { background?: string }).background ?? '#FFFFFF';
    const c = new fabric.StaticCanvas(el, {
      width: opts.width,
      height: opts.height,
      backgroundColor: bg,
    });
    try {
      await c.loadFromJSON(fabricJson);
      c.renderAll();
      // JPEG (menor + exigido pelo Instagram) quando pedido; PNG por padrão.
      // JPEG não tem alfa — pinta o fundo do slide antes pra não sair preto.
      const format = opts.format ?? 'png';
      return c.toDataURL({ format, quality: opts.quality ?? (format === 'jpeg' ? 0.9 : 0.92), multiplier: opts.multiplier ?? 1 });
    } finally {
      void c.dispose();
    }
  } catch (e) {
    console.error('[renderFabricToDataUrl]', e);
    return null;
  }
}

// Visão da persona: PNG downscaled. Passe o tamanho do post pra não distorcer
// (o JSON não carrega dims; sem isso um post 'square' sairia com aspecto errado).
export async function renderPostImage(
  fabricJson: object | undefined,
  size: BeeQuoteSize = 'portrait',
): Promise<string | null> {
  if (!fabricJson) return null;
  const { width, height } = getLayoutDimensions(size);
  return renderFabricToDataUrl(fabricJson, { width, height, multiplier: PERSONA_OUT_WIDTH / width });
}
