// Edge function: test-linkedin — valida um access token do LinkedIn NO SERVIDOR.
// O botão "Testar" do front não pode chamar api.linkedin.com direto do navegador
// (o LinkedIn não manda header de CORS → o browser bloqueia o preflight). Então
// o teste passa por aqui: recebe o token, chama /v2/userinfo daqui, e devolve
// nome + URN sugerido. Não salva nada — o front persiste o token via updateSettings.
//
// Entrada: { token: string }
// Saída:   { success, name, email, sub, suggested_urn }

import { errorResponse, jsonResponse, preflight, userIdFromAuth, checkRateLimit } from '../_shared/security.ts';

interface Input { token: string }

Deno.serve(async (req: Request) => {
  const cors = preflight(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Use POST', 405);

  try {
    const userId = userIdFromAuth(req);
    if (!userId) return errorResponse('Nao autenticado', 401);
    const rl = checkRateLimit(userId, 60_000, 10);
    if (!rl.ok) return errorResponse(`Rate limit. Tente em ${Math.ceil(rl.resetIn / 1000)}s`, 429);

    const input = (await req.json()) as Input;
    const token = (input.token ?? '').trim();
    if (!token) return errorResponse('Cola o token primeiro.', 400);

    const res = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const text = await res.text();
    if (!res.ok) {
      // 401 = token expirado/invalido; devolve a mensagem crua do LinkedIn pra ajudar.
      return errorResponse(`LinkedIn HTTP ${res.status}: ${text.slice(0, 300)}`, 400);
    }

    const data = JSON.parse(text);
    const sub = data.sub ?? data.id;
    const suggestedUrn = sub ? `urn:li:person:${sub}` : '';
    return jsonResponse({
      success: true,
      name: data.name ?? null,
      email: data.email ?? null,
      sub: sub ?? null,
      suggested_urn: suggestedUrn,
    });
  } catch (e) {
    console.error('[test-linkedin]', e);
    return errorResponse('Erro ao testar o token do LinkedIn', 500, String(e));
  }
});

export {};
