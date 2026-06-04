// Edge function: ingest-document
// Recebe { title, text, source_type } e ingere no RAG:
//   1. chunkifica o texto
//   2. embedda cada chunk (gemini-embedding-001, 1536d)
//   3. cria 1 row em knowledge_documents + N em knowledge_chunks
//
// Retorna { document_id, chunk_count }

import {
  errorResponse,
  getUserGeminiKey,
  jsonResponse,
  logUsage,
  preflight,
  userIdFromAuth,
  checkRateLimit,
} from '../_shared/security.ts';
import { embedBatch, EMBED_MODEL } from '../_shared/embed.ts';
import { chunkText, estimateTokens } from '../_shared/chunker.ts';

interface IngestInput {
  title: string;
  text: string;
  source_type?: string;
  is_global?: boolean;
  metadata?: Record<string, unknown>;
  chunk_target_size?: number;
  chunk_overlap?: number;
}

async function insertDocument(
  serviceKey: string,
  supabaseUrl: string,
  userId: string,
  input: IngestInput,
  chunkCount: number,
): Promise<string> {
  const res = await fetch(`${supabaseUrl}/rest/v1/knowledge_documents`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      user_id: userId,
      title: input.title,
      source_type: input.source_type ?? 'paste',
      source_size: input.text.length,
      chunk_count: chunkCount,
      is_global: input.is_global ?? false,
      metadata: input.metadata ?? {},
    }),
  });
  if (!res.ok) {
    throw new Error(`insert document HTTP ${res.status}: ${await res.text()}`);
  }
  const rows = (await res.json()) as Array<{ id: string }>;
  return rows[0].id;
}

async function insertChunks(
  serviceKey: string,
  supabaseUrl: string,
  userId: string,
  documentId: string,
  chunks: Array<{ content: string; tokens: number; embedding: number[] }>,
): Promise<void> {
  // PostgREST aceita batch insert num POST so
  const rows = chunks.map((c, i) => ({
    document_id: documentId,
    user_id: userId,
    chunk_index: i,
    content: c.content,
    tokens: c.tokens,
    embedding: JSON.stringify(c.embedding),
  }));
  // Em lotes de 50 pra nao estourar payload
  const BATCH = 50;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const res = await fetch(`${supabaseUrl}/rest/v1/knowledge_chunks`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(slice),
    });
    if (!res.ok) {
      throw new Error(`insert chunks batch ${i} HTTP ${res.status}: ${await res.text()}`);
    }
  }
}

Deno.serve(async (req: Request) => {
  const cors = preflight(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Use POST', 405);

  try {
    const userId = userIdFromAuth(req);
    if (!userId) return errorResponse('Nao autenticado', 401);

    const rl = checkRateLimit(userId, 60_000, 5);
    if (!rl.ok) return errorResponse('Rate limit (5 docs/min)', 429);

    const input = (await req.json()) as IngestInput;
    if (!input.title || !input.text) return errorResponse('title e text obrigatorios', 400);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) return errorResponse('Env Supabase incompleto', 500);

    const apiKey = await getUserGeminiKey(userId);
    if (!apiKey) return errorResponse('Chave Gemini nao configurada', 400);

    // 1. Chunk
    const pieces = chunkText(input.text, {
      targetSize: input.chunk_target_size,
      overlap: input.chunk_overlap,
    });
    if (pieces.length === 0) return errorResponse('Texto vazio apos chunking', 400);

    // 2. Embed em paralelo
    const embeddings = await embedBatch(apiKey, pieces, 'RETRIEVAL_DOCUMENT');

    const chunks = pieces.map((content, i) => ({
      content,
      tokens: estimateTokens(content),
      embedding: embeddings[i],
    }));

    // 3. Insert no DB (via service role pra bypass RLS uniformemente)
    const documentId = await insertDocument(serviceKey, supabaseUrl, userId, input, chunks.length);
    await insertChunks(serviceKey, supabaseUrl, userId, documentId, chunks);

    // log de uso (chunks * 1 embedding cada)
    logUsage({
      userId,
      provider: 'gemini',
      product: 'text',
      model: EMBED_MODEL,
      metadata: { type: 'embedding', chunk_count: chunks.length, doc_title: input.title },
    });

    return jsonResponse({ success: true, document_id: documentId, chunk_count: chunks.length });
  } catch (e) {
    console.error('[ingest-document]', e);
    return errorResponse('Erro ao ingerir documento', 500, String(e));
  }
});

export {};
