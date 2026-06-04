// Edge function: search-knowledge
// Busca semantica no RAG do user. Recebe { query, match_count?, threshold? }.
// Retorna { results: [{ content, similarity, document_title, ... }] }

import {
  errorResponse,
  getUserGeminiKey,
  jsonResponse,
  preflight,
  userIdFromAuth,
  checkRateLimit,
} from '../_shared/security.ts';
import { embedText } from '../_shared/embed.ts';

interface SearchInput {
  query: string;
  match_count?: number;
  match_threshold?: number;
}

Deno.serve(async (req: Request) => {
  const cors = preflight(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Use POST', 405);

  try {
    const userId = userIdFromAuth(req);
    if (!userId) return errorResponse('Nao autenticado', 401);

    const rl = checkRateLimit(userId, 60_000, 60);
    if (!rl.ok) return errorResponse('Rate limit', 429);

    const input = (await req.json()) as SearchInput;
    if (!input.query) return errorResponse('query obrigatorio', 400);

    const apiKey = await getUserGeminiKey(userId);
    if (!apiKey) return errorResponse('Chave Gemini nao configurada', 400);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) return errorResponse('Env Supabase incompleto', 500);

    const queryEmbedding = await embedText(apiKey, input.query, 'RETRIEVAL_QUERY');

    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/match_knowledge`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query_embedding: queryEmbedding,
        match_count: input.match_count ?? 5,
        match_threshold: input.match_threshold ?? 0.3,
        filter_user_id: userId,
      }),
    });
    if (!res.ok) return errorResponse('Erro na busca', 500, await res.text());
    const results = await res.json();
    return jsonResponse({ success: true, results });
  } catch (e) {
    console.error('[search-knowledge]', e);
    return errorResponse('Erro', 500, String(e));
  }
});

export {};
