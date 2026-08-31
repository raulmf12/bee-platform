// Edge function: instagram-connect — o back do botão "Conectar Instagram".
// Recebe o `code` do Login com Facebook, troca por um token de LONGA duração
// (usando o App Secret, que fica só aqui no servidor), descobre a conta IG
// comercial ligada à Página e DEVOLVE os valores pro front salvar em user_settings.
//
// Não salva nada — o front persiste via updateSettings (mesmo caminho do paste
// manual). O refresh automático (instagram-refresh) é quem renova depois.
//
// Env necessárias (Supabase > Edge Functions > Secrets):
//   FACEBOOK_APP_ID, FACEBOOK_APP_SECRET
//
// Entrada: { code, redirect_uri }   Saída: { access_token, instagram_business_account_id, username, expires_at }

import { errorResponse, jsonResponse, preflight, userIdFromAuth, checkRateLimit } from '../_shared/security.ts';

const GRAPH = 'https://graph.facebook.com/v21.0';

interface Input { code: string; redirect_uri: string }

Deno.serve(async (req: Request) => {
  const cors = preflight(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Use POST', 405);

  try {
    const userId = userIdFromAuth(req);
    if (!userId) return errorResponse('Nao autenticado', 401);
    const rl = checkRateLimit(userId, 60_000, 10);
    if (!rl.ok) return errorResponse(`Rate limit. Tente em ${Math.ceil(rl.resetIn / 1000)}s`, 429);

    const appId = Deno.env.get('FACEBOOK_APP_ID');
    const appSecret = Deno.env.get('FACEBOOK_APP_SECRET');
    if (!appId || !appSecret) {
      return errorResponse('App da Meta nao configurado no servidor (FACEBOOK_APP_ID / FACEBOOK_APP_SECRET).', 500);
    }

    const input = (await req.json()) as Input;
    if (!input.code || !input.redirect_uri) return errorResponse('code e redirect_uri obrigatorios', 400);

    // 1) code -> token curto
    const shortUrl = `${GRAPH}/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(input.redirect_uri)}&client_secret=${appSecret}&code=${encodeURIComponent(input.code)}`;
    const shortRes = await fetch(shortUrl);
    const shortData = await shortRes.json();
    if (!shortRes.ok || !shortData.access_token) {
      return errorResponse(`Falha ao trocar o code: ${shortData.error?.message ?? JSON.stringify(shortData).slice(0, 300)}`, 400);
    }

    // 2) token curto -> token LONGO (~60 dias)
    const longUrl = `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortData.access_token}`;
    const longRes = await fetch(longUrl);
    const longData = await longRes.json();
    if (!longRes.ok || !longData.access_token) {
      return errorResponse(`Falha ao gerar token longo: ${longData.error?.message ?? JSON.stringify(longData).slice(0, 300)}`, 400);
    }
    const longToken = longData.access_token as string;
    const expiresIn = Number(longData.expires_in ?? 60 * 24 * 3600); // ~60 dias
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // 3) Páginas do usuário -> a que tem instagram_business_account
    const pagesRes = await fetch(`${GRAPH}/me/accounts?fields=id,name,instagram_business_account{id,username}&access_token=${longToken}`);
    const pagesData = await pagesRes.json();
    if (!pagesRes.ok) {
      return errorResponse(`Falha ao listar Páginas: ${pagesData.error?.message ?? JSON.stringify(pagesData).slice(0, 300)}`, 400);
    }
    const pages: Array<{ id: string; name: string; instagram_business_account?: { id: string; username?: string } }> = pagesData.data ?? [];
    const withIg = pages.find((p) => p.instagram_business_account?.id);
    if (!withIg) {
      return errorResponse('Nenhuma Página com conta do Instagram comercial vinculada. Vincule o Instagram (Business/Creator) a uma Página do Facebook e tente de novo.', 400);
    }
    const igId = withIg.instagram_business_account!.id;
    const username = withIg.instagram_business_account!.username ?? '';

    return jsonResponse({
      success: true,
      access_token: longToken,
      instagram_business_account_id: igId,
      username,
      expires_at: expiresAt,
      page_name: withIg.name,
    });
  } catch (e) {
    console.error('[instagram-connect]', e);
    return errorResponse('Erro ao conectar o Instagram', 500, String(e));
  }
});

export {};
