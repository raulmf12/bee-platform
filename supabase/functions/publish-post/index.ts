// Edge function: publish-post
// Recebe { post_id }. Le o post, decide plataforma, publica.
//
// LinkedIn (UGC posts API):
//   1. POST /v2/assets?action=registerUpload  -> registra upload de imagem
//   2. PUT no uploadUrl com o binario
//   3. POST /v2/ugcPosts com asset URN + texto
//
// Instagram Graph API (Content Publishing):
//   1. POST /{ig_user_id}/media com image_url ou video_url -> retorna container_id
//   2. (video) polling GET /{container_id}?fields=status_code ate FINISHED
//   3. POST /{ig_user_id}/media_publish com creation_id
//
// Atualiza post: status=published, published_url, published_at, publish_error, attempts++

import {
  errorResponse,
  jsonResponse,
  preflight,
  userIdFromAuth,
} from '../_shared/security.ts';

interface Input {
  post_id: string;
}

interface UserSettings {
  linkedin_token: string | null;
  linkedin_author_urn: string | null;
  instagram_access_token: string | null;
  instagram_business_account_id: string | null;
}

interface UserPost {
  id: string;
  platform: 'linkedin' | 'instagram';
  format: string;
  caption: string | null;
  rendered_slides: Record<string, string> | null;
  metadata: Record<string, unknown>;
  publish_attempts: number | null;
}

function svcHeaders(): HeadersInit {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';

async function loadPost(id: string): Promise<UserPost | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/user_posts?id=eq.${id}&select=id,platform,format,caption,rendered_slides,metadata,publish_attempts&limit=1`,
    { headers: svcHeaders() },
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] ?? null;
}

async function loadSettings(userId: string): Promise<UserSettings | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/user_settings?user_id=eq.${userId}&select=linkedin_token,linkedin_author_urn,instagram_access_token,instagram_business_account_id&limit=1`,
    { headers: svcHeaders() },
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] ?? null;
}

async function updatePost(id: string, patch: Record<string, unknown>): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/user_posts?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...svcHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  });
}

// ============================================================================
// LINKEDIN
// ============================================================================

interface LiPublishResult {
  url: string;
  id: string;
}

async function publishLinkedInImage(
  token: string,
  authorUrn: string,
  imageUrl: string,
  caption: string,
): Promise<LiPublishResult> {
  // 1. Register upload
  const regRes = await fetch('https://api.linkedin.com/v2/assets?action=registerUpload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      registerUploadRequest: {
        recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
        owner: authorUrn,
        serviceRelationships: [
          { relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' },
        ],
      },
    }),
  });
  if (!regRes.ok) {
    throw new Error(`LinkedIn registerUpload falhou: ${regRes.status} ${(await regRes.text()).slice(0, 300)}`);
  }
  const regData = await regRes.json();
  const uploadUrl =
    regData.value?.uploadMechanism?.['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']?.uploadUrl;
  const asset = regData.value?.asset;
  if (!uploadUrl || !asset) throw new Error('LinkedIn registerUpload sem uploadUrl/asset');

  // 2. Baixar binario da imagem
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`Falha ao baixar imagem (${imgRes.status})`);
  const imgBlob = await imgRes.blob();

  // 3. PUT no uploadUrl
  const upRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: imgBlob,
  });
  if (!upRes.ok) {
    throw new Error(`LinkedIn upload binario falhou: ${upRes.status} ${(await upRes.text()).slice(0, 200)}`);
  }

  // 4. Criar UGC post
  const ugcRes = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      author: authorUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: caption },
          shareMediaCategory: 'IMAGE',
          media: [{ status: 'READY', media: asset }],
        },
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    }),
  });
  if (!ugcRes.ok) {
    throw new Error(`LinkedIn ugcPosts falhou: ${ugcRes.status} ${(await ugcRes.text()).slice(0, 300)}`);
  }
  const postId = ugcRes.headers.get('x-restli-id') ?? '';
  const url = `https://www.linkedin.com/feed/update/${encodeURIComponent(postId)}/`;
  return { url, id: postId };
}

