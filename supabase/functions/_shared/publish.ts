// Lógica de PUBLICAÇÃO compartilhada entre:
//   - publish-post (botão manual "Publicar", com JWT do usuário)
//   - publish-scheduler (cron, publica os posts agendados vencidos)
//
// Estabilização E4 (docs 01 §5 e 03 §12/§16) — um único fluxo para todos os formatos:
//   1. resolver o PACOTE: o programado (scheduled_package_id) ou, em "publicar agora", um pacote fechado na
//      hora com a versão aprovada apresentada. Nunca a edição atual, nunca fallback silencioso.
//   2. RESERVAR (acquire_publication): só uma execução por peça; publicada devolve o resultado conhecido;
//      em andamento ou com resultado incerto, não envia.
//   3. conferir o pacote (integridade dos bytes, destino, credenciais) SOB a reserva, antes da rede.
//   4. marcar o início do envio, enviar o que está NO PACOTE e registrar o resultado (confirm/fail).
// Falha antes da chamada decisiva = pode tentar de novo; sem resposta/5xx nela = conferir antes.

import { capabilityOf, checkPackage, currentSequence, decisive, ensureUnitRows, igPermalink, isSequence, publishInstagramCarousel, publishLinkedInDocument, publishStories, SendError, sequenceFromPackage } from './publish-sequence.ts';
import { loadPackageRow, rest, rpc, sealPackage, verifyPackage, type PackageRow } from './package.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';

function svcHeaders(): HeadersInit {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  return { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
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
  visual_decision: unknown | null;
  image_approved: boolean | null;
  status?: string;
  version?: number;
  scheduled_version?: number | null;
  scheduled_package_id?: string | null;
  approved_version?: number | null;
  title?: string | null;
  published_url?: string | null;
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
// Erro com estado da operação para a interface (em andamento / precisa conferir / incompleto).
export class PublishStateError extends Error {
  constructor(message: string, readonly state: 'in_progress' | 'needs_reconciliation' | 'blocked' | 'failed', readonly publicationId?: string) { super(message); }
}

const POST_FIELDS = 'id,user_id,platform,format,caption,rendered_slides,metadata,publish_attempts,visual_decision,image_approved,account_id,status,version,scheduled_version,scheduled_package_id,approved_version,title,published_url';

async function loadPost(id: string): Promise<PublishablePost | null> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/user_posts?id=eq.${id}&select=${POST_FIELDS}&limit=1`, { headers: svcHeaders() });
  if (!res.ok) throw new Error('Não consegui ler a peça. Tente de novo.');
  const rows = await res.json();
  return rows[0] ?? null;
}

async function loadSettings(userId: string): Promise<UserSettings | null> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/user_settings?user_id=eq.${userId}&select=linkedin_token,linkedin_author_urn,instagram_access_token,instagram_business_account_id&limit=1`, { headers: svcHeaders() });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] ?? null;
}

