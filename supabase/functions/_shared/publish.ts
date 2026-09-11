// Lógica de PUBLICAÇÃO compartilhada entre:
//   - publish-post (botão manual "Publicar", com JWT do usuário)
//   - publish-scheduler (cron, publica os posts agendados vencidos)
// Assim a mesma rotina de LinkedIn/Instagram serve os dois sem duplicar.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';

function svcHeaders(): HeadersInit {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };
}

export interface PublishablePost {
  id: string;
  user_id: string;
  platform: 'linkedin' | 'instagram';
  format: string;
  caption: string | null;
  rendered_slides: Record<string, string> | null;
  metadata: Record<string, unknown>;
  publish_attempts: number | null;
  // Portão de imagem: posts com imagem gerada por IA (visual_decision) só
  // publicam depois de image_approved=true.
  visual_decision: unknown | null;
  image_approved: boolean | null;
}

interface UserSettings {
  linkedin_token: string | null;
  linkedin_author_urn: string | null;
  instagram_access_token: string | null;
  instagram_business_account_id: string | null;
}

export interface PublishResult { url: string; id: string; platform: string }

async function loadPost(id: string): Promise<PublishablePost | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/user_posts?id=eq.${id}&select=id,user_id,platform,format,caption,rendered_slides,metadata,publish_attempts,visual_decision,image_approved&limit=1`,
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

async function publishLinkedInImage(token: string, authorUrn: string, imageUrl: string, caption: string): Promise<PublishResult> {
  const regRes = await fetch('https://api.linkedin.com/v2/assets?action=registerUpload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Restli-Protocol-Version': '2.0.0' },
    body: JSON.stringify({
      registerUploadRequest: {
        recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
        owner: authorUrn,
        serviceRelationships: [{ relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' }],
      },
    }),
  });
  if (!regRes.ok) throw new Error(`LinkedIn registerUpload falhou: ${regRes.status} ${(await regRes.text()).slice(0, 300)}`);
  const regData = await regRes.json();
  const uploadUrl = regData.value?.uploadMechanism?.['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']?.uploadUrl;
  const asset = regData.value?.asset;
  if (!uploadUrl || !asset) throw new Error('LinkedIn registerUpload sem uploadUrl/asset');

  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`Falha ao baixar imagem (${imgRes.status})`);
  const imgBlob = await imgRes.blob();

  const upRes = await fetch(uploadUrl, { method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body: imgBlob });
  if (!upRes.ok) throw new Error(`LinkedIn upload binario falhou: ${upRes.status} ${(await upRes.text()).slice(0, 200)}`);

  const ugcRes = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Restli-Protocol-Version': '2.0.0' },
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
  if (!ugcRes.ok) throw new Error(`LinkedIn ugcPosts falhou: ${ugcRes.status} ${(await ugcRes.text()).slice(0, 300)}`);
  const postId = ugcRes.headers.get('x-restli-id') ?? '';
  return { url: `https://www.linkedin.com/feed/update/${encodeURIComponent(postId)}/`, id: postId, platform: 'linkedin' };
}

async function publishLinkedInTextOnly(token: string, authorUrn: string, caption: string): Promise<PublishResult> {
  const ugcRes = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Restli-Protocol-Version': '2.0.0' },
    body: JSON.stringify({
      author: authorUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: { 'com.linkedin.ugc.ShareContent': { shareCommentary: { text: caption }, shareMediaCategory: 'NONE' } },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    }),
  });
  if (!ugcRes.ok) throw new Error(`LinkedIn ugcPosts (text) falhou: ${ugcRes.status} ${(await ugcRes.text()).slice(0, 300)}`);
  const postId = ugcRes.headers.get('x-restli-id') ?? '';
  return { url: `https://www.linkedin.com/feed/update/${encodeURIComponent(postId)}/`, id: postId, platform: 'linkedin' };
}

// ============================================================================
// INSTAGRAM
// ============================================================================

const IG_API_VERSION = 'v21.0';

async function publishInstagramImage(token: string, igBusinessId: string, imageUrl: string, caption: string): Promise<PublishResult> {
  const cRes = await fetch(`https://graph.facebook.com/${IG_API_VERSION}/${igBusinessId}/media`, {
    method: 'POST',
    body: new URLSearchParams({ image_url: imageUrl, caption, access_token: token }),
  });
  const cData = await cRes.json();
  if (!cRes.ok || !cData.id) throw new Error(`IG create container falhou: ${cData.error?.message ?? JSON.stringify(cData).slice(0, 300)}`);
  const pRes = await fetch(`https://graph.facebook.com/${IG_API_VERSION}/${igBusinessId}/media_publish`, {
    method: 'POST',
    body: new URLSearchParams({ creation_id: cData.id as string, access_token: token }),
  });
  const pData = await pRes.json();
  if (!pRes.ok || !pData.id) throw new Error(`IG media_publish falhou: ${pData.error?.message ?? JSON.stringify(pData).slice(0, 300)}`);
  return { url: `https://www.instagram.com/p/${pData.id}/`, id: pData.id, platform: 'instagram' };
}

