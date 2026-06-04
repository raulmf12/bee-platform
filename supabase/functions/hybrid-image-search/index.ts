// Edge function: hybrid-image-search
// Busca imagens via SerpAPI (Google Images). Filtro: minimo 800x600.

import {
  errorResponse,
  jsonResponse,
  logUsage,
  preflight,
  userIdFromAuth,
  checkRateLimit,
} from '../_shared/security.ts';

interface SearchInput {
  query: string;
  count?: number;
  size?: 'medium' | 'large' | 'xlarge';
}

interface SearchOutput {
  images: Array<{
    url: string;
    thumbnail: string;
    title: string;
    width?: number;
    height?: number;
    source?: string;
  }>;
}

async function getSerpKey(userId: string): Promise<string | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return null;
  const res = await fetch(
    `${supabaseUrl}/rest/v1/user_settings?select=serpapi_key&user_id=eq.${userId}&limit=1`,
    {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    },
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ serpapi_key: string | null }>;
  return rows[0]?.serpapi_key ?? null;
}

Deno.serve(async (req: Request) => {
  const cors = preflight(req);
  if (cors) return cors;

  if (req.method !== 'POST') return errorResponse('Use POST', 405);

  try {
    const userId = userIdFromAuth(req);
    if (!userId) return errorResponse('Nao autenticado', 401);

    const rl = checkRateLimit(userId, 60_000, 30);
    if (!rl.ok) return errorResponse('Rate limit', 429);

    const input = (await req.json()) as SearchInput;
    if (!input.query) return errorResponse('query eh obrigatorio', 400);

    const apiKey = await getSerpKey(userId);
    if (!apiKey) {
      return errorResponse(
        'Chave SerpAPI nao configurada nas Configuracoes > Integracoes.',
        400,
      );
    }

    const count = input.count ?? 8;
    const sizeFilter = input.size ?? 'large';
    const url = new URL('https://serpapi.com/search.json');
    url.searchParams.set('engine', 'google_images');
    url.searchParams.set('q', input.query);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('ijn', '0');
    url.searchParams.set('tbs', sizeFilter === 'large' ? 'isz:l' : 'isz:m');

    const res = await fetch(url.toString());
    if (!res.ok) {
      return errorResponse(`SerpAPI HTTP ${res.status}`, 500, await res.text());
    }

    const data = await res.json();
    const all = (data.images_results ?? []) as Array<{
      original: string;
      thumbnail: string;
      title?: string;
      original_width?: number;
      original_height?: number;
      source?: string;
    }>;

    const images: SearchOutput['images'] = all
      .filter((i) => i.original && i.original_width && i.original_width >= 800)
      .slice(0, count)
      .map((i) => ({
        url: i.original,
        thumbnail: i.thumbnail,
        title: i.title ?? '',
        width: i.original_width,
        height: i.original_height,
        source: i.source,
      }));

    logUsage({
      userId,
      provider: 'serpapi',
      product: 'image-search',
      metadata: { query: input.query, returned: images.length },
    });

    return jsonResponse({ success: true, images });
  } catch (e) {
    return errorResponse('Erro na busca', 500, String(e));
  }
});

export {};
