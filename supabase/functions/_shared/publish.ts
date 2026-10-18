// Lógica de PUBLICAÇÃO compartilhada entre:
//   - publish-post (botão manual "Publicar", com JWT do usuário)
//   - publish-scheduler (cron, publica os posts agendados vencidos)
// Assim a mesma rotina de LinkedIn/Instagram serve os dois sem duplicar.

import { capabilityOf, checkPackage, closePublication, isSequence, loadPackage, openPublication, publishInstagramCarousel, publishLinkedInDocument, publishStories } from './publish-sequence.ts';

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
  // Versão da peça e versão programada (pacote congelado ao agendar).
  status?: string;
  version?: number;
  scheduled_version?: number | null;
  approved_version?: number | null;
  export_package?: Record<string, unknown> | null;
  title?: string | null;
  published_url?: string | null;
  // Campanhas: a conta social da peça. Nula nos posts antigos → credenciais de
  // user_settings (comportamento de sempre).
  account_id: string | null;
}

interface UserSettings {
  linkedin_token: string | null;
  linkedin_author_urn: string | null;
  instagram_access_token: string | null;
  instagram_business_account_id: string | null;
}

// reused: a peça já estava publicada — devolve o resultado conhecido, sem nova chamada à rede (doc 01 §4.2).
export interface PublishResult { url: string; id: string; platform: string; reused?: boolean }

async function loadPost(id: string): Promise<PublishablePost | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/user_posts?id=eq.${id}&select=id,user_id,platform,format,caption,rendered_slides,metadata,publish_attempts,visual_decision,image_approved,account_id,status,version,scheduled_version,approved_version,export_package,title,published_url&limit=1`,
    { headers: svcHeaders() },
  );
  if (!res.ok) return null;
  const rows = await res.json();
  const post = rows[0] ?? null;
  // Agendada publica o PACOTE PROGRAMADO: se a peça foi revisada depois, a versão nova
  // só vai ao ar com "atualizar agendamento" (docs: Ajustes e alternativas §8).
  if (post && post.status === 'scheduled' && post.scheduled_version && post.scheduled_version !== post.version) {
    const vr = await fetch(`${SUPABASE_URL}/rest/v1/piece_versions?post_id=eq.${id}&version=eq.${post.scheduled_version}&select=components&limit=1`, { headers: svcHeaders() });
    if (!vr.ok) throw new Error(`Não consegui recuperar o conteúdo programado (v${post.scheduled_version}). A publicação foi interrompida — tente de novo.`);
    const [v] = await vr.json();
    // HIVE-EST-06: sem o pacote programado, NUNCA cai na versão atual em silêncio.
    if (!v?.components || !v.components.rendered_slides?.slide1) {
      throw new Error(`O conteúdo programado (v${post.scheduled_version}) não foi encontrado. A publicação foi interrompida: confira a peça e atualize o agendamento.`);
    }
    post.caption = v.components.caption ?? '';
    post.rendered_slides = v.components.rendered_slides;
    post.visual_decision = v.components.visual_decision ?? null;
  }
  return post;
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

interface SocialAccountRow extends UserSettings {
  id: string;
  platform: 'linkedin' | 'instagram';
  label: string;
  status: string;
  metadata: { source?: string } | null;
}

async function loadAccount(id: string): Promise<SocialAccountRow | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/social_accounts?id=eq.${id}&select=id,user_id,platform,label,status,metadata,linkedin_token,linkedin_author_urn,instagram_access_token,instagram_business_account_id&limit=1`,
    { headers: svcHeaders() },
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] ?? null;
}

// Credenciais de publicação: a CONTA da peça (multi-conta) tem prioridade; sem
// conta (posts antigos), cai em user_settings — exatamente como antes.
interface Credentials extends UserSettings { accountLabel: string | null; viaIntegrations?: boolean }

