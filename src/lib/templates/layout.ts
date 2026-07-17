// Motor de layout de texto — o coracao dos templates.
//
// Um template nao pode ser JSON estatico: a IA gera frases de tamanho
// imprevisivel. Este motor pega um texto qualquer e decide o corpo da fonte e
// as quebras de linha pra ele caber bonito no espaco que o template reservou.
//
// Tres decisoes, nesta ordem:
//  1. splitSentences — cada sentenca comeca em linha nova (respeita pontuacao)
//  2. balanceSentence — distribui as palavras pra as linhas ficarem com larguras
//     parecidas (semantica do CSS `text-wrap: balance`), via busca binaria na
//     menor largura-de-linha que ainda cabe no numero de linhas alvo
//  3. layoutText — escolhe o MAIOR corpo cujas linhas balanceadas cabem em
//     <= maxLines
//
// A medicao usa Canvas measureText com a fonte real. Cai numa heuristica
// (0.50 * fontSize por char) so quando nao ha DOM (SSR/script/teste).

export interface TextLayoutSpec {
  textWidth: number;
  maxLines: number;
  maxFontSize: number;
  minFontSize: number;
  fontFamily: string;
  fontWeight: string;
  balance?: boolean;
  step?: number;
}

export interface TextLayoutResult {
  fontSize: number;
  lines: string[];
}

// ---------------------------------------------------------------------------
// MEDICAO
// ---------------------------------------------------------------------------
let _measureCtx: CanvasRenderingContext2D | null = null;

function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  if (!_measureCtx) {
    _measureCtx = document.createElement('canvas').getContext('2d');
  }
  return _measureCtx;
}

export function measureText(
  text: string,
  fontSize: number,
  fontFamily: string,
  fontWeight: string,
): number {
  const ctx = getMeasureCtx();
  if (ctx) {
    ctx.font = `${fontWeight} ${fontSize}px "${fontFamily}"`;
    return ctx.measureText(text).width;
  }
  return text.length * fontSize * 0.5;
}

// Garante que as fontes estejam carregadas antes de medir/exportar.
// Medir com fallback e depois renderizar com a fonte real = layout torto.
export async function ensureFontsLoaded(
  fonts: Array<{ family: string; weight: string }>,
): Promise<void> {
  const fontSet = (typeof document !== 'undefined' ? document.fonts : undefined) as
    | FontFaceSet
    | undefined;
  if (!fontSet) return;
  try {
    await Promise.all(
      fonts.flatMap((f) => [
        fontSet.load(`${f.weight} 60px "${f.family}"`),
        fontSet.load(`${f.weight} 30px "${f.family}"`),
      ]),
    );
    await fontSet.ready;
  } catch {
    /* noop — segue com a medicao disponivel */
  }
}

// ---------------------------------------------------------------------------
// QUEBRA DE LINHA
// ---------------------------------------------------------------------------

// Divide o texto em sentencas (respeita pontuacao e quebras explicitas).
// Cada sentenca vira um grupo de palavras que comeca em linha nova.
function splitSentences(text: string): string[][] {
  const norm = (text || '').trim();
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
function greedyLineCount(
  words: string[],
  fontSize: number,
  maxWidth: number,
  spaceW: number,
  family: string,
  weight: string,
): number {
  let lines = 1;
  let cur = 0;
  for (const w of words) {
    const ww = measureText(w, fontSize, family, weight);
    if (cur === 0) cur = ww;
    else if (cur + spaceW + ww <= maxWidth) cur += spaceW + ww;
    else { lines += 1; cur = ww; }
  }
  return lines;
}

// Empacota gananciosamente respeitando maxWidth — devolve as linhas (strings).
function packGreedy(
  words: string[],
  fontSize: number,
  maxWidth: number,
  spaceW: number,
  family: string,
  weight: string,
): string[] {
  const lines: string[] = [];
  let cur: string[] = [];
  let curW = 0;
  for (const w of words) {
    const ww = measureText(w, fontSize, family, weight);
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
function balanceSentence(
  words: string[],
  targetLines: number,
  fontSize: number,
  maxWidth: number,
  spaceW: number,
  family: string,
  weight: string,
): string[] {
  if (words.length <= 1 || targetLines <= 1) return [words.join(' ')];
  let lo = 0;
  // nenhuma linha pode ser menor que a palavra mais larga
  for (const w of words) lo = Math.max(lo, measureText(w, fontSize, family, weight));
  let hi = maxWidth;
  for (let i = 0; i < 40 && hi - lo > 0.5; i++) {
    const mid = (lo + hi) / 2;
    if (greedyLineCount(words, fontSize, mid, spaceW, family, weight) <= targetLines) hi = mid;
    else lo = mid;
  }
  return packGreedy(words, fontSize, hi, spaceW, family, weight);
}

// ---------------------------------------------------------------------------
// LAYOUT — escolhe o MAIOR fontSize cujas linhas cabem em <= maxLines.
// ---------------------------------------------------------------------------
export function layoutText(text: string, spec: TextLayoutSpec): TextLayoutResult {
  const {
    textWidth,
    maxLines,
    maxFontSize,
    minFontSize,
    fontFamily,
    fontWeight,
    balance = true,
    step = 2,
  } = spec;

  const sentences = splitSentences(text);

  const build = (fontSize: number): string[] => {
    const spaceW = measureText(' ', fontSize, fontFamily, fontWeight);
    const lines: string[] = [];
    for (const words of sentences) {
      if (!balance) {
        lines.push(...packGreedy(words, fontSize, textWidth, spaceW, fontFamily, fontWeight));
        continue;
      }
      const lineCount = greedyLineCount(words, fontSize, textWidth, spaceW, fontFamily, fontWeight);
      lines.push(
        ...balanceSentence(words, lineCount, fontSize, textWidth, spaceW, fontFamily, fontWeight),
      );
    }
    return lines;
  };

  for (let fontSize = maxFontSize; fontSize >= minFontSize; fontSize -= step) {
    const lines = build(fontSize);
    if (lines.length <= maxLines) return { fontSize, lines };
  }
  // Nao coube nem no menor corpo — devolve o menor mesmo assim (nao trunca).
  return { fontSize: minFontSize, lines: build(minFontSize) };
}