interface SocialAccountRow extends UserSettings { id: string; user_id: string; platform: 'linkedin' | 'instagram'; label: string; status: string; metadata: { source?: string } | null }
async function loadAccount(id: string): Promise<SocialAccountRow | null> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/social_accounts?id=eq.${id}&select=id,user_id,platform,label,status,metadata,linkedin_token,linkedin_author_urn,instagram_access_token,instagram_business_account_id&limit=1`, { headers: svcHeaders() });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] ?? null;
}

// Credenciais do destino: a CONTA (multi-conta) tem prioridade; sem conta (posts antigos), user_settings.
interface Credentials extends UserSettings { accountLabel: string | null; viaIntegrations?: boolean }
async function resolveCredentials(dest: { user_id: string; platform: string; account_id: string | null }, settings: UserSettings): Promise<Credentials> {
  if (!dest.account_id) return { ...settings, accountLabel: null };
  const acc = await loadAccount(dest.account_id);
  // A conta precisa ser do dono da peça: nunca publicar com credenciais de outro usuário/cliente.
  if (!acc || acc.user_id !== dest.user_id) throw new Error('A conta desta peça não existe mais. Escolha outra conta antes de publicar.');
  if (acc.platform !== dest.platform) throw new Error(`A conta "${acc.label}" é de ${acc.platform}, mas a peça é de ${dest.platform}.`);
  if (acc.status !== 'connected') throw new Error(`A conta "${acc.label}" está desconectada. Reconecte em Configurações > Contas.`);
  // Conta "via Integrações": as credenciais moram em user_settings (renovadas pelo instagram-refresh).
  if (acc.metadata?.source === 'integrations') return { ...settings, accountLabel: acc.label, viaIntegrations: true };
  return { linkedin_token: acc.linkedin_token, linkedin_author_urn: acc.linkedin_author_urn, instagram_access_token: acc.instagram_access_token, instagram_business_account_id: acc.instagram_business_account_id, accountLabel: acc.label };
}

function missingCreds(platform: string, creds: Credentials): string {
  const net = platform === 'linkedin' ? 'LinkedIn' : 'Instagram';
  return creds.accountLabel && !creds.viaIntegrations
    ? `A conta "${creds.accountLabel}" está sem token do ${net}. Configure em Configurações > Contas.`
    : `${net} nao configurado. Vai em Configuracoes > Integracoes.`;
}
const hasCreds = (platform: string, c: Credentials | null) => platform === 'linkedin' ? !!(c?.linkedin_token && c?.linkedin_author_urn) : !!(c?.instagram_access_token && c?.instagram_business_account_id);
const identityOf = (platform: string, c: Credentials) => platform === 'linkedin' ? c.linkedin_author_urn : c.instagram_business_account_id;

// Credenciais para o DESTINO DO PACOTE: a identidade precisa ser a mesma (doc 03 §14 — token renovado da
// mesma conta serve; conta trocada/remapeada para outra identidade, não).
async function credentialsForPackage(pkg: PackageRow, userId: string): Promise<Credentials> {
  const settings = await loadSettings(userId);
  if (!settings) throw new Error('Credenciais de publicação não configuradas.');
  const creds = await resolveCredentials({ user_id: userId, platform: pkg.platform, account_id: pkg.account_id }, settings);
  if (!hasCreds(pkg.platform, creds)) throw new Error(missingCreds(pkg.platform, creds));
  if (`${pkg.platform}:${identityOf(pkg.platform, creds)}` !== pkg.destination) {
    throw new Error('A conta escolhida mudou desde o agendamento e precisa ser conferida antes de publicar.');
  }
  return creds;
}

async function updatePost(id: string, patch: Record<string, unknown>): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/user_posts?id=eq.${id}`, { method: 'PATCH', headers: { ...svcHeaders(), Prefer: 'return=minimal' }, body: JSON.stringify(patch) });
}

const AI_IMAGE = (variant?: string | null) => variant === 'M01-D' || variant === 'M01-E' || (variant?.startsWith('M02-') ?? false);

// ============================================================================
// LINKEDIN / INSTAGRAM (imagem única e Reel) — chamadas decisivas marcadas
// ============================================================================
async function publishLinkedInImage(token: string, authorUrn: string, imageUrl: string, caption: string): Promise<PublishResult> {
  const regRes = await fetch('https://api.linkedin.com/v2/assets?action=registerUpload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Restli-Protocol-Version': '2.0.0' },
    body: JSON.stringify({ registerUploadRequest: { recipes: ['urn:li:digitalmediaRecipe:feedshare-image'], owner: authorUrn, serviceRelationships: [{ relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' }] } }),
  });
  if (!regRes.ok) throw new Error(`LinkedIn registerUpload falhou: ${regRes.status} ${(await regRes.text()).slice(0, 300)}`);
  const regData = await regRes.json();
  const uploadUrl = regData.value?.uploadMechanism?.['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']?.uploadUrl;
  const asset = regData.value?.asset;
  if (!uploadUrl || !asset) throw new Error('LinkedIn registerUpload sem uploadUrl/asset');
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`Falha ao baixar a imagem do pacote (${imgRes.status})`);
  const upRes = await fetch(uploadUrl, { method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body: await imgRes.blob() });
  if (!upRes.ok) throw new Error(`LinkedIn upload binario falhou: ${upRes.status} ${(await upRes.text()).slice(0, 200)}`);
  const ugcRes = await decisive('LinkedIn ugcPosts', 'https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Restli-Protocol-Version': '2.0.0' },
    body: JSON.stringify({
      author: authorUrn, lifecycleState: 'PUBLISHED',
      specificContent: { 'com.linkedin.ugc.ShareContent': { shareCommentary: { text: caption }, shareMediaCategory: 'IMAGE', media: [{ status: 'READY', media: asset }] } },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    }),
  });
  const postId = ugcRes.headers.get('x-restli-id') ?? '';
  return { url: `https://www.linkedin.com/feed/update/${encodeURIComponent(postId)}/`, id: postId, platform: 'linkedin' };
}