async function resolveCredentials(post: PublishablePost, settings: UserSettings): Promise<Credentials> {
  if (!post.account_id) return { ...settings, accountLabel: null };
  const acc = await loadAccount(post.account_id);
  // A conta precisa ser do dono da peça: nunca publicar com credenciais de outro usuário/cliente.
  if (!acc || (acc as { user_id?: string }).user_id !== post.user_id) throw new Error('A conta desta peça não existe mais. Escolha outra conta antes de publicar.');
  if (acc.platform !== post.platform) {
    throw new Error(`A conta "${acc.label}" é de ${acc.platform}, mas a peça é de ${post.platform}.`);
  }
  if (acc.status !== 'connected') {
    throw new Error(`A conta "${acc.label}" está desconectada. Reconecte em Configurações > Contas.`);
  }
  // Conta "via Integrações" (as principais, importadas no cutover): as credenciais
  // seguem morando em user_settings — fonte única, renovada pelo instagram-refresh.
  if (acc.metadata?.source === 'integrations') return { ...settings, accountLabel: acc.label, viaIntegrations: true };
  return {
    linkedin_token: acc.linkedin_token,
    linkedin_author_urn: acc.linkedin_author_urn,
    instagram_access_token: acc.instagram_access_token,
    instagram_business_account_id: acc.instagram_business_account_id,
    accountLabel: acc.label,
  };
}

