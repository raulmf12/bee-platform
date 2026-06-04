// Chunking simples por paragrafos + sentencas, com tamanho-alvo e overlap.
// Target: ~600 chars por chunk (~150 tokens em PT). Overlap: ~80 chars.

export interface ChunkOptions {
  targetSize?: number;
  maxSize?: number;
  overlap?: number;
}

const DEFAULTS: Required<ChunkOptions> = {
  targetSize: 600,
  maxSize: 900,
  overlap: 80,
};

function splitSentences(text: string): string[] {
  // split por terminadores comuns, preservando o terminador na sentenca anterior
  return text
    .split(/(?<=[.!?])\s+(?=[A-ZÁ-ÚÀ-Ü"'])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

export function chunkText(text: string, opts: ChunkOptions = {}): string[] {
  const o = { ...DEFAULTS, ...opts };
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const paragraphs = splitParagraphs(normalized);
  const chunks: string[] = [];
  let buffer = '';

  function flush() {
    const trimmed = buffer.trim();
    if (trimmed) chunks.push(trimmed);
    buffer = '';
  }

  for (const para of paragraphs) {
    // Se o paragrafo sozinho ja eh maior que maxSize, split por sentencas
    const units = para.length > o.maxSize ? splitSentences(para) : [para];
    for (const unit of units) {
      if (buffer.length + unit.length + 1 <= o.targetSize) {
        buffer = buffer ? `${buffer}\n${unit}` : unit;
      } else if (buffer.length === 0) {
        // unit eh muito grande mesmo separada — empurra inteira
        chunks.push(unit);
      } else {
        // pega tail do buffer pra overlap
        const tail = buffer.slice(-o.overlap);
        flush();
        buffer = tail ? `${tail} ${unit}` : unit;
      }
    }
  }
  flush();
  return chunks;
}

// Estimativa grosseira de tokens (PT ~ 4 chars por token)
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