const IG_API_VERSION = 'v21.0';
async function igPublishContainer(igBusinessId: string, creationId: string, token: string, label: string): Promise<string> {
  const pRes = await decisive(label, `https://graph.facebook.com/${IG_API_VERSION}/${igBusinessId}/media_publish`, { method: 'POST', body: new URLSearchParams({ creation_id: creationId, access_token: token }) });
  const pData = await pRes.json().catch(() => ({}));
  if (!pData.id) throw new SendError(`${label} respondeu sem o ID da publicação.`, false, 'no_id');
  return pData.id as string;
}

async function publishInstagramImage(token: string, igBusinessId: string, imageUrl: string, caption: string): Promise<PublishResult> {
  const cRes = await fetch(`https://graph.facebook.com/${IG_API_VERSION}/${igBusinessId}/media`, { method: 'POST', body: new URLSearchParams({ image_url: imageUrl, caption, access_token: token }) });
  const cData = await cRes.json();
  if (!cRes.ok || !cData.id) throw new Error(`IG create container falhou: ${cData.error?.message ?? JSON.stringify(cData).slice(0, 300)}`);
  const id = await igPublishContainer(igBusinessId, cData.id as string, token, 'Instagram media_publish');
  return { url: await igPermalink(id, token).then((u) => (u === 'https://www.instagram.com/' ? `https://www.instagram.com/p/${id}/` : u)), id, platform: 'instagram' };
}

async function publishInstagramVideo(token: string, igBusinessId: string, videoUrl: string, caption: string): Promise<PublishResult> {
  const cRes = await fetch(`https://graph.facebook.com/${IG_API_VERSION}/${igBusinessId}/media`, { method: 'POST', body: new URLSearchParams({ media_type: 'REELS', video_url: videoUrl, caption, access_token: token }) });
  const cData = await cRes.json();
  if (!cRes.ok || !cData.id) throw new Error(`IG create video container falhou: ${cData.error?.message ?? JSON.stringify(cData).slice(0, 300)}`);
  const containerId = cData.id as string;
  const start = Date.now();
  let status = 'IN_PROGRESS';
  while (status !== 'FINISHED' && Date.now() - start < 5 * 60 * 1000) {
    await new Promise((r) => setTimeout(r, 5000));
    const sData = await (await fetch(`https://graph.facebook.com/${IG_API_VERSION}/${containerId}?fields=status_code&access_token=${token}`)).json();
    status = sData.status_code ?? 'IN_PROGRESS';
    if (status === 'ERROR' || status === 'EXPIRED') throw new Error(`IG container processou com erro: status=${status}`);
  }
  if (status !== 'FINISHED') throw new Error('IG video processing timeout (>5min).');
  const id = await igPublishContainer(igBusinessId, containerId, token, 'Instagram media_publish (reel)');
  return { url: `https://www.instagram.com/reel/${id}/`, id, platform: 'instagram' };
}

// ============================================================================
// RESOLVEDOR DO PACOTE (doc 03 §12) — o mesmo para verificar e para publicar
// ============================================================================
export interface DryRun { ok: boolean; format: string; platform: string; version: number | null; units: number; issues: string[]; plan: string[]; package_id?: string | null; origin?: string }
const fail = (format: string, platform: string, issues: string[]): DryRun => ({ ok: false, format, platform, version: null, units: 0, issues, plan: [] });
const LEGACY_MSG = 'Este agendamento é anterior à preservação do conteúdo: confirme o material programado na agenda antes de publicar.';

function planFor(platform: string, format: string, units: number, version: number | null): string[] {
  if (format === 'story') return Array.from({ length: units }, (_, i) => `Story ${i + 1} (na ordem; retomada sem repetir as publicadas)`);
  if (format === 'carousel') return platform === 'instagram' ? [`${units} contêineres de página`, 'contêiner do carrossel com a legenda', 'publicar'] : [`documento PDF com ${units} páginas (v${version})`, 'post com o documento e a legenda'];
  if (platform === 'linkedin') return ['registrar o upload da imagem', 'enviar a imagem', 'publicar o post com a legenda'];
  return format === 'video' || format === 'reel' ? ['contêiner de Reel com a legenda', 'aguardar o processamento', 'publicar'] : ['contêiner de imagem com a legenda', 'publicar'];
}

