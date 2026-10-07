// Helper compartilhado: gera embeddings via Gemini.
// Usa gemini-embedding-001 com outputDimensionality=1536 (compativel com pgvector).

const EMBED_MODEL = Deno.env.get('GEMINI_EMBED_MODEL') ?? 'gemini-embedding-001';
const EMBED_DIM = 1536;

export async function embedText(
  apiKey: string,
  text: string,
  taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' | 'SEMANTIC_SIMILARITY' = 'RETRIEVAL_DOCUMENT',
): Promise<number[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${apiKey}`;
  const body = {
    content: { parts: [{ text }] },
    taskType,
    outputDimensionality: EMBED_DIM,
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`embedContent HTTP ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  const values = json.embedding?.values;
  if (!Array.isArray(values) || values.length !== EMBED_DIM) {
    throw new Error(`embedding inesperado (got ${values?.length ?? 'null'} dim)`);
  }
  return values;
}

export async function embedBatch(
  apiKey: string,
  texts: string[],
  taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' | 'SEMANTIC_SIMILARITY' = 'RETRIEVAL_DOCUMENT',
): Promise<number[][]> {
  // Gemini nao tem batch sincrono pra embedding — fazemos em paralelo com limite.
  const CONCURRENCY = 4;
  const out: number[][] = new Array(texts.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= texts.length) return;
      out[i] = await embedText(apiKey, texts[i], taskType);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  return out;
}

export { EMBED_MODEL, EMBED_DIM };
