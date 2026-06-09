// Template "Bee Quote" — fundo branco + frase navy serif + espiral honey.
// Padrao das publicacoes da Bee Consulting (formato 4:5, 1:1 e 1.91:1).
//
// Como funciona (igual ao carrossel-ia):
//  - Definimos o JSON Fabric.js do template com placeholders.
//  - hydrateBeeQuote() recebe { quote, sizeId } e devolve o JSON pronto pra
//    canvas.loadFromJSON().
//  - O motor de layout (layoutQuote) faz quebra de linha BALANCEADA: mede o
//    texto com a fonte real (measureText), respeita a pontuacao (cada sentenca
//    comeca em linha nova) e distribui as palavras pra que as linhas fiquem com
//    largura parecida (semantica do CSS `text-wrap: balance`). O tamanho da
//    fonte e o maior que cabe em <= maxLines linhas balanceadas.

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
const FONT_WEIGHT = 'bold';
const LINE_HEIGHT = 1.2;
const QUOTE_CONTENT_KEY = 'bee-quote';

// PNG oficial da espiral Bee — fica em public/bee-spiral.png.
// Sprite quadrado 1080x1080.
export const BEE_SPIRAL_URL = '/bee-spiral.png';
const BEE_SPIRAL_NATIVE = 1080;

// ---------------------------------------------------------------------------
// MEDICAO — usa Canvas measureText com a fonte real (Playfair Display Bold).
// Cai pra heuristica (0.50 * fontSize por char) so quando nao ha DOM (SSR/teste).
// ---------------------------------------------------------------------------
let _measureCtx: CanvasRenderingContext2D | null = null;

function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  if (!_measureCtx) {
    _measureCtx = document.createElement('canvas').getContext('2d');
  }
  return _measureCtx;
}

function measure(text: string, fontSize: number): number {
  const ctx = getMeasureCtx();
  if (ctx) {
    ctx.font = `${FONT_WEIGHT} ${fontSize}px "${FONT}"`;
    return ctx.measureText(text).width;
  }
  return text.length * fontSize * 0.5;
}

// Garante que a Playfair Display esteja carregada antes de medir/exportar.
// Chamar (await) antes de hidratar pra ter medicao precisa.
export async function ensureQuoteFontLoaded(): Promise<void> {
  const fonts = (typeof document !== 'undefined' ? document.fonts : undefined) as
    | FontFaceSet
    | undefined;
  if (!fonts) return;
  try {
    await Promise.all([
      fonts.load(`${FONT_WEIGHT} 60px "${FONT}"`),
      fonts.load(`${FONT_WEIGHT} 30px "${FONT}"`),
    ]);
    await fonts.ready;
  } catch {
    /* noop — segue com a medicao disponivel */
  }
}

// ---------------------------------------------------------------------------
// QUEBRA DE LINHA BALANCEADA
// ---------------------------------------------------------------------------

// Divide a frase em sentencas (respeita pontuacao e quebras explicitas).
// Cada sentenca vira um grupo de palavras que comeca em linha nova.
function splitSentences(quote: string): string[][] {
  const norm = (quote || '').trim();
  if (!norm) return [['Sua', 'frase', 'aqui']];
  const sentences: string[] = [];
  for (const block of norm.split(/\n+/)) {
    for (const part of block.split(/(?<=[.!?…])\s+/)) {
      const t = part.trim();
      if (t) sentences.push(t);
    }
  }
  if (!sentences.length) sentences.push(norm);
  return sentences.map((s) => s.split(/\s+/).filter(Boolean));
}

// Quantas linhas o wrap ganancioso produz pra estas palavras num dado maxWidth.
function greedyLineCount(words: string[], fontSize: number, maxWidth: number, spaceW: number): number {
  let lines = 1;
  let cur = 0;
  for (const w of words) {
    const ww = measure(w, fontSize);
    if (cur === 0) cur = ww;
    else if (cur + spaceW + ww <= maxWidth) cur += spaceW + ww;
    else { lines += 1; cur = ww; }
  }
  return lines;
}

