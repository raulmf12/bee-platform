// Edge function: instagram-refresh — renova os tokens longos do Instagram antes
// de vencer. Chamada pelo pg_cron (1x/dia). Sem sessão: roda com service_role.
//
// O token longo do Facebook (~60 dias) pode ser trocado por um NOVO de 60 dias
// via fb_exchange_token, desde que ainda esteja válido. Renovamos os que vencem
// nos próximos 10 dias, mantendo a publicação sempre ativa sem colar nada.
//
// Env: FACEBOOK_APP_ID, FACEBOOK_APP_SECRET.
// Deploy com --no-verify-jwt (pro cron chamar).

import { corsHeaders, jsonResponse } from '../_shared/security.ts';

const GRAPH = 'https://graph.facebook.com/v21.0';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';

function svcHeaders(): HeadersInit {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  return { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
}

interface Row { user_id: string; instagram_access_token: string; instagram_token_expires_at: string | null }

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const appId = Deno.env.get('FACEBOOK_APP_ID');
  const appSecret = Deno.env.get('FACEBOOK_APP_SECRET');
  if (!appId || !appSecret) return jsonResponse({ success: false, error: 'FACEBOOK_APP_ID/SECRET ausentes' }, 500);

  try {
    // Renova o que vence nos próximos 10 dias (ou sem validade registrada).
    const cutoff = new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString();
    const url = `${SUPABASE_URL}/rest/v1/user_settings` +
      `?select=user_id,instagram_access_token,instagram_token_expires_at` +
      `&instagram_access_token=not.is.null` +
      `&or=(instagram_token_expires_at.is.null,instagram_token_expires_at.lte.${cutoff})`;
    const res = await fetch(url, { headers: svcHeaders() });
    if (!res.ok) throw new Error(`fetch settings HTTP ${res.status}`);
    const rows: Row[] = await res.json();
    if (!rows.length) return jsonResponse({ success: true, refreshed: 0, message: 'nada a renovar' });

    let refreshed = 0;
    const results: Array<{ user_id: string; ok: boolean; error?: string }> = [];
    for (const r of rows) {
      try {
        const ex = await fetch(`${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${r.instagram_access_token}`);
        const data = await ex.json();
        if (!ex.ok || !data.access_token) throw new Error(data.error?.message ?? `HTTP ${ex.status}`);
        const expiresIn = Number(data.expires_in ?? 60 * 24 * 3600);
        const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
        await fetch(`${SUPABASE_URL}/rest/v1/user_settings?user_id=eq.${r.user_id}`, {
          method: 'PATCH', headers: { ...svcHeaders(), Prefer: 'return=minimal' },
          body: JSON.stringify({ instagram_access_token: data.access_token, instagram_token_expires_at: expiresAt }),
        });
        refreshed++;
        results.push({ user_id: r.user_id, ok: true });
      } catch (e) {
        results.push({ user_id: r.user_id, ok: false, error: (e as Error).message.slice(0, 200) });
        console.error('[instagram-refresh] falhou', r.user_id, (e as Error).message);
      }
    }
    return jsonResponse({ success: true, refreshed, total: rows.length, results });
  } catch (e) {
    console.error('[instagram-refresh outer]', e);
    return jsonResponse({ success: false, error: String(e) }, 500);
  }
});

export {};
