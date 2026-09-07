// Posicionamento do texto APÓS ver a imagem (M01-D Campo / M01-E Matéria, e no
// futuro M02). A frase não escolhe mais a posição no escuro: depois que o fundo
// existe, medimos ONDE ele tem espaço negativo (região mais "calma", de menor
// detalhe) e colocamos o bloco de texto lá, com a cor de melhor contraste.
//
// Heurística sem visão pesada: amostra a luminância do TERÇO de cima e do TERÇO
// de baixo do fundo. A zona com MENOR variância (mais uniforme = menos coisa
// acontecendo) ganha o texto. A cor sai do brilho médio dessa zona (fundo
// escuro -> texto claro; fundo claro -> texto escuro).

export type TextZone = 'top' | 'bottom';
export interface ZoneChoice {
  zone: TextZone;
  textColor: string;   // hex pro headline
  overlay: TextZone;   // onde escurecer o véu de legibilidade (= zone)
}

// creme oficial (texto sobre fundo escuro) e navy (texto sobre fundo claro).
const LIGHT_TEXT = '#F1E9DA';
const DARK_TEXT = '#1C2E4A';

const _cache = new Map<string, ZoneChoice>();

interface Stat { mean: number; variance: number }

// Média e variância da luminância (0..1) de uma faixa de linhas do bitmap.
function bandStat(data: Uint8ClampedArray, w: number, y0: number, y1: number): Stat {
  let sum = 0, sumSq = 0, n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      // luma perceptual (Rec. 601), normalizada.
      const l = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
      sum += l; sumSq += l * l; n++;
    }
  }
  if (n === 0) return { mean: 0.5, variance: 1 };
  const mean = sum / n;
  return { mean, variance: Math.max(0, sumSq / n - mean * mean) };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('falha ao carregar imagem p/ análise de zona'));
    img.src = url;
  });
}

// Decide a zona do texto pra um fundo. Cai num default seguro (bottom/claro) se
// a imagem não carregar ou o canvas bloquear (tainted) — nunca quebra a composição.
export async function analyzeTextZone(url: string | undefined): Promise<ZoneChoice> {
  const fallback: ZoneChoice = { zone: 'bottom', textColor: LIGHT_TEXT, overlay: 'bottom' };
  if (!url) return fallback;
  const hit = _cache.get(url);
  if (hit) return hit;
  try {
    const img = await loadImage(url);
    // Amostra pequena: barato e suficiente pra medir espaço negativo.
    const w = 90, h = 112;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return fallback;
    ctx.drawImage(img, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);

    const third = Math.floor(h / 3);
    const top = bandStat(data, w, 0, third);
    const bottom = bandStat(data, w, h - third, h);

    // Zona mais calma (menor variância) recebe o texto. Empate técnico -> bottom
    // (leitura natural + assinatura já mora embaixo).
    const zone: TextZone = top.variance < bottom.variance - 0.002 ? 'top' : 'bottom';
    const chosen = zone === 'top' ? top : bottom;
    // Depois do véu de legibilidade a zona escurece; então texto claro quase
    // sempre. Só usa texto escuro quando a zona é REALMENTE clara e uniforme.
    const textColor = chosen.mean > 0.62 && chosen.variance < 0.02 ? DARK_TEXT : LIGHT_TEXT;
    const choice: ZoneChoice = { zone, textColor, overlay: zone };
    _cache.set(url, choice);
    return choice;
  } catch {
    return fallback;
  }
}

export function clearZoneCache(url?: string): void {
  if (url) _cache.delete(url);
  else _cache.clear();
}