async function publishInstagramVideo(token: string, igBusinessId: string, videoUrl: string, caption: string): Promise<PublishResult> {
  const cRes = await fetch(`https://graph.facebook.com/${IG_API_VERSION}/${igBusinessId}/media`, {
    method: 'POST',
    body: new URLSearchParams({ media_type: 'REELS', video_url: videoUrl, caption, access_token: token }),
  });
  const cData = await cRes.json();
  if (!cRes.ok || !cData.id) throw new Error(`IG create video container falhou: ${cData.error?.message ?? JSON.stringify(cData).slice(0, 300)}`);
  const containerId = cData.id as string;

  const start = Date.now();
  const TIMEOUT_MS = 5 * 60 * 1000;
  let status = 'IN_PROGRESS';
  while (status !== 'FINISHED' && Date.now() - start < TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, 5000));
    const sRes = await fetch(`https://graph.facebook.com/${IG_API_VERSION}/${containerId}?fields=status_code&access_token=${token}`);
    const sData = await sRes.json();
    status = sData.status_code ?? 'IN_PROGRESS';
    if (status === 'ERROR' || status === 'EXPIRED') throw new Error(`IG container processou com erro: status=${status}`);
  }
  if (status !== 'FINISHED') throw new Error('IG video processing timeout (>5min).');

  const pRes = await fetch(`https://graph.facebook.com/${IG_API_VERSION}/${igBusinessId}/media_publish`, {
    method: 'POST',
    body: new URLSearchParams({ creation_id: containerId, access_token: token }),
  });
  const pData = await pRes.json();
  if (!pRes.ok || !pData.id) throw new Error(`IG media_publish (reel) falhou: ${pData.error?.message ?? JSON.stringify(pData).slice(0, 300)}`);
  return { url: `https://www.instagram.com/reel/${pData.id}/`, id: pData.id, platform: 'instagram' };
}

// ============================================================================
// ORQUESTRADOR — carrega post + settings, publica, atualiza o post.
// Lança em caso de erro (já tendo gravado publish_error no post).
// ============================================================================

export async function publishOne(postId: string, userId: string): Promise<PublishResult> {
  const post = await loadPost(postId);
  if (!post) throw new Error('Post nao encontrado');

  const settings = await loadSettings(userId);
  if (!settings) throw new Error('user_settings nao configurado');

  // Conta a tentativa e limpa o erro anterior ANTES de qualquer checagem/portão.
  // Assim QUALQUER falha (inclusive portão) grava publish_error e fica VISÍVEL.
  // Antes os portões davam throw ANTES daqui: a falha sumia (attempts=0/erro=null)
  // e, com a janela de graça de 2h do agendador, um post agendado que batia num
  // portão nunca publicava e NÃO deixava rastro — perda silenciosa e permanente.
  await updatePost(post.id, { publish_attempts: (post.publish_attempts ?? 0) + 1, publish_error: null });

  try {
    const caption = post.caption ?? '';
    if (!caption.trim()) throw new Error('Post sem caption — adicione antes de publicar');

    // PORTÃO DA IMAGEM DE IA: M01-D/E (fundo de IA) e TODO M02 (cena gerada por
    // IA) exigem aprovação EXPLÍCITA (metadata.bg_approved). É o ÚNICO portão que
    // resta: agendar/stand-by/publicar já implicam a aprovação geral (o portão
    // geral de image_approved foi removido — barrava posts agendados que o humano
    // já tinha revisado, causando a perda silenciosa acima).
    const variant = (post.visual_decision as { variant?: string } | null)?.variant;
    const usesAiImage = variant === 'M01-D' || variant === 'M01-E' || (variant?.startsWith('M02-') ?? false);
    if (usesAiImage && post.metadata?.bg_approved !== true) {
      throw new Error('Aprove a imagem de IA antes de publicar (portão de imagem — M01-D/E e M02).');
    }

    let result: PublishResult;

    if (post.platform === 'linkedin') {
      if (!settings.linkedin_token || !settings.linkedin_author_urn) {
        throw new Error('LinkedIn nao configurado. Vai em Configuracoes > Integracoes.');
      }
      if (post.format === 'video') throw new Error('Publicacao de video no LinkedIn ainda nao implementada.');
      const imageUrl = post.rendered_slides?.slide1;
      result = imageUrl
        ? await publishLinkedInImage(settings.linkedin_token, settings.linkedin_author_urn, imageUrl, caption)
        : await publishLinkedInTextOnly(settings.linkedin_token, settings.linkedin_author_urn, caption);
    } else if (post.platform === 'instagram') {
      if (!settings.instagram_access_token || !settings.instagram_business_account_id) {
        throw new Error('Instagram nao configurado. Vai em Configuracoes > Integracoes.');
      }
      if (post.format === 'video') {
        const videoUrl = (post.metadata as { video_url?: string })?.video_url;
        if (!videoUrl) throw new Error('video_url ausente no post metadata');
        result = await publishInstagramVideo(settings.instagram_access_token, settings.instagram_business_account_id, videoUrl, caption);
      } else {
        const imageUrl = post.rendered_slides?.slide1;
        if (!imageUrl) throw new Error('Imagem não renderizada. Abra o post no editor e clique em Stand-by (renderiza automático) antes de agendar/publicar.');
        result = await publishInstagramImage(settings.instagram_access_token, settings.instagram_business_account_id, imageUrl, caption);
      }
    } else {
      throw new Error(`Plataforma nao suportada: ${post.platform}`);
    }

    const nowIso = new Date().toISOString();
    await updatePost(post.id, {
      status: 'published',
      published_url: result.url,
      published_at: nowIso,
      published_date: nowIso,
      publish_error: null,
    });
    return result;
  } catch (e) {
    const errMsg = (e as Error).message;
    await updatePost(post.id, { publish_error: errMsg.slice(0, 1000) });
    console.error('[publishOne]', postId, errMsg);
    throw e;
  }
}
