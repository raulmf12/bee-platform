// Edge function: commit-learning
//
// Grava uma lição CONFIRMADA pelo usuário (veio do agente de voz). Faz o mesmo
// dedup do learn-from-correction, mas dentro de (faceta × alcance): uma lição
// global e uma de segmento são coisas diferentes, mesmo com texto parecido.
//
// Confirmar é o portão humano: o agente só PROPÕE; nada entra no prompt sem o
// usuário clicar em salvar aqui. É o que protege a voz.

import {
  errorResponse, jsonResponse, preflight, userIdFromAuth, checkRateLimit,
} from '../_shared/security.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const DEDUP_THRESHOLD = 0.45; // mesmo limiar medido do learn-from-correction

interface Scope {
  editorial_slug?: string | null;
  platform?: string | null;
  target_avatar?: string | null;
}

interface Learning {
  id: string;
  texto: string;
  categoria: string;
  facet: string;
  evidencias: number;
  editorial_slug: string | null;
  platform: string | null;
  target_avatar: string | null;
}

function sbHeaders(extra: Record<string, string> = {}) {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...extra };
}

function bigrams(s: string): Set<string> {
  const norm = s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const out = new Set<string>();
  for (let i = 0; i < norm.length - 1; i++) out.add(norm.slice(i, i + 2));
  return out;
}
function similarity(a: string, b: string): number {
  const A = bigrams(a), B = bigrams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return inter / (A.size + B.size - inter);
}

// Duas lições estão no mesmo alcance? (mesma faceta já garantida antes)
function sameScope(a: Scope, b: Scope): boolean {
  return (a.editorial_slug ?? null) === (b.editorial_slug ?? null)
    && (a.platform ?? null) === (b.platform ?? null)
    && (a.target_avatar ?? null) === (b.target_avatar ?? null);
}

Deno.serve(async (req: Request) => {
  const cors = preflight(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Use POST', 405);

  try {
    const userId = userIdFromAuth(req);
    if (!userId) return errorResponse('Nao autenticado', 401);

    const rl = checkRateLimit(userId, 60_000, 40);
    if (!rl.ok) return errorResponse(`Rate limit. Tente em ${Math.ceil(rl.resetIn / 1000)}s`, 429);

    const body = await req.json() as {
      texto?: string; categoria?: string; facet?: string;
      scope?: Scope; chat_message_id?: string;
    };
    const texto = (body.texto ?? '').trim();
    if (!texto) return errorResponse('texto obrigatorio', 400);

    const facet = ['texto', 'legenda', 'imagem'].includes(body.facet ?? '') ? body.facet! : 'texto';
    const categoria = ['voz', 'estrutura', 'lexico', 'tom', 'tamanho'].includes(body.categoria ?? '')
      ? body.categoria! : 'voz';
    const scope: Scope = {
      editorial_slug: body.scope?.editorial_slug || null,
      platform: body.scope?.platform || null,
      target_avatar: body.scope?.target_avatar || null,
    };

    // Lições existentes da MESMA faceta (o alcance filtramos em JS).
    const exRes = await fetch(
      `${SUPABASE_URL}/rest/v1/ai_learnings?user_id=eq.${userId}&facet=eq.${facet}` +
        `&select=id,texto,categoria,facet,evidencias,editorial_slug,platform,target_avatar`,
      { headers: sbHeaders() },
    );
    const existing = (await exRes.json()) as Learning[];

    const match = existing
      .filter((e) => sameScope(e, scope))
      .map((e) => ({ e, sim: similarity(e.texto, texto) }))
      .sort((a, b) => b.sim - a.sim)[0];

    if (match && match.sim >= DEDUP_THRESHOLD) {
      // Já sabíamos: reforça (mais evidência) em vez de duplicar.
      await fetch(`${SUPABASE_URL}/rest/v1/ai_learnings?id=eq.${match.e.id}`, {
        method: 'PATCH',
        headers: sbHeaders({ Prefer: 'return=representation' }),
        body: JSON.stringify({ evidencias: match.e.evidencias + 1, last_reforcada_em: new Date().toISOString(), ativo: true }),
      });
      return jsonResponse({ success: true, reforcou: true, learning_id: match.e.id, texto: match.e.texto });
    }

    const ins = await fetch(`${SUPABASE_URL}/rest/v1/ai_learnings`, {
      method: 'POST',
      headers: sbHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify({
        user_id: userId,
        texto, categoria, facet,
        origem: 'conversa',
        editorial_slug: scope.editorial_slug,
        platform: scope.platform,
        target_avatar: scope.target_avatar,
        origem_chat_message_id: body.chat_message_id ?? null,
        evidencias: 1,
        ativo: true,
      }),
    });
    if (!ins.ok) return errorResponse('Erro ao salvar licao', 500, (await ins.text()).slice(0, 200));
    const [row] = await ins.json();
    return jsonResponse({ success: true, reforcou: false, learning_id: row?.id, texto });
  } catch (e) {
    console.error('[commit-learning]', e);
    return errorResponse('Erro ao salvar licao', 500, (e as Error).message);
  }
});