// Checagens da versão ATUAL aprovada (antes de fechar o pacote de "publicar agora"; e a verificação prévia).
async function currentIssues(post: PublishablePost, userId: string): Promise<{ issues: string[]; units: number }> {
  const issues: string[] = [];
  let units = 1;
  if (isSequence(post.format)) {
    const cap = await capabilityOf(post.platform, post.format);
    let seq;
    try { seq = await currentSequence(post as unknown as Record<string, unknown>); } catch (e) { return { issues: [(e as Error).message], units: 0 }; }
    units = seq.units.length;
    issues.push(...await checkPackage(post as unknown as Record<string, unknown>, seq, cap));
  } else {
    const ready = await rpc<{ ready: boolean; missing: Array<{ reason: string }> }>('piece_readiness', { p_post: post.id, p_scope: 'publish' });
    issues.push(...ready.missing.map((m) => m.reason));
    const isVideo = post.format === 'video' || post.format === 'reel';
    if (post.platform === 'linkedin' && isVideo) issues.push('Publicação de vídeo no LinkedIn ainda não está disponível.');
    const fileUrl = isVideo ? (post.metadata as { video_url?: string })?.video_url : post.rendered_slides?.slide1;
    if (fileUrl) {
      const head = await fetch(fileUrl, { method: 'HEAD' }).catch(() => null);
      if (!head?.ok) issues.push('O arquivo da peça está inacessível.');
    }
  }
  const settings = await loadSettings(userId);
  try {
    const creds = settings ? await resolveCredentials(post, settings) : null;
    if (!creds) issues.push('Credenciais de publicação não configuradas.');
    else if (!hasCreds(post.platform, creds)) issues.push(missingCreds(post.platform, creds));
  } catch (e) { issues.push((e as Error).message); }
  return { issues: [...new Set(issues)], units };
}

// Pacote programado: integridade + destino + aprovação de IA registrada no próprio pacote.
async function packageIssues(pkg: PackageRow, userId: string, bytes = true): Promise<string[]> {
  const issues = await verifyPackage(pkg, { bytes });
  const ap = pkg.manifest.approvals ?? {};
  if (AI_IMAGE(pkg.manifest.visual?.variant) && ap.bg_approved !== true) issues.push('A imagem gerada por IA deste pacote não foi aprovada.');
  if (pkg.format !== 'story' && !pkg.manifest.texts.caption?.trim()) issues.push('O pacote programado está sem legenda.');
  if (isSequence(pkg.format)) {
    const cap = await capabilityOf(pkg.platform, pkg.format);
    if (!cap?.auto_publish) issues.push('Publicação automática deste formato não está habilitada: exporte o pacote e publique manualmente.');
    else if (pkg.manifest.units.length < cap.min_units || pkg.manifest.units.length > cap.max_units) issues.push(`A sequência programada tem ${pkg.manifest.units.length} página(s); a rede aceita de ${cap.min_units} a ${cap.max_units}.`);
  }
  try { await credentialsForPackage(pkg, userId); } catch (e) { issues.push((e as Error).message); }
  return [...new Set(issues)];
}

// VERIFICAÇÃO PRÉVIA (doc 01 §4.4): só LÊ. Não grava tentativa/status/erro, não fecha pacote e não chama
// nenhuma API de rede social. Formato sem verificação implementada é recusado explicitamente.
export async function inspectOne(postId: string, userId: string): Promise<DryRun> {
  let post: PublishablePost | null;
  try { post = await loadPost(postId); } catch (e) { return fail('', '', [(e as Error).message]); }
  if (!post || post.user_id !== userId) return fail('', '', ['Post nao encontrado']);
  if (post.status === 'published') return fail(post.format, post.platform, ['Esta peça já foi publicada e permanece no histórico.']);
  if (!['image', 'video', 'reel', 'carousel', 'story'].includes(post.format)) return fail(post.format, post.platform, ['A verificação prévia ainda não está disponível para este formato.']);

  if (post.status === 'scheduled') {
    if (!post.scheduled_package_id) return fail(post.format, post.platform, [LEGACY_MSG]);
    const pkg = await loadPackageRow(post.scheduled_package_id).catch(() => null);
    if (!pkg) return fail(post.format, post.platform, ['Não consegui recuperar o conteúdo programado. A publicação seria interrompida.']);
    const issues = await packageIssues(pkg, userId);
    const units = Math.max(pkg.manifest.units.length, 1);
    return { ok: !issues.length, format: post.format, platform: post.platform, version: pkg.source_version, units, issues, plan: planFor(post.platform, post.format, units, pkg.source_version), package_id: pkg.id, origin: pkg.origin };
  }
  const { issues, units } = await currentIssues(post, userId);
  const version = post.version ?? null;
  return { ok: !issues.length, format: post.format, platform: post.platform, version, units, issues, plan: issues.length && units === 0 ? [] : planFor(post.platform, post.format, units, version), package_id: null };
}

