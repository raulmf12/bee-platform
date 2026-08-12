// Edge function: publish-scheduler — o AGENDADOR.
// Chamada periodicamente pelo pg_cron (a cada ~2min). Acha os posts com
// status='scheduled' e scheduled_date já vencido (<= agora, em UTC) e publica
// cada um via a mesma rotina do botão manual (_shared/publish.ts).
//
// Sem sessão de usuário: roda com a service_role. Publica SÓ o que já venceu,
// então acionar de novo não adianta posts futuros (idempotente na prática — ao
// publicar, o status vira 'published' e sai da fila). Deploy com --no-verify-jwt
// pra o cron conseguir chamar (mesmo padrão do editorial-line-tick).

import { corsHeaders, jsonResponse } from '../_shared/security.ts';
import { publishOne } from '../_shared/publish.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';

function svcHeaders(): HeadersInit {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  return { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
}

interface DuePost { id: string; user_id: string; scheduled_date: string }

// Janela de graça: só publica posts vencidos há no máximo isso. Cobre um atraso
// normal / uma queda breve do cron, mas NUNCA dispara posts antigos perdidos
// (ex: agendados no passado antes de existir o agendador). Fora da janela, o
// post fica como está — o usuário decide (reagendar / publicar / arquivar).
const GRACE_MS = 2 * 60 * 60 * 1000; // 2 horas

async function fetchDuePosts(): Promise<DuePost[]> {
  const now = Date.now();
  const upper = new Date(now).toISOString();          // já venceu (<= agora)
  const lower = new Date(now - GRACE_MS).toISOString(); // mas não faz mais de 2h
  const url = `${SUPABASE_URL}/rest/v1/user_posts` +
    `?select=id,user_id,scheduled_date` +
    `&status=eq.scheduled&scheduled_date=lte.${upper}&scheduled_date=gte.${lower}` +
    `&order=scheduled_date.asc&limit=10`;
  const res = await fetch(url, { headers: svcHeaders() });
  if (!res.ok) throw new Error(`fetch due posts HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return await res.json();
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const due = await fetchDuePosts();
    if (!due.length) return jsonResponse({ success: true, processed: 0, message: 'nada vencido' });

    const results: Array<{ id: string; ok: boolean; url?: string; error?: string }> = [];
    for (const post of due) {
      try {
        const r = await publishOne(post.id, post.user_id);
        results.push({ id: post.id, ok: true, url: r.url });
        console.log('[publish-scheduler] publicado', post.id, r.url);
      } catch (e) {
        results.push({ id: post.id, ok: false, error: (e as Error).message.slice(0, 200) });
        console.error('[publish-scheduler] falhou', post.id, (e as Error).message);
      }
    }

    const published = results.filter((r) => r.ok).length;
    return jsonResponse({ success: true, processed: due.length, published, failed: due.length - published, results });
  } catch (e) {
    console.error('[publish-scheduler outer]', e);
    return jsonResponse({ success: false, error: String(e) }, 500);
  }
});

export {};
