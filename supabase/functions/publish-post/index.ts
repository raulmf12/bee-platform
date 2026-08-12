// Edge function: publish-post — publicação MANUAL (botão "Publicar").
// Recebe { post_id }, identifica o usuário pelo JWT e publica na plataforma do
// post. A lógica de LinkedIn/Instagram vive em _shared/publish.ts (reusada
// pelo publish-scheduler, que publica os posts agendados vencidos).

import { errorResponse, jsonResponse, preflight, userIdFromAuth } from '../_shared/security.ts';
import { publishOne } from '../_shared/publish.ts';

interface Input { post_id: string }

Deno.serve(async (req: Request) => {
  const cors = preflight(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Use POST', 405);

  try {
    const userId = userIdFromAuth(req);
    if (!userId) return errorResponse('Nao autenticado', 401);

    const input = (await req.json()) as Input;
    if (!input.post_id) return errorResponse('post_id obrigatorio', 400);

    try {
      const result = await publishOne(input.post_id, userId);
      return jsonResponse({
        success: true,
        platform: result.platform,
        published_url: result.url,
        published_id: result.id,
      });
    } catch (e) {
      return errorResponse('Falha ao publicar', 500, (e as Error).message);
    }
  } catch (e) {
    console.error('[publish-post outer]', e);
    return errorResponse('Erro interno', 500, String(e));
  }
});

export {};