// ============================================================================
// PUBLICAR — reserva exclusiva, pacote, resultado
// ============================================================================
export async function publishOne(postId: string, userId: string, opts: { dryRun?: boolean; source?: 'manual' | 'scheduler' } = {}): Promise<PublishResult> {
  if (opts.dryRun) throw new Error('Use inspectOne para verificar sem publicar.');
  const post = await loadPost(postId);
  // Só o dono publica a própria peça (a função usa credencial de serviço: o escopo é conferido aqui).
  if (!post || post.user_id !== userId) throw new Error('Post nao encontrado');
  if (post.status === 'published') return { url: post.published_url ?? '', id: '', platform: post.platform, reused: true };

  // 1) pacote: programado, ou fechado agora com a versão aprovada que o produtor está publicando
  let pkg: PackageRow | null = null;
  try {
    if (post.status === 'scheduled') {
      if (!post.scheduled_package_id) throw new Error(LEGACY_MSG);
      pkg = await loadPackageRow(post.scheduled_package_id);
      if (!pkg) throw new Error('Não consegui recuperar o conteúdo programado. A publicação foi interrompida.');
    } else {
      if (opts.source === 'scheduler') throw new Error('Só peças agendadas são publicadas pelo agendador.');
      const { issues } = await currentIssues(post, userId);
      if (issues.length) throw new Error(issues.join(' '));
      pkg = await sealPackage(post.id, userId, 'publish_now', null);
    }
  } catch (e) {
    await updatePost(post.id, { publish_error: (e as Error).message.slice(0, 1000) });
    throw e;
  }

  // 2) reserva exclusiva
  const attempt = crypto.randomUUID();
  const acq = await rpc<{ state: string; publication_id?: string; url?: string; external_id?: string; error?: string }>('acquire_publication', {
    p_post: post.id, p_user: userId, p_package: pkg.id, p_destination: pkg.destination, p_attempt: attempt,
  });
  if (acq.state === 'already_published') return { url: acq.url ?? post.published_url ?? '', id: acq.external_id ?? '', platform: post.platform, reused: true };
  if (acq.state === 'in_progress') throw new PublishStateError('A publicação desta peça já está em andamento.', 'in_progress', acq.publication_id);
  if (acq.state === 'needs_reconciliation') throw new PublishStateError('Precisamos conferir se a publicação foi concluída antes de tentar novamente.', 'needs_reconciliation', acq.publication_id);
  const pubId = acq.publication_id!;
  await updatePost(post.id, { publish_attempts: (post.publish_attempts ?? 0) + 1, publish_error: null });

  let sending = false;
  try {
    // 3) conferência sob a reserva, antes de qualquer efeito externo
    const issues = await packageIssues(pkg, userId);
    if (issues.length) throw new PublishStateError(issues.join(' '), 'blocked');
    const creds = await credentialsForPackage(pkg, userId);
    await rpc('mark_publication_sending', { p_pub: pubId, p_attempt: attempt });
    sending = true;

    // 4) envio do que está NO PACOTE
    const m = pkg.manifest;
    let result: PublishResult;
    let units = 1;
    if (isSequence(pkg.format)) {
      const seq = sequenceFromPackage(pkg);
      units = seq.units.length;
      const cap = (await capabilityOf(pkg.platform, pkg.format))!;
      if (pkg.format === 'story') {
        await ensureUnitRows(pubId, userId, post.id, seq);
        const r = await publishStories(creds.instagram_access_token!, creds.instagram_business_account_id!, pubId, seq);
        if (r.failed) {
          await rpc('fail_publication', { p_pub: pubId, p_before_send: !r.unknown, p_error: `${r.failed} (${r.published} de ${units} publicados)`, p_class: r.unknown ? 'story_unknown' : 'story_failed', p_units: r.published });
          throw new PublishStateError(r.unknown ? `${r.failed} Confira antes de continuar.` : `${r.failed} (${r.published} de ${units} publicados — retome para continuar na ordem).`, r.unknown ? 'needs_reconciliation' : 'failed', pubId);
        }
        result = { ...(r.first ?? { id: pubId, url: 'https://www.instagram.com/' }), platform: 'instagram' };
      } else if (pkg.platform === 'instagram') {
        result = { ...(await publishInstagramCarousel(creds.instagram_access_token!, creds.instagram_business_account_id!, seq)), platform: 'instagram' };
      } else {
        result = { ...(await publishLinkedInDocument(creds.linkedin_token!, creds.linkedin_author_urn!, userId, pkg.id, seq, cap)), platform: 'linkedin' };
      }
    } else {
      const file = m.files[0];
      const caption = m.texts.caption ?? '';
      if (pkg.platform === 'linkedin') {
        if (file.role === 'video') throw new Error('Publicação de vídeo no LinkedIn ainda não está disponível.');
        result = await publishLinkedInImage(creds.linkedin_token!, creds.linkedin_author_urn!, file.url, caption);
      } else {
        result = file.role === 'video'
          ? await publishInstagramVideo(creds.instagram_access_token!, creds.instagram_business_account_id!, file.url, caption)
          : await publishInstagramImage(creds.instagram_access_token!, creds.instagram_business_account_id!, file.url, caption);
      }
    }
    await rpc('confirm_publication', { p_pub: pubId, p_external_id: result.id, p_url: result.url, p_units: units });
    return result;
  } catch (e) {
    const err = e as Error;
    if (err instanceof PublishStateError && err.publicationId) throw err;        // Stories já registrou
    // Antes da chamada decisiva (ou recusa definitiva 4xx nela) = nada foi publicado.
    const beforeSend = !sending || !(err instanceof SendError) || err.beforeSend;
    await rpc('fail_publication', { p_pub: pubId, p_before_send: beforeSend, p_error: err.message, p_class: err instanceof SendError ? err.cls : (sending ? 'error_before_decisive_call' : 'blocked_before_send') }).catch(() => {});
    console.error('[publishOne]', postId, beforeSend ? 'sem envio' : 'RESULTADO DESCONHECIDO', err.message);
    if (!beforeSend) throw new PublishStateError(`Precisamos conferir se a publicação foi concluída antes de tentar novamente. (${err.message})`, 'needs_reconciliation', pubId);
    throw err;
  }
}

