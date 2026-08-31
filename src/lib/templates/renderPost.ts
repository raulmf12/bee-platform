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
