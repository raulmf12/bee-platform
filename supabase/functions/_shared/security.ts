// Utilitarios compartilhados pelas edge functions.
// Inclui: CORS headers, parsing do JWT, rate limit em memoria, logging de uso.

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

export function preflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  return null;
}

export function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders: HeadersInit = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  });
}

export function errorResponse(message: string, status = 400, details?: unknown): Response {
  console.error('[edge.error]', { message, status, details });
  return jsonResponse({ success: false, error: message, details }, status);
}

// Extrai user_id do JWT no header Authorization. Retorna null se invalido.
// (Nao valida assinatura — confiamos que o gateway do Supabase ja validou
// antes de invocar a function. Apenas extrai o sub do payload base64.)
export function userIdFromAuth(req: Request): string | null {
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const decoded = JSON.parse(
      atob(payload.replace(/-/g, '+').replace(/_/g, '/')),
    );
    return decoded.sub ?? null;
  } catch {
    return null;
  }
}

// Rate limit super simples por user_id, em memoria.
// (Reseta quando a function reinicia; pra produciao trocar por KV/Redis.)
const rateLimits = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(
  userId: string,
  windowMs: number,
  maxRequests: number,
): { ok: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const entry = rateLimits.get(userId);

  if (!entry || now > entry.resetAt) {
    rateLimits.set(userId, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: maxRequests - 1, resetIn: windowMs };
  }

  if (entry.count >= maxRequests) {
    return { ok: false, remaining: 0, resetIn: entry.resetAt - now };
  }

  entry.count += 1;
  return { ok: true, remaining: maxRequests - entry.count, resetIn: entry.resetAt - now };
}

// Carrega a chave Gemini do user (sob user_settings.gemini_api_key) usando service role.
// Fallback: env var GEMINI_API_KEY (util pra desenvolvimento/MVP).
export async function getUserGeminiKey(userId: string): Promise<string | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (supabaseUrl && serviceKey) {
    try {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/user_settings?select=gemini_api_key&user_id=eq.${userId}&limit=1`,
        {
          headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
        },
      );
      if (res.ok) {
        const rows = (await res.json()) as Array<{ gemini_api_key: string | null }>;
        const userKey = rows[0]?.gemini_api_key;
        if (userKey) return userKey;
      }
    } catch (e) {
      console.warn('[getUserGeminiKey] DB fetch failed', e);
    }
  }
  // fallback global (env var no painel de Edge Functions)
  return Deno.env.get('GEMINI_API_KEY') ?? null;
}

// Log de uso (custo, tokens, etc) na tabela usage_events.
export async function logUsage(input: {
  userId: string;
  provider: 'gemini' | 'serpapi';
  product: 'text' | 'image' | 'image-search';
  model?: string;
  tokens_input?: number;
  tokens_output?: number;
  cost_usd?: number;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return;
  try {
    await fetch(`${supabaseUrl}/rest/v1/usage_events`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        user_id: input.userId,
        provider: input.provider,
        product: input.product,
        model: input.model,
        tokens_input: input.tokens_input,
        tokens_output: input.tokens_output,
        cost_usd: input.cost_usd,
        metadata: input.metadata ?? {},
      }),
    });
  } catch (e) {
    console.warn('[logUsage]', e);
  }
}
