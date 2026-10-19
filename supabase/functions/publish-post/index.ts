// Edge function: publish-post — publicação MANUAL (botão "Publicar").
// Recebe { post_id }, identifica o usuário pelo JWT e publica na plataforma do
// post. A lógica de LinkedIn/Instagram vive em _shared/publish.ts (reusada
// pelo publish-scheduler, que publica os posts agendados vencidos).

import { errorResponse, jsonResponse, preflight, userIdFromAuth } from '../_shared/security.ts';
import { findOnInstagram, inspectOne, publishOne, PublishStateError } from '../_shared/publish.ts';

interface Input { post_id: string; dry_run?: boolean; find_on_instagram?: string }

Deno.serve(async (req: Request) => {
  const cors = preflight(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Use POST', 405);

  try {
    const userId = userIdFromAuth(req);
    if (!userId) return errorResponse('Nao autenticado', 401);

    const input = (await req.json()) as Input;
    if (!input.post_id) return errorResponse('post_id obrigatorio', 400);

    // Verificação prévia (todos os formatos): rotina SÓ DE LEITURA, separada da publicação — nunca
    // reserva, conta tentativa nem chama rede social (doc 01 §4.4).
    if (input.dry_run) {
      try { return jsonResponse({ success: true, check: await inspectOne(input.post_id, userId) }); }
      catch (e) { return jsonResponse({ success: true, check: { ok: false, issues: [(e as Error).message], plan: [] } }); }
    }
    // Conferência de resultado incerto: procura a publicação nos posts recentes do Instagram da conta.
    if (input.find_on_instagram) {
      try { return jsonResponse({ success: true, ...(await findOnInstagram(input.find_on_instagram, userId)) }); }
      catch (e) { return errorResponse((e as Error).message, 400); }
    }
    try {
      const result = await publishOne(input.post_id, userId, { source: 'manual' });
      return jsonResponse({
        success: true,
        platform: result.platform,
        published_url: result.url,
        published_id: result.id,
        reused: !!result.reused,
      });
    } catch (e) {
      // Em andamento / precisa conferir: estado da operação para a interface (não é "tente de novo").
      if (e instanceof PublishStateError && (e.state === 'in_progress' || e.state === 'needs_reconciliation')) {
        return jsonResponse({ success: false, error: e.message, state: e.state, publication_id: e.publicationId ?? null }, 409);
      }
      return errorResponse('Falha ao publicar', 500, (e as Error).message);
    }
  } catch (e) {
    console.error('[publish-post outer]', e);
    return errorResponse('Erro interno', 500, String(e));
  }
});

export {};
