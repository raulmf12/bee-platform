// Edge function: download-proxy
// Proxy de imagens externas pra escapar de CORS quando o canvas precisa ler bytes.
// Cache 10 min via Cache-Control.

import { corsHeaders, errorResponse, preflight, userIdFromAuth } from '../_shared/security.ts';

Deno.serve(async (req: Request) => {
  const cors = preflight(req);
  if (cors) return cors;

  try {
    // proxy aceita GET (com ?url=...) ou POST { url }
    let target: string | null = null;
    if (req.method === 'GET') {
      target = new URL(req.url).searchParams.get('url');
    } else if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      target = body.url ?? null;
    }
    if (!target) return errorResponse('Param url obrigatorio', 400);

    // exige auth (evita abuso como CDN gratis)
    const userId = userIdFromAuth(req);
    if (!userId) return errorResponse('Nao autenticado', 401);

    // bloqueia tentativa de SSRF interno
    const lowered = target.toLowerCase();
    if (
      lowered.startsWith('http://localhost') ||
      lowered.startsWith('http://127.') ||
      lowered.startsWith('http://0.0.0.0') ||
      lowered.includes('169.254.')
    ) {
      return errorResponse('URL nao permitida', 400);
    }

    const res = await fetch(target, {
      headers: { 'User-Agent': 'Bee-Consulting-Proxy/1.0' },
    });

    if (!res.ok) return errorResponse(`Origem retornou ${res.status}`, 502);

    const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
    if (!contentType.startsWith('image/')) {
      return errorResponse('URL nao e imagem', 400);
    }

    const buf = await res.arrayBuffer();
    return new Response(buf, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=600',
      },
    });
  } catch (e) {
    return errorResponse('Erro no proxy', 500, String(e));
  }
});

export {};
