// Edge function: instagram-import — traz o histórico de uma conta do Instagram
// para a base (peças publicadas + conteúdos "Sem campanha" + métricas) e tira o
// retrato da conta pro comparativo. Uma página por chamada: o app chama de novo
// com o cursor até `done` (mostra o progresso).
//
// Entrada: { account_id, cursor?, mode?: 'full' | 'recent' }
// Quem chama: o app (JWT do dono) ou serviço (service_role + x-bee-user-id).
import { checkRateLimit, errorResponse, isServiceCall, jsonResponse, preflight, userIdFromAuth } from '../_shared/security.ts';
import { importAccount } from '../_shared/instagram-import.ts';

Deno.serve(async (req: Request) => {
  const cors = preflight(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Use POST', 405);
  try {
    const userId = isServiceCall(req) ? req.headers.get('x-bee-user-id') : userIdFromAuth(req);
    if (!userId) return errorResponse('Nao autenticado', 401);
    const rl = checkRateLimit(`ig-import:${userId}`, 60_000, 40);
    if (!rl.ok) return errorResponse(`Rate limit. Tente em ${Math.ceil(rl.resetIn / 1000)}s`, 429);
    const input = (await req.json().catch(() => ({}))) as { account_id?: string; cursor?: string | null; mode?: 'full' | 'recent' };
    if (!input.account_id) return errorResponse('account_id obrigatório', 400);
    const result = await importAccount(userId, input.account_id, { cursor: input.cursor ?? null, mode: input.mode ?? 'full' });
    return jsonResponse({ success: true, ...result });
  } catch (e) {
    console.error('[instagram-import]', e);
    return errorResponse((e as Error).message.slice(0, 300), 400);
  }
});
