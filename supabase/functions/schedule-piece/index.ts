// Edge function: schedule-piece — o COORDENADOR ÚNICO de agendamento (Estabilização · docs 02 §9, 03 §8–§11).
// Agenda (arraste, painel, sugestão, lote), editor, wizard e produção chamam só esta função.
//
// Entrada: { command_id, post_id, intent: 'schedule'|'reschedule'|'unschedule'|'replace_package',
//            when?: ISO, expected_version?: number, plan_id?: uuid }
//   schedule        → confere prontidão, FECHA o pacote imutável da versão atual e agenda com ele
//   reschedule      → muda só a data/hora; o pacote programado continua o mesmo
//   unschedule      → retira da agenda (o pacote e o comando ficam no histórico)
//   replace_package → adota explicitamente a versão atual (aprovada) no lugar do pacote programado
// O mesmo command_id com os mesmos dados devolve o resultado já gravado (retentativa segura);
// com dados diferentes é conflito. Saída: { success, result } | { success:false, error, code }.

import { errorResponse, jsonResponse, preflight, userIdFromAuth } from '../_shared/security.ts';
import { rest, rpc, sealPackage, sha256Hex, canonical } from '../_shared/package.ts';

interface Input { command_id?: string; post_id?: string; intent?: string; when?: string | null; expected_version?: number | null; plan_id?: string | null }
const INTENTS = ['schedule', 'reschedule', 'unschedule', 'replace_package'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HTTP: Record<string, number> = { PT404: 404, PT409: 409, PT422: 422 };

Deno.serve(async (req: Request) => {
  const cors = preflight(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Use POST', 405);
  const userId = userIdFromAuth(req);
  if (!userId) return errorResponse('Nao autenticado', 401);

  const b = (await req.json().catch(() => ({}))) as Input;
  if (!b.command_id || !UUID.test(b.command_id)) return errorResponse('command_id obrigatório', 400);
  if (!b.post_id || !UUID.test(b.post_id)) return errorResponse('post_id obrigatório', 400);
  if (!b.intent || !INTENTS.includes(b.intent)) return errorResponse('intent inválida', 400);
  const when = b.when ? new Date(b.when) : null;
  if (b.when && Number.isNaN(when!.getTime())) return errorResponse('Data inválida', 422);
  if ((b.intent === 'schedule' || b.intent === 'reschedule') && !when) return errorResponse('Escolha a data e a hora.', 422);

  const params = { post_id: b.post_id, intent: b.intent, when: when?.toISOString() ?? null, expected_version: b.expected_version ?? null };
  const paramsSha = await sha256Hex(canonical(params));
  const commit = (packageId: string | null) => rpc<Record<string, unknown>>('commit_schedule', {
    p_command: b.command_id, p_user: userId, p_post: b.post_id, p_intent: b.intent, p_when: params.when,
    p_package: packageId, p_expected_version: params.expected_version, p_params_sha: paramsSha, p_plan: b.plan_id ?? null,
  });

  try {
    // Retentativa do mesmo pedido: devolve o resultado gravado sem fechar outro pacote.
    const [prev] = await rest<Array<{ command_id: string }>>(`/schedule_commands?command_id=eq.${b.command_id}&select=command_id`);
    if (prev) return jsonResponse({ success: true, result: await commit(null) });

    let packageId: string | null = null;
    if (b.intent === 'schedule' || b.intent === 'replace_package') {
      const [post] = await rest<Array<{ user_id: string; version: number }>>(`/user_posts?id=eq.${b.post_id}&select=user_id,version`);
      if (!post || post.user_id !== userId) return jsonResponse({ success: false, error: 'Peça não encontrada.', code: 'PT404' }, 404);
      if (params.expected_version != null && post.version !== params.expected_version) {
        return jsonResponse({ success: false, error: `A peça mudou enquanto você agendava (versão ${params.expected_version} → ${post.version}). Revise e tente de novo.`, code: 'PT409' }, 409);
      }
      const ready = await rpc<{ ready: boolean; missing: Array<{ component: string; reason: string }> }>('piece_readiness', { p_post: b.post_id, p_scope: 'schedule' });
      if (!ready.ready) {
        return jsonResponse({ success: false, error: `A peça não está pronta para agendar: ${ready.missing.map((m) => m.reason).join(' ')}`, code: 'PT422', missing: ready.missing }, 422);
      }
      packageId = (await sealPackage(b.post_id, userId, 'schedule', b.command_id)).id;
    }
    return jsonResponse({ success: true, result: await commit(packageId) });
  } catch (e) {
    const err = e as Error & { code?: string; status?: number };
    const status = HTTP[err.code ?? ''] ?? (err.status && err.status < 500 ? err.status : 500);
    console.error('[schedule-piece]', b.intent, b.post_id, err.message);
    return jsonResponse({ success: false, error: err.message, code: err.code ?? null }, status);
  }
});

export {};