// Conferência automática no Instagram (decisão de 18/10): procura nos posts recentes da conta do pacote
// uma publicação com a mesma legenda, para o produtor confirmar com o link.
export async function findOnInstagram(pubId: string, userId: string): Promise<{ found: boolean; url?: string; posted_at?: string }> {
  const [op] = await rest<Array<{ user_id: string; package_id: string | null; platform: string; stage: string }>>(`/post_publications?id=eq.${pubId}&select=user_id,package_id,platform,stage`);
  if (!op || op.user_id !== userId) throw new Error('Publicação não encontrada.');
  if (op.platform !== 'instagram' || !op.package_id) return { found: false };
  const pkg = await loadPackageRow(op.package_id);
  if (!pkg) return { found: false };
  const creds = await credentialsForPackage(pkg, userId);
  const r = await fetch(`https://graph.facebook.com/${IG_API_VERSION}/${creds.instagram_business_account_id}/media?fields=caption,permalink,timestamp&limit=15&access_token=${creds.instagram_access_token}`).then((x) => x.json()).catch(() => ({}));
  const norm = (s: string) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
  const want = norm(pkg.manifest.texts.caption ?? '');
  const hit = (r.data as Array<{ caption?: string; permalink?: string; timestamp?: string }> | undefined)?.find((x) => want && norm(x.caption ?? '') === want);
  return hit ? { found: true, url: hit.permalink, posted_at: hit.timestamp } : { found: false };
}