function missingCreds(platform: string, creds: Credentials): string {
  const net = platform === 'linkedin' ? 'LinkedIn' : 'Instagram';
  return creds.accountLabel && !creds.viaIntegrations
    ? `A conta "${creds.accountLabel}" está sem token do ${net}. Configure em Configurações > Contas.`
    : `${net} nao configurado. Vai em Configuracoes > Integracoes.`;
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

export interface DryRun { ok: boolean; format: string; platform: string; version: number | null; units: number; issues: string[]; plan: string[] }

const AI_IMAGE = (variant?: string) => variant === 'M01-D' || variant === 'M01-E' || (variant?.startsWith('M02-') ?? false);
const fail = (format: string, platform: string, issues: string[]): DryRun => ({ ok: false, format, platform, version: null, units: 0, issues, plan: [] });

// VERIFICAÇÃO PRÉVIA (doc 01 §4.4 · HIVE-EST-05): só LÊ — peça, versão, arquivos, credenciais.
// Não grava tentativa/status/erro e não chama nenhuma API de rede social. Formato sem verificação
// implementada é recusado explicitamente (nunca cai na publicação).
export async function inspectOne(postId: string, userId: string): Promise<DryRun> {
  let post: PublishablePost | null;
  try { post = await loadPost(postId); } catch (e) { return fail('', '', [(e as Error).message]); }
  if (!post || post.user_id !== userId) return fail('', '', ['Post nao encontrado']);
  if (post.status === 'published') return fail(post.format, post.platform, ['Esta peça já foi publicada e permanece no histórico.']);
  if (isSequence(post.format)) return publishSequence(post, userId, { dryRun: true }) as Promise<DryRun>;
  if (!['image', 'video', 'reel'].includes(post.format)) return fail(post.format, post.platform, ['A verificação prévia ainda não está disponível para este formato.']);

  const issues: string[] = [];
  const isVideo = post.format === 'video' || post.format === 'reel';
  if (!(post.caption ?? '').trim()) issues.push('Falta a legenda.');
  if (AI_IMAGE((post.visual_decision as { variant?: string } | null)?.variant) && post.metadata?.bg_approved !== true) issues.push('Aprove a imagem de IA antes de publicar.');
  if (post.platform === 'linkedin' && isVideo) issues.push('Publicação de vídeo no LinkedIn ainda não está disponível.');
  const fileUrl = isVideo ? (post.metadata as { video_url?: string })?.video_url : post.rendered_slides?.slide1;
  if (!fileUrl) issues.push(isVideo ? 'Vídeo não encontrado na peça.' : 'Imagem final não renderizada.');
  else {
    const head = await fetch(fileUrl, { method: 'HEAD' }).catch(() => null);
    if (!head?.ok) issues.push('O arquivo da peça está inacessível.');
  }
  const settings = await loadSettings(userId);
  try {
    const creds = settings ? await resolveCredentials(post, settings) : null;
    const ok = post.platform === 'linkedin' ? !!(creds?.linkedin_token && creds?.linkedin_author_urn) : !!(creds?.instagram_access_token && creds?.instagram_business_account_id);
    if (!creds) issues.push('Credenciais de publicação não configuradas.');
    else if (!ok) issues.push(missingCreds(post.platform, creds));
  } catch (e) { issues.push((e as Error).message); }
  const plan = post.platform === 'linkedin'
    ? ['registrar o upload da imagem', 'enviar a imagem', 'publicar o post com a legenda']
    : isVideo ? ['contêiner de Reel com a legenda', 'aguardar o processamento', 'publicar'] : ['contêiner de imagem com a legenda', 'publicar'];
  return { ok: issues.length === 0, format: post.format, platform: post.platform, version: post.scheduled_version ?? post.version ?? null, units: 1, issues, plan };
}

export async function publishOne(postId: string, userId: string, opts: { dryRun?: boolean } = {}): Promise<PublishResult> {
  if (opts.dryRun) throw new Error('Use inspectOne para verificar sem publicar.');
  const post = await loadPost(postId);
  // Só o dono publica a própria peça (a função usa credencial de serviço: o escopo é conferido aqui).
  if (!post || post.user_id !== userId) throw new Error('Post nao encontrado');
  // Já publicada: devolve o resultado conhecido, sem chamar a rede de novo (HIVE-EST-04, parte imediata;
  // a reserva atômica contra corrida entre botão e agendador entra no E4).
  if (post.status === 'published') return { url: post.published_url ?? '', id: '', platform: post.platform, reused: true };
  if (isSequence(post.format)) return publishSequence(post, userId, opts) as Promise<PublishResult>;

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
    if (AI_IMAGE((post.visual_decision as { variant?: string } | null)?.variant) && post.metadata?.bg_approved !== true) {
      throw new Error('Aprove a imagem de IA antes de publicar (portão de imagem — M01-D/E e M02).');
    }

    const creds = await resolveCredentials(post, settings);
    let result: PublishResult;

    if (post.platform === 'linkedin') {
      if (!creds.linkedin_token || !creds.linkedin_author_urn) {
        throw new Error(missingCreds('linkedin', creds));
      }
      if (post.format === 'video') throw new Error('Publicacao de video no LinkedIn ainda nao implementada.');
      // Espelha o Instagram: sem imagem renderizada, NAO publica. Antes havia um
      // fallback silencioso pra texto puro (publishLinkedInTextOnly, removido) que deixava
      // um post agendado ir ao ar SEM imagem quando slide1 nao tinha sido
      // renderizado/persistido — perda silenciosa. Agora bloqueia com erro visivel.
      const imageUrl = post.rendered_slides?.slide1;
      if (!imageUrl) throw new Error('Imagem não renderizada. Abra o post no editor e clique em Stand-by (renderiza automático) antes de agendar/publicar.');
      result = await publishLinkedInImage(creds.linkedin_token, creds.linkedin_author_urn, imageUrl, caption);
    } else if (post.platform === 'instagram') {
      if (!creds.instagram_access_token || !creds.instagram_business_account_id) {
        throw new Error(missingCreds('instagram', creds));
      }
      if (post.format === 'video') {
        const videoUrl = (post.metadata as { video_url?: string })?.video_url;
        if (!videoUrl) throw new Error('video_url ausente no post metadata');
        result = await publishInstagramVideo(creds.instagram_access_token, creds.instagram_business_account_id, videoUrl, caption);
      } else {
        const imageUrl = post.rendered_slides?.slide1;
        if (!imageUrl) throw new Error('Imagem não renderizada. Abra o post no editor e clique em Stand-by (renderiza automático) antes de agendar/publicar.');
        result = await publishInstagramImage(creds.instagram_access_token, creds.instagram_business_account_id, imageUrl, caption);
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

// ============================================================================
// SEQUÊNCIAS (carrossel IG, documento LinkedIn, Stories IG) — pacote inteiro, por versão e destino.
// dryRun: confere tudo (pacote, capacidade, arquivos, credenciais) e devolve o plano, sem publicar.
// ============================================================================
async function publishSequence(post: PublishablePost, userId: string, opts: { dryRun?: boolean }): Promise<PublishResult | DryRun> {
  const p = post as unknown as Record<string, unknown> & PublishablePost;
  const cap = await capabilityOf(post.platform, post.format);
  let pkg;
  try { pkg = await loadPackage(p); } catch (e) {
    if (opts.dryRun) return { ok: false, format: post.format, platform: post.platform, version: null, units: 0, issues: [(e as Error).message], plan: [] };
    await updatePost(post.id, { publish_error: (e as Error).message.slice(0, 1000) });
    throw e;
  }
  const issues = await checkPackage(p, pkg, cap);
  const settings = await loadSettings(userId);
  let creds: Credentials | null = null;
  try { creds = settings ? await resolveCredentials(post, settings) : null; } catch (e) { issues.push((e as Error).message); }
  const hasCreds = post.platform === 'linkedin' ? !!(creds?.linkedin_token && creds?.linkedin_author_urn) : !!(creds?.instagram_access_token && creds?.instagram_business_account_id);
  if (!hasCreds && creds) issues.push(missingCreds(post.platform, creds));
  if (!creds && !issues.length) issues.push('Credenciais de publicação não configuradas.');
  const plan = post.format === 'story'
    ? pkg.units.map((u) => `Story ${u.position} (na ordem; retomada sem repetir as publicadas)`)
    : post.platform === 'instagram' ? [`${pkg.units.length} contêineres de página`, 'contêiner do carrossel com a legenda', 'publicar']
      : [`documento PDF com ${pkg.units.length} páginas (v${pkg.version})`, 'post com o documento e a legenda'];
  if (opts.dryRun) return { ok: issues.length === 0, format: post.format, platform: post.platform, version: pkg.version, units: pkg.units.length, issues, plan };

  await updatePost(post.id, { publish_attempts: (post.publish_attempts ?? 0) + 1, publish_error: null });
  if (issues.length) {
    await updatePost(post.id, { publish_error: issues.join(' ').slice(0, 1000) });
    throw new Error(issues.join(' '));
  }
  const pub = await openPublication(p, pkg);
  try {
    let result: { id: string; url: string };
    if (post.format === 'story') {
      const r = await publishStories(creds!.instagram_access_token!, creds!.instagram_business_account_id!, pub, pkg);
      if (r.failed) {
        await closePublication(pub.id, { status: r.published ? 'partial' : 'failed', error: r.failed.slice(0, 500), units_published: r.published });
        throw new Error(`${r.failed} (${r.published} de ${pkg.units.length} publicados — retome para continuar na ordem).`);
      }
      result = r.first ?? { id: pub.id, url: 'https://www.instagram.com/' };
    } else if (post.platform === 'instagram') {
      result = await publishInstagramCarousel(creds!.instagram_access_token!, creds!.instagram_business_account_id!, pkg);
    } else {
      const r = await publishLinkedInDocument(creds!.linkedin_token!, creds!.linkedin_author_urn!, p, pkg, cap!);
      result = r;
      if (!pkg.pdf_url) await updatePost(post.id, { export_package: { version: pkg.version, kind: 'pdf', files: pkg.units.map((u) => u.rendered_url), pdf_url: r.pdf_url, exported_at: new Date().toISOString() } });
    }
    await closePublication(pub.id, { status: 'published', external_id: result.id, url: result.url, error: null, units_published: pkg.units.length });
    const nowIso = new Date().toISOString();
    await updatePost(post.id, { status: 'published', published_url: result.url, published_at: nowIso, published_date: nowIso, publish_error: null,
      metadata: { ...(post.metadata ?? {}), published_version: pkg.version } });
    return { url: result.url, id: result.id, platform: post.platform };
  } catch (e) {
    const msg = (e as Error).message;
    if (post.format !== 'story') await closePublication(pub.id, { status: 'failed', error: msg.slice(0, 500) });
    await updatePost(post.id, { publish_error: msg.slice(0, 1000) });
    throw e;
  }
}
