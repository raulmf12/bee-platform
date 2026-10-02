// Edge function: meta-ads-sync — tráfego pago (Meta Ads) → banco: BMs, contas de
// anúncio, campanhas, conjuntos, anúncios e desempenho diário por anúncio.
// Cada chamada trabalha por um tempo e devolve se terminou; o app chama de novo
// até `done` (com progresso) e o cron (30 min) continua/atualiza sozinho.
//
// Quem chama: o app (JWT → só o usuário), serviço + x-bee-user-id (um usuário)
// ou o cron (serviço sem usuário → todas as conexões).
import { corsHeaders, errorResponse, isServiceCall, jsonResponse, preflight, userIdFromAuth } from '../_shared/security.ts';
import { fetchRest } from '../_shared/gemini.ts';
import { syncUser } from '../_shared/meta-ads.ts';

Deno.serve(async (req: Request) => {
  const cors = preflight(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Use POST', 405);
  try {
    const isService = isServiceCall(req);
    const userId = isService ? req.headers.get('x-bee-user-id') : userIdFromAuth(req);
    if (!isService && !userId) return errorResponse('Nao autenticado', 401);
    const body = (await req.json().catch(() => ({}))) as { force_structure?: boolean };
    if (userId) return jsonResponse({ success: true, ...(await syncUser(userId, 100_000, { forceStructure: !!body.force_structure })) });
    const conns = await fetchRest<Array<{ user_id: string }>>(`/meta_connections?status=in.(connected,error)&select=user_id&limit=200`);
    const results = [];
    const budget = Math.max(20_000, Math.floor(120_000 / Math.max(1, conns.length)));
    for (const c of conns) results.push(await syncUser(c.user_id, budget));
    return jsonResponse({ success: true, users: results.length, results });
  } catch (e) {
    console.error('[meta-ads-sync]', e);
    return new Response(JSON.stringify({ success: false, error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
