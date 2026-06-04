// Template "Bee Quote" — fundo branco + frase navy serif + espiral honey.
// Padrao das publicacoes da Bee Consulting (formato 4:5, 1:1 e 1.91:1).
//
// Como funciona (igual ao carrossel-ia):
//  - Definimos o JSON Fabric.js do template com placeholders.
//  - hydrateBeeQuote() recebe { quote, sizeId } e devolve o JSON pronto pra
//    canvas.loadFromJSON().
//  - Aplica autofit: reduz fontSize ate a frase caber no numero de linhas.

export type BeeQuoteSize = 'square' | 'landscape' | 'portrait';

export interface BeeQuoteVariables {
  quote: string;
  sizeId: BeeQuoteSize;
}

interface LayoutSpec {
  width: number;
  height: number;
  // textbox
  textTopRatio: number;       // posicao Y (centroide) da textbox em % da altura
  textWidthRatio: number;     // largura da textbox em % da largura
  initialFontSize: number;
  minFontSize: number;
  maxLines: number;
  // logo
  logoTopRatio: number;
  logoSide: number;           // lado em px do sprite final no canvas
}

// Cada tamanho do LinkedIn imagem-unica tem seu layout proprio
const LAYOUTS: Record<BeeQuoteSize, LayoutSpec> = {
  // 4:5 — formato padrao da imagem que o usuario mandou
  portrait: {
    width: 1080,
    height: 1350,
    textTopRatio: 0.50,
    textWidthRatio: 0.86,
    initialFontSize: 60,
    minFontSize: 30,
    maxLines: 4,
    logoTopRatio: 0.83,
    logoSide: 150,
  },
  // 1:1
  square: {
    width: 1200,
    height: 1200,
    textTopRatio: 0.48,
    textWidthRatio: 0.84,
    initialFontSize: 64,
    minFontSize: 32,
    maxLines: 4,
    logoTopRatio: 0.83,
    logoSide: 170,
  },
  // 1.91:1
  landscape: {
    width: 1200,
    height: 628,
    textTopRatio: 0.46,
    textWidthRatio: 0.78,
    initialFontSize: 56,
    minFontSize: 28,
    maxLines: 3,
    logoTopRatio: 0.86,
    logoSide: 110,
  },
};

const NAVY = '#2D4A5C';
const WHITE = '#FFFFFF';
const FONT = 'Playfair Display';
const QUOTE_CONTENT_KEY = 'bee-quote';

// PNG oficial da espiral Bee — fica em public/bee-spiral.png.
// Sprite quadrado 1080x1080.
export const BEE_SPIRAL_URL = '/bee-spiral.png';
const BEE_SPIRAL_NATIVE = 1080;

// ---------------------------------------------------------------------------
// AUTOFIT — reduz fontSize ate o texto caber em maxLines.
// Heuristica: serif bold tem largura media ~0.50 do fontSize por char.
// Nao eh preciso, mas eh rapido e funciona pra frases curtas a medias.
// ---------------------------------------------------------------------------
export function autofitFontSize(
  text: string,
  maxWidth: number,
  maxLines: number,
  initialFontSize: number,
  minFontSize: number,
): number {
  const segments = text.split(/\r?\n/);
  const avgCharRatio = 0.50; // Playfair Display Bold aprox.

  let fontSize = initialFontSize;
  while (fontSize >= minFontSize) {
    const charsPerLine = Math.max(8, Math.floor(maxWidth / (fontSize * avgCharRatio)));
    let totalLines = 0;
    for (const seg of segments) {
      // wrap simples por palavra
      const words = seg.split(' ');
      let currentLineLen = 0;
      let lines = 1;
      for (const w of words) {
        const wlen = w.length + 1;
        if (currentLineLen + wlen > charsPerLine && currentLineLen > 0) {
          lines += 1;
          currentLineLen = wlen;
        } else {
          currentLineLen += wlen;
        }
      }
      totalLines += lines;
    }
    if (totalLines <= maxLines) return fontSize;
    fontSize -= 2;
  }
  return minFontSize;
}

// ---------------------------------------------------------------------------
// HYDRATE — devolve um objeto compativel com canvas.loadFromJSON().
// ---------------------------------------------------------------------------
export function hydrateBeeQuote({ quote, sizeId }: BeeQuoteVariables): object {
  const layout = LAYOUTS[sizeId];
  const { width, height } = layout;

  const textWidth = Math.round(width * layout.textWidthRatio);
  const fontSize = autofitFontSize(
    quote || 'Sua frase aqui',
    textWidth,
    layout.maxLines,
    layout.initialFontSize,
    layout.minFontSize,
  );
  const textboxHeightEstimate = fontSize * 1.35 * layout.maxLines;
  const textTopCenter = height * layout.textTopRatio;
  const textTop = Math.round(textTopCenter - textboxHeightEstimate / 2);

  const logoSide = layout.logoSide;
  const logoLeft = Math.round((width - logoSide) / 2);
  const logoTop = Math.round(height * layout.logoTopRatio - logoSide / 2);
  const logoScale = logoSide / BEE_SPIRAL_NATIVE;

  return {
    version: '6.0.0',
    background: WHITE,
    objects: [
      // Frase principal
      {
        type: 'Textbox',
        version: '6.0.0',
        text: quote || 'Sua frase aqui',
        left: Math.round((width - textWidth) / 2),
        top: textTop,
        width: textWidth,
        fontSize,
        fontFamily: FONT,
        fontWeight: 'bold',
        fill: NAVY,
        textAlign: 'center',
        lineHeight: 1.25,
        editable: true,
        // tags pra identificar este textbox depois
        name: QUOTE_CONTENT_KEY,
      },
      // Logo espiral honey (PNG oficial)
      {
        type: 'Image',
        version: '6.0.0',
        src: BEE_SPIRAL_URL,
        crossOrigin: 'anonymous',
        left: logoLeft,
        top: logoTop,
        scaleX: logoScale,
        scaleY: logoScale,
        name: 'bee-spiral',
      },
    ],
  };
}

// Constante exportada pra outros modulos identificarem o textbox da frase
export const BEE_QUOTE_NAME = QUOTE_CONTENT_KEY;

export function getLayoutDimensions(sizeId: BeeQuoteSize): { width: number; height: number } {
  const l = LAYOUTS[sizeId];
  return { width: l.width, height: l.height };
}

// ---------------------------------------------------------------------------
// TEMPLATE_CONFIG — formato pra salvar em post_templates.template_config
// (espelha §8.1 da doc carrossel-ia, adaptado pra 1 slide).
// ---------------------------------------------------------------------------
export function buildBeeQuoteTemplateConfig(sizeId: BeeQuoteSize = 'portrait') {
  const { width, height } = LAYOUTS[sizeId];
  const slide = hydrateBeeQuote({ quote: 'Sua frase aqui', sizeId });
  return {
    width,
    height,
    slides_json: [slide],
    slides: {
      slide1: {
        name: 'Slide 1',
        fields: [
          {
            content_key: QUOTE_CONTENT_KEY,
            type: 'text' as const,
            display_name: 'Frase',
            max_chars: 200,
          },
        ],
      },
    },
  };
}
