// Edge function: content-memory — indexa o que já foi dito (memória anti-repetição).
//   sync  { limit? }  → indexa posts novos/alterados (incremental)
//   check { text, k? } → posts passados mais parecidos com um texto
import { checkRateLimit, errorResponse, getUserGeminiKey, internalUserId, jsonResponse, preflight, userIdFromAuth } from '../_shared/security.ts';
import { similarPast, syncMemory } from '../_shared/content-memory.ts';

Deno.serve(async (req: Request) => {
  const cors = preflight(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Use POST', 405);
  try {
    const userId = userIdFromAuth(req) ?? internalUserId(req);
    if (!userId) return errorResponse('Nao autenticado', 401);
    const rl = checkRateLimit(userId, 60_000, 30);
    if (!rl.ok) return errorResponse(`Rate limit. Tente em ${Math.ceil(rl.resetIn / 1000)}s`, 429);
    const input = (await req.json().catch(() => ({}))) as { action?: string; limit?: number; text?: string; k?: number };
    const apiKey = await getUserGeminiKey(userId);
    if (!apiKey) return errorResponse('Chave Gemini nao configurada', 400);
    if (input.action === 'check') {
      if (!input.text?.trim()) return errorResponse('text obrigatório', 400);
      return jsonResponse({ success: true, hits: await similarPast(apiKey, userId, input.text, Math.min(10, input.k ?? 5)) });
    }
    const r = await syncMemory(apiKey, userId, Math.min(60, Math.max(1, input.limit ?? 40)));
    return jsonResponse({ success: true, ...r });
  } catch (e) {
    console.error('[content-memory]', e);
    return errorResponse('Erro na memória de conteúdo', 500, String(e));
  }
});

export {};