async function publishLinkedInTextOnly(
  token: string,
  authorUrn: string,
  caption: string,
): Promise<LiPublishResult> {
  const ugcRes = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      author: authorUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: caption },
          shareMediaCategory: 'NONE',
        },
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    }),
  });
  if (!ugcRes.ok) {
    throw new Error(`LinkedIn ugcPosts (text) falhou: ${ugcRes.status} ${(await ugcRes.text()).slice(0, 300)}`);
  }
  const postId = ugcRes.headers.get('x-restli-id') ?? '';
  return { url: `https://www.linkedin.com/feed/update/${encodeURIComponent(postId)}/`, id: postId };
}

// ============================================================================
// INSTAGRAM
// ============================================================================

interface IgPublishResult {
  url: string;
  id: string;
}

const IG_API_VERSION = 'v21.0';

async function publishInstagramImage(
  token: string,
  igBusinessId: string,
  imageUrl: string,
  caption: string,
): Promise<IgPublishResult> {
  // 1. Criar container
  const params = new URLSearchParams({
    image_url: imageUrl,
    caption,
    access_token: token,
  });
  const cRes = await fetch(`https://graph.facebook.com/${IG_API_VERSION}/${igBusinessId}/media`, {
    method: 'POST',
    body: params,
  });
  const cData = await cRes.json();
  if (!cRes.ok || !cData.id) {
    throw new Error(`IG create container falhou: ${cData.error?.message ?? JSON.stringify(cData).slice(0, 300)}`);
  }
  const containerId = cData.id as string;

  // 2. Publish
  const pRes = await fetch(`https://graph.facebook.com/${IG_API_VERSION}/${igBusinessId}/media_publish`, {
    method: 'POST',
    body: new URLSearchParams({ creation_id: containerId, access_token: token }),
  });
  const pData = await pRes.json();
  if (!pRes.ok || !pData.id) {
    throw new Error(`IG media_publish falhou: ${pData.error?.message ?? JSON.stringify(pData).slice(0, 300)}`);
  }
  return { url: `https://www.instagram.com/p/${pData.id}/`, id: pData.id };
}

async function publishInstagramVideo(
  token: string,
  igBusinessId: string,
  videoUrl: string,
  caption: string,
): Promise<IgPublishResult> {
  // 1. Criar container REELS
  const params = new URLSearchParams({
    media_type: 'REELS',
    video_url: videoUrl,
    caption,
    access_token: token,
  });
  const cRes = await fetch(`https://graph.facebook.com/${IG_API_VERSION}/${igBusinessId}/media`, {
    method: 'POST',
    body: params,
  });
  const cData = await cRes.json();
  if (!cRes.ok || !cData.id) {
    throw new Error(`IG create video container falhou: ${cData.error?.message ?? JSON.stringify(cData).slice(0, 300)}`);
  }
  const containerId = cData.id as string;

  // 2. Polling status (max 5min)
  const start = Date.now();
  const TIMEOUT_MS = 5 * 60 * 1000;
  const INTERVAL_MS = 5000;
  let status = 'IN_PROGRESS';
  while (status !== 'FINISHED' && Date.now() - start < TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
    const sRes = await fetch(
      `https://graph.facebook.com/${IG_API_VERSION}/${containerId}?fields=status_code&access_token=${token}`,
    );
    const sData = await sRes.json();
    status = sData.status_code ?? 'IN_PROGRESS';
    if (status === 'ERROR' || status === 'EXPIRED') {
      throw new Error(`IG container processou com erro: status=${status}`);
    }
  }
  if (status !== 'FINISHED') {
    throw new Error(`IG video processing timeout (>5min). Container nao ficou pronto.`);
  }

  // 3. Publish
  const pRes = await fetch(`https://graph.facebook.com/${IG_API_VERSION}/${igBusinessId}/media_publish`, {
    method: 'POST',
    body: new URLSearchParams({ creation_id: containerId, access_token: token }),
  });
  const pData = await pRes.json();
  if (!pRes.ok || !pData.id) {
    throw new Error(`IG media_publish (reel) falhou: ${pData.error?.message ?? JSON.stringify(pData).slice(0, 300)}`);
  }
  return { url: `https://www.instagram.com/reel/${pData.id}/`, id: pData.id };
}