// Empacota gananciosamente respeitando maxWidth — devolve as linhas (strings).
function packGreedy(words: string[], fontSize: number, maxWidth: number, spaceW: number): string[] {
  const lines: string[] = [];
  let cur: string[] = [];
  let curW = 0;
  for (const w of words) {
    const ww = measure(w, fontSize);
    if (!cur.length) { cur = [w]; curW = ww; }
    else if (curW + spaceW + ww <= maxWidth) { cur.push(w); curW += spaceW + ww; }
    else { lines.push(cur.join(' ')); cur = [w]; curW = ww; }
  }
  if (cur.length) lines.push(cur.join(' '));
  return lines;
}

// Balanceia 1 sentenca em ~targetLines linhas de largura parecida.
// Busca binaria na menor largura-de-linha que ainda cabe em targetLines linhas
// (= minimiza a largura da linha mais larga -> linhas equilibradas).
function balanceSentence(words: string[], targetLines: number, fontSize: number, maxWidth: number, spaceW: number): string[] {
  if (words.length <= 1 || targetLines <= 1) return [words.join(' ')];
  let lo = 0;
  for (const w of words) lo = Math.max(lo, measure(w, fontSize)); // nenhuma linha < palavra mais larga
  let hi = maxWidth;
  for (let i = 0; i < 40 && hi - lo > 0.5; i++) {
    const mid = (lo + hi) / 2;
    if (greedyLineCount(words, fontSize, mid, spaceW) <= targetLines) hi = mid;
    else lo = mid;
  }
  return packGreedy(words, fontSize, hi, spaceW);
}

interface QuoteLayout {
  fontSize: number;
  lines: string[];
}

// Escolhe o MAIOR fontSize cujas linhas balanceadas cabem em <= maxLines.
function layoutQuote(
  quote: string,
  textWidth: number,
  maxLines: number,
  initialFontSize: number,
  minFontSize: number,
): QuoteLayout {
  const sentences = splitSentences(quote);
  const build = (fontSize: number): string[] => {
    const spaceW = measure(' ', fontSize);
    const lines: string[] = [];
    for (const words of sentences) {
      const lineCount = greedyLineCount(words, fontSize, textWidth, spaceW);
      lines.push(...balanceSentence(words, lineCount, fontSize, textWidth, spaceW));
    }
    return lines;
  };

  for (let fontSize = initialFontSize; fontSize >= minFontSize; fontSize -= 2) {
    const lines = build(fontSize);
    if (lines.length <= maxLines) return { fontSize, lines };
  }
  return { fontSize: minFontSize, lines: build(minFontSize) };
}

// ---------------------------------------------------------------------------
// HYDRATE — devolve um objeto compativel com canvas.loadFromJSON().
// ---------------------------------------------------------------------------
export function hydrateBeeQuote({ quote, sizeId }: BeeQuoteVariables): object {
  const layout = LAYOUTS[sizeId];
  const { width, height } = layout;

  const textWidth = Math.round(width * layout.textWidthRatio);
  const { fontSize, lines } = layoutQuote(
    quote || 'Sua frase aqui',
    textWidth,
    layout.maxLines,
    layout.initialFontSize,
    layout.minFontSize,
  );
  const text = lines.join('\n');

  // Centraliza verticalmente pelo numero REAL de linhas (nao pelo maxLines).
  const textBlockHeight = fontSize * LINE_HEIGHT * lines.length;
  const textTopCenter = height * layout.textTopRatio;
  const textTop = Math.round(textTopCenter - textBlockHeight / 2);

  const logoSide = layout.logoSide;
  const logoLeft = Math.round((width - logoSide) / 2);
  const logoTop = Math.round(height * layout.logoTopRatio - logoSide / 2);
  const logoScale = logoSide / BEE_SPIRAL_NATIVE;

  return {
    version: '6.0.0',
    background: WHITE,
    objects: [
      // Frase principal (com quebras balanceadas ja embutidas)
      {
        type: 'Textbox',
        version: '6.0.0',
        text,
        left: Math.round((width - textWidth) / 2),
        top: textTop,
        width: textWidth,
        fontSize,
        fontFamily: FONT,
        fontWeight: FONT_WEIGHT,
        fill: NAVY,
        textAlign: 'center',
        lineHeight: LINE_HEIGHT,
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
