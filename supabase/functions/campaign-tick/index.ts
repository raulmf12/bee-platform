// Edge function: campaign-tick — cron diário da estrutura de Campanhas
// (substitui o editorial-line-tick no cutover). Para cada campanha ativa:
//   1. campanha que passou do fim → 'ended';
//   2. ciclo passado e pronto → 'done';
//   3. PRÉ-GERA a pauta do próximo ciclo quando ele começa em até 4 dias: planeja
//      (mesmo planejador determinístico do app — bundle gerado), chama o
//      cycle-pauta, grava as ideias propostas e deixa o ciclo 'pauta_ready' com
//      prazo de revisão na véspera → aparece na Home como "Revisar até …".
// Campanha que ainda não começou (sem nenhuma ideia) não é tocada: a Home já
// pede "Iniciar produção". Idempotente: só age em ciclo sem ideias.
//
// Quem chama: cron (service_role → todos), service_role + x-bee-user-id ou o
// próprio usuário (JWT) → só ele.
import { corsHeaders, errorResponse, isServiceCall, jsonResponse, preflight, userIdFromAuth } from '../_shared/security.ts';
import { fetchRest, svcHeaders } from '../_shared/gemini.ts';
import { buildCyclePlan } from '../_shared/campaign-plan.js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const LEAD_DAYS = 4;

// "Hoje" no fuso do Brasil (a função roda em UTC).
const todayBR = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);
const addDaysISO = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

interface Cycle { id: string; campaign_id: string; user_id: string; idx: number; start_date: string; end_date: string; status: string; plan: { needs?: unknown[] } | null }
// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

async function patch(table: string, id: string, body: Row): Promise<void> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, { method: 'PATCH', headers: { ...svcHeaders(), Prefer: 'return=minimal' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`PATCH ${table} ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

async function tickUser(userId: string, today: string) {
  const out = { user_id: userId, ended: 0, done: 0, pautas: [] as Array<{ cycle_id: string; ideas: number }>, errors: [] as string[] };
  const campaigns = await fetchRest<Row[]>(`/campaigns?user_id=eq.${userId}&status=eq.active&start_date=not.is.null&select=*`);
  const live = campaigns.filter((c) => c.metadata?.kind !== 'avulso');
  if (!live.length) return out;
  const accounts = await fetchRest<Row[]>(`/social_accounts?user_id=eq.${userId}&select=*`);

  for (const camp of live) {
    try {
      if (camp.end_date && camp.end_date < today) { await patch('campaigns', camp.id, { status: 'ended' }); out.ended++; continue; }
      const cycles = await fetchRest<Cycle[]>(`/campaign_cycles?campaign_id=eq.${camp.id}&select=*&order=idx.asc`);
      for (const c of cycles.filter((c) => c.end_date < today && c.status === 'ready')) { await patch('campaign_cycles', c.id, { status: 'done' }); out.done++; }

      const started = await fetchRest<Array<{ id: string }>>(`/ideas?campaign_id=eq.${camp.id}&select=id&limit=1`);
      if (!started.length) continue;
      const next = cycles.find((c) => c.start_date > today && c.start_date <= addDaysISO(today, LEAD_DAYS) && (c.status === 'not_started' || c.status === 'planned'));
      if (!next) continue;
      const existing = await fetchRest<Array<{ id: string }>>(`/ideas?cycle_id=eq.${next.id}&status=neq.discarded&select=id&limit=1`);
      if (existing.length) continue;

      const plan = next.plan?.needs?.length ? next.plan : buildCyclePlan(camp, next, accounts);
      if (!plan.needs?.length) { out.errors.push(`${next.id}: plano vazio (cadência?)`); continue; }
      await patch('campaign_cycles', next.id, { plan, status: 'planned' });

      const res = await fetch(`${SUPABASE_URL}/functions/v1/cycle-pauta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, 'x-bee-user-id': userId },
        body: JSON.stringify({ cycle_id: next.id, mode: 'full' }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.success || !Array.isArray(j.ideas)) { out.errors.push(`${next.id}: cycle-pauta ${res.status} ${(j.error ?? '').slice(0, 160)}`); continue; }

      const ins = await fetch(`${SUPABASE_URL}/rest/v1/ideas`, {
        method: 'POST', headers: { ...svcHeaders(), Prefer: 'return=minimal' },
        body: JSON.stringify(j.ideas.map((i: Row, n: number) => ({
          user_id: userId, campaign_id: camp.id, cycle_id: next.id, title: i.title, summary: i.summary,
          strategic_function: i.strategic_function, editorial_slug: i.editorial_slug, channels: i.channels,
          suggested_pieces: i.suggested_pieces, rationale: i.rationale, origin: 'hive', status: 'proposed', position: n,
        }))),
      });
      if (!ins.ok) { out.errors.push(`${next.id}: ideias ${ins.status}`); continue; }
      await patch('campaign_cycles', next.id, { status: 'pauta_ready', review_due: addDaysISO(next.start_date, -1) });
      out.pautas.push({ cycle_id: next.id, ideas: j.ideas.length });
    } catch (e) {
      out.errors.push(`${camp.id}: ${(e as Error).message.slice(0, 200)}`);
    }
  }
  return out;
}

Deno.serve(async (req: Request) => {
  const cors = preflight(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Use POST', 405);
  try {
    const isService = isServiceCall(req);
    const userId = isService ? req.headers.get('x-bee-user-id') : userIdFromAuth(req);
    if (!isService && !userId) return errorResponse('Nao autenticado', 401);
    const body = (await req.json().catch(() => ({}))) as { today?: string };
    // `today` só pode ser forçado por serviço (testes do cron).
    const today = isService && body.today && /^\d{4}-\d{2}-\d{2}$/.test(body.today) ? body.today : todayBR();

    let users: string[];
    if (userId) users = [userId];
    else {
      const rows = await fetchRest<Array<{ user_id: string }>>(`/campaigns?status=eq.active&select=user_id&limit=1000`);
      users = [...new Set(rows.map((r) => r.user_id))];
    }
    const results = [];
    for (const u of users) results.push(await tickUser(u, today));
    return jsonResponse({ success: true, today, users: results.length, results });
  } catch (e) {
    console.error('[campaign-tick]', e);
    return new Response(JSON.stringify({ success: false, error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