// ============================================================================
// HANDLER
// ============================================================================

Deno.serve(async (req: Request) => {
  const cors = preflight(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Use POST', 405);

  try {
    const userId = userIdFromAuth(req);
    if (!userId) return errorResponse('Nao autenticado', 401);

    const input = (await req.json()) as Input;
    if (!input.post_id) return errorResponse('post_id obrigatorio', 400);

    const post = await loadPost(input.post_id);
    if (!post) return errorResponse('Post nao encontrado', 404);

    const settings = await loadSettings(userId);
    if (!settings) return errorResponse('user_settings nao configurado', 400);

    const caption = post.caption ?? '';
    if (!caption.trim()) {
      return errorResponse('Post sem caption — adicione antes de publicar', 400);
    }

    // Atualiza contador antes de tentar
    const attempts = (post.publish_attempts ?? 0) + 1;
    await updatePost(post.id, { publish_attempts: attempts, publish_error: null });

    try {
      let result: { url: string; id: string };

      if (post.platform === 'linkedin') {
        if (!settings.linkedin_token || !settings.linkedin_author_urn) {
          throw new Error('LinkedIn nao configurado. Vai em Configuracoes > Integracoes.');
        }
        if (post.format === 'video') {
          throw new Error('Publicacao de video no LinkedIn ainda nao implementada (use o app nativo por enquanto).');
        }
        const imageUrl = post.rendered_slides?.slide1;
        if (imageUrl) {
          result = await publishLinkedInImage(
            settings.linkedin_token,
            settings.linkedin_author_urn,
            imageUrl,
            caption,
          );
        } else {
          // Sem imagem renderizada — publica so texto
          result = await publishLinkedInTextOnly(settings.linkedin_token, settings.linkedin_author_urn, caption);
        }
      } else if (post.platform === 'instagram') {
        if (!settings.instagram_access_token || !settings.instagram_business_account_id) {
          throw new Error('Instagram nao configurado. Vai em Configuracoes > Integracoes.');
        }
        if (post.format === 'video') {
          const videoUrl = (post.metadata as { video_url?: string })?.video_url;
          if (!videoUrl) throw new Error('video_url ausente no post metadata');
          result = await publishInstagramVideo(
            settings.instagram_access_token,
            settings.instagram_business_account_id,
            videoUrl,
            caption,
          );
        } else {
          const imageUrl = post.rendered_slides?.slide1;
          if (!imageUrl) throw new Error('Imagem nao renderizada. Clica em "Exportar" no editor antes.');
          result = await publishInstagramImage(
            settings.instagram_access_token,
            settings.instagram_business_account_id,
            imageUrl,
            caption,
          );
        }
      } else {
        throw new Error(`Plataforma nao suportada: ${post.platform}`);
      }

      await updatePost(post.id, {
        status: 'published',
        published_url: result.url,
        published_at: new Date().toISOString(),
        published_date: new Date().toISOString(),
        publish_error: null,
      });

      return jsonResponse({
        success: true,
        platform: post.platform,
        published_url: result.url,
        published_id: result.id,
      });
    } catch (e) {
      const errMsg = (e as Error).message;
      await updatePost(post.id, { publish_error: errMsg.slice(0, 1000) });
      console.error('[publish-post]', errMsg);
      return errorResponse('Falha ao publicar', 500, errMsg);
    }
  } catch (e) {
    console.error('[publish-post outer]', e);
    return errorResponse('Erro interno', 500, String(e));
  }
});

export {};
