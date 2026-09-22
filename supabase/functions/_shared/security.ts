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

// Identidade em chamadas SERVICO->SERVICO.
//
// O JWT do service_role nao tem `sub`, entao userIdFromAuth() devolve null e a
// funcao responde 401. Era por isso que o editorial-line-tick (cron, sem
// sessao) nunca conseguia chamar o generate-content: a campanha autonoma
// jamais gerou um post.
//
// Aqui o chamador diz por quem esta agindo via header. So vale se o Bearer for
// EXATAMENTE a service_role — uma chave que so existe no servidor. Um cliente
// nunca consegue forjar isto: nao tem a chave.
export function internalUserId(req: Request): string | null {
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceKey || token !== serviceKey) return null;
  return req.headers.get('x-bee-user-id');
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

// Carrega a chave OpenAI do user (user_settings.openai_api_key) — usada pra testar
// os modelos de imagem GPT (gpt-image-2.5-*). Mesmo padrão da Gemini.
export async function getUserOpenAIKey(userId: string): Promise<string | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (supabaseUrl && serviceKey) {
    try {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/user_settings?select=openai_api_key&user_id=eq.${userId}&limit=1`,
        { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
      );
      if (res.ok) {
        const rows = (await res.json()) as Array<{ openai_api_key: string | null }>;
        const userKey = rows[0]?.openai_api_key;
        if (userKey) return userKey;
      }
    } catch (e) {
      console.warn('[getUserOpenAIKey] DB fetch failed', e);
    }
  }
  return Deno.env.get('OPENAI_API_KEY') ?? null;
}

// Tabela de preços (USD). Mantém em sincronia com src/lib/pricing.ts.
// Texto: por 1M tokens (in/out). Imagem: por imagem. Busca: por chamada.
// Preços reais (ai.google.dev/gemini-api/docs/pricing, ago/2026). Sincronizar
// com src/lib/pricing.ts. 3.x usa a mesma faixa do 2.5 equivalente.
const PRICE: Record<string, { inPerM?: number; outPerM?: number; perImage?: number; perCall?: number }> = {
  'gemini-2.5-flash': { inPerM: 0.30, outPerM: 2.50 },
  'gemini-3.5-flash': { inPerM: 0.30, outPerM: 2.50 },
  'gemini-2.5-flash-lite': { inPerM: 0.10, outPerM: 0.40 },
  'gemini-3.1-flash-lite': { inPerM: 0.10, outPerM: 0.40 },
  'gemini-2.5-pro': { inPerM: 1.25, outPerM: 10.0 },
  'gemini-3.1-pro-preview': { inPerM: 1.25, outPerM: 10.0 },
  'gemini-embedding-001': { inPerM: 0.15, outPerM: 0 },
  'gemini-2.5-flash-image': { perImage: 0.039 },
  // OpenAI GPT Image 2.5 — preço POR TOKEN (in $5/M texto, out $30/M imagem). O
  // custo real por imagem sai do `usage` que a API devolve; aqui é só fallback.
  'gpt-image-2.5-flare': { inPerM: 5, outPerM: 30 },
  'gpt-image-2.5-sunburst': { inPerM: 5, outPerM: 30 },
  'imagen-3.0-generate-002': { perImage: 0.04 },
  'imagen-4.0-generate-001': { perImage: 0.04 },
  'imagen-3.0-generate-001': { perImage: 0.04 },
  serpapi: { perCall: 0.01 },
};
const DEFAULT_PRICE: Record<string, { inPerM?: number; outPerM?: number; perImage?: number; perCall?: number }> = {
  text: { inPerM: 0.30, outPerM: 2.50 }, image: { perImage: 0.04 }, 'image-search': { perCall: 0.01 },
};
function estimateCost(input: { product: string; model?: string; tokens_input?: number; tokens_output?: number }): number {
  const p = (input.model && PRICE[input.model]) || DEFAULT_PRICE[input.product] || {};
  if (p.perImage != null) return p.perImage;
  if (p.perCall != null) return p.perCall;
  // Por token — texto E imagem token-priced (ex: gpt-image-2.5-*, cujo custo vem
  // do output de imagem). Se houver tokens, calcula; senão cai no fallback do produto.
  const ti = input.tokens_input ?? 0, to = input.tokens_output ?? 0;
  const tokenCost = (ti / 1_000_000) * (p.inPerM ?? 0) + (to / 1_000_000) * (p.outPerM ?? 0);
  if (tokenCost > 0) return tokenCost;
  if (input.product === 'image') return DEFAULT_PRICE.image.perImage ?? 0;
  if (input.product === 'image-search') return DEFAULT_PRICE['image-search'].perCall ?? 0;
  return 0;
}

// Log de uso (custo, tokens, etc) na tabela usage_events.
export async function logUsage(input: {
  userId: string;
  provider: 'gemini' | 'serpapi' | 'openai';
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
        cost_usd: input.cost_usd ?? estimateCost({
          product: input.product, model: input.model,
          tokens_input: input.tokens_input, tokens_output: input.tokens_output,
        }),
        metadata: input.metadata ?? {},
      }),
    });
  } catch (e) {
    console.warn('[logUsage]', e);
  }
}
