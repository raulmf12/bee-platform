// Publicação de SEQUÊNCIAS (Fase 5 · etapa B; Estabilização E4):
//  - carrossel Instagram: um contêiner por página (is_carousel_item) → contêiner CAROUSEL → media_publish;
//  - carrossel LinkedIn: documento PDF (Documents API) → post com o documento;
//  - Stories Instagram: uma publicação por unidade, NA ORDEM, com registro por unidade e retomada sem
//    repetir as já publicadas (para na primeira falha para não quebrar a ordem).
// Publica SEMPRE o pacote IMUTÁVEL programado/escolhido (manifesto com arquivos preservados), nunca a edição
// atual nem só a primeira página. O pacote é conferido inteiro antes de qualquer chamada externa.
//
// Classificação das falhas (doc 01 §4.3): só a chamada que CRIA a publicação é decisiva. Se ela fica sem
// resposta ou volta 5xx, o resultado é DESCONHECIDO (pode ter ido ao ar) → conferir antes de reenviar.
// Um 4xx nela, ou qualquer falha antes dela, prova que nada foi publicado → pode tentar de novo.
import { PDFDocument } from 'https://esm.sh/pdf-lib@1.17.1';
import type { PackageRow } from './package.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const IG = 'https://graph.facebook.com/v21.0';
// Versão da API REST do LinkedIn (YYYYMM). Configurável: a LinkedIn aceita versões dos últimos ~12 meses.
const LI_VERSION = Deno.env.get('LINKEDIN_API_VERSION') ?? '202608';

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;
function svc(): Record<string, string> {
  const k = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' };
}
async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, { ...init, headers: { ...svc(), ...(init.headers ?? {}) } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path.split('?')[0]} ${res.status}: ${text.slice(0, 200)}`);
  return (text ? JSON.parse(text) : null) as T;
}

export class SendError extends Error {
  constructor(message: string, readonly beforeSend: boolean, readonly cls: string) { super(message); }
}
// A chamada que cria a publicação. Sem resposta / 5xx → desconhecido; 4xx → recusa definitiva.
export async function decisive(label: string, url: string, init: RequestInit): Promise<Response> {
  let res: Response;
  try { res = await fetch(url, init); } catch (e) { throw new SendError(`${label}: sem resposta da rede (${(e as Error).message}).`, false, 'no_response'); }
  if (res.status >= 500) throw new SendError(`${label}: a rede respondeu ${res.status}.`, false, 'server_5xx');
  if (!res.ok) throw new SendError(`${label}: ${res.status} ${(await res.text()).slice(0, 240)}`, true, 'definitive_4xx');
  return res;
}

export interface SeqUnit { id: string; position: number; rendered_url: string | null; title?: string | null; alt_text?: string | null }
export interface SeqPackage { version: number; caption: string; units: SeqUnit[]; title: string; pdf_url?: string | null }
export interface Capability { platform: string; format: string; min_units: number; max_units: number; export_kind: string; auto_publish: boolean; width: number; height: number }

export const isSequence = (format: string) => format === 'carousel' || format === 'story';

export async function capabilityOf(platform: string, format: string): Promise<Capability | null> {
  const [c] = await rest<Capability[]>(`/format_capabilities?platform=eq.${platform}&format=eq.${format}&select=*`).catch(() => []);
  return c ?? null;
}

// Sequência APROVADA atual (para verificar antes de fechar um pacote "publicar agora").
export async function currentSequence(post: Row): Promise<SeqPackage> {
  if (!['approved', 'scheduled'].includes(post.status) || post.approved_version !== post.version) {
    throw new Error('Só a versão aprovada da sequência pode ser publicada: aprove a sequência completa antes.');
  }
  const units = await rest<SeqUnit[]>(`/post_units?post_id=eq.${post.id}&select=id,position,rendered_url,title,alt_text&order=position.asc`);
  return { version: post.version, caption: post.caption ?? '', title: post.title ?? '', units, pdf_url: null };
}

// Sequência a partir do PACOTE imutável: arquivos preservados, ordem, título e legenda do próprio pacote.
export function sequenceFromPackage(pkg: PackageRow): SeqPackage {
  const m = pkg.manifest;
  return {
    version: pkg.source_version, caption: m.texts.caption ?? '', title: m.texts.title ?? '',
    units: [...m.units].sort((a, b) => a.position - b.position).map((u) => ({ id: u.id, position: u.position, title: u.title, alt_text: u.alt_text, rendered_url: m.files[u.file]?.url ?? null })),
    pdf_url: m.files.find((f) => f.role === 'pdf')?.url ?? null,
  };
}

// Conferência completa ANTES de qualquer chamada externa (também é a verificação prévia).
export async function checkPackage(post: Row, pkg: SeqPackage, cap: Capability | null): Promise<string[]> {
  const issues: string[] = [];
  if (!cap) issues.push(`Formato ${post.format} sem configuração para ${post.platform}.`);
  else {
    if (!cap.auto_publish) issues.push('Publicação automática deste formato não está habilitada: exporte o pacote e publique manualmente.');
    if (pkg.units.length < cap.min_units || pkg.units.length > cap.max_units) issues.push(`A sequência tem ${pkg.units.length} página(s); ${post.platform} aceita de ${cap.min_units} a ${cap.max_units}.`);
  }
  const missing = pkg.units.filter((u) => !u.rendered_url).map((u) => u.position);
  if (missing.length) issues.push(`Páginas sem imagem: ${missing.join(', ')}.`);
  if (post.format !== 'story' && !pkg.caption.trim()) issues.push('Falta a legenda.');
  // Os arquivos precisam estar acessíveis publicamente (as plataformas baixam pela URL).
  const heads = await Promise.all(pkg.units.filter((u) => u.rendered_url).map(async (u) => {
    const r = await fetch(u.rendered_url!, { method: 'HEAD' }).catch(() => null);
    return r?.ok ? null : u.position;
  }));
  const broken = heads.filter((x) => x !== null);
  if (broken.length) issues.push(`Arquivos inacessíveis: páginas ${broken.join(', ')}.`);
  return issues;
}

// ---------------- Instagram ----------------
async function igPost(path: string, params: Record<string, string>): Promise<Row> {
  const r = await fetch(`${IG}/${path}`, { method: 'POST', body: new URLSearchParams(params) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.id) throw new Error(`Instagram ${path.split('/').pop()}: ${d.error?.message ?? JSON.stringify(d).slice(0, 240)}`);
  return d;
}
// media_publish: a chamada decisiva.
async function igPublish(igId: string, creationId: string, token: string): Promise<string> {
  const r = await decisive('Instagram media_publish', `${IG}/${igId}/media_publish`, { method: 'POST', body: new URLSearchParams({ creation_id: creationId, access_token: token }) });
  const d = await r.json().catch(() => ({}));
  if (!d.id) throw new SendError('Instagram media_publish respondeu sem o ID da publicação.', false, 'no_id');
  return d.id as string;
}
async function igWaitReady(id: string, token: string): Promise<void> {
  for (let i = 0; i < 20; i++) {
    const r = await fetch(`${IG}/${id}?fields=status_code&access_token=${token}`).then((x) => x.json()).catch(() => ({}));
    if (!r.status_code || r.status_code === 'FINISHED') return;
    if (r.status_code === 'ERROR' || r.status_code === 'EXPIRED') throw new Error(`Instagram: contêiner ${r.status_code}.`);
    await new Promise((res) => setTimeout(res, 2000));
  }
  throw new Error('Instagram: contêiner não ficou pronto a tempo.');
}
export async function igPermalink(mediaId: string, token: string): Promise<string> {
  const r = await fetch(`${IG}/${mediaId}?fields=permalink&access_token=${token}`).then((x) => x.json()).catch(() => ({}));
  return r.permalink ?? `https://www.instagram.com/`;
}

export async function publishInstagramCarousel(token: string, igId: string, pkg: SeqPackage): Promise<{ id: string; url: string }> {
  const children: string[] = [];
  for (const u of pkg.units) {
    const c = await igPost(`${igId}/media`, { image_url: u.rendered_url!, is_carousel_item: 'true', access_token: token, ...(u.alt_text ? { alt_text: u.alt_text } : {}) });
    children.push(c.id);
  }
  for (const c of children) await igWaitReady(c, token);
  const parent = await igPost(`${igId}/media`, { media_type: 'CAROUSEL', children: children.join(','), caption: pkg.caption, access_token: token });
  await igWaitReady(parent.id, token);
  const id = await igPublish(igId, parent.id, token);
  return { id, url: await igPermalink(id, token) };
}

async function publishInstagramStoryUnit(token: string, igId: string, url: string): Promise<{ id: string; url: string }> {
  const c = await igPost(`${igId}/media`, { image_url: url, media_type: 'STORIES', access_token: token });
  await igWaitReady(c.id, token);
  const id = await igPublish(igId, c.id, token);
  return { id, url: await igPermalink(id, token) };
}

// ---------------- LinkedIn (documento PDF) ----------------
// O PDF é DERIVADO das páginas preservadas do pacote e guardado junto dele (sem sobrescrever).
async function packagePdf(userId: string, packageId: string, pkg: SeqPackage, cap: Capability): Promise<{ bytes: Uint8Array; url: string }> {
  const path = `${userId}/${packageId}/documento.pdf`;
  const url = `${SUPABASE_URL}/storage/v1/object/public/packages/${path}`;
  const existing = await fetch(url).catch(() => null);
  if (existing?.ok) return { bytes: new Uint8Array(await existing.arrayBuffer()), url };
  const doc = await PDFDocument.create();
  for (const u of pkg.units) {
    const bytes = new Uint8Array(await (await fetch(u.rendered_url!)).arrayBuffer());
    const img = await doc.embedJpg(bytes);
    const page = doc.addPage([cap.width, cap.height]);
    page.drawImage(img, { x: 0, y: 0, width: cap.width, height: cap.height });
  }
  const bytes = await doc.save();
  const up = await fetch(`${SUPABASE_URL}/storage/v1/object/packages/${path}`, { method: 'POST', headers: { ...svc(), 'Content-Type': 'application/pdf', 'x-upsert': 'false' }, body: bytes });
  if (!up.ok && up.status !== 409) throw new Error(`Falha ao guardar o PDF: ${up.status} ${(await up.text()).slice(0, 160)}`);
  return { bytes, url };
}

export async function publishLinkedInDocument(token: string, authorUrn: string, userId: string, packageId: string, pkg: SeqPackage, cap: Capability): Promise<{ id: string; url: string; pdf_url: string }> {
  let bytes: Uint8Array, pdfUrl: string;
  if (pkg.pdf_url) { bytes = new Uint8Array(await (await fetch(pkg.pdf_url)).arrayBuffer()); pdfUrl = pkg.pdf_url; }
  else ({ bytes, url: pdfUrl } = await packagePdf(userId, packageId, pkg, cap));
  const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Restli-Protocol-Version': '2.0.0', 'LinkedIn-Version': LI_VERSION };
  const init = await fetch('https://api.linkedin.com/rest/documents?action=initializeUpload', { method: 'POST', headers: h, body: JSON.stringify({ initializeUploadRequest: { owner: authorUrn } }) });
  const initData = await init.json().catch(() => ({}));
  if (!init.ok || !initData.value?.uploadUrl) throw new Error(`LinkedIn documents.initializeUpload: ${init.status} ${JSON.stringify(initData).slice(0, 240)}`);
  const put = await fetch(initData.value.uploadUrl, { method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body: bytes });
  if (!put.ok) throw new Error(`LinkedIn upload do documento: ${put.status} ${(await put.text()).slice(0, 200)}`);
  const res = await decisive('LinkedIn posts (documento)', 'https://api.linkedin.com/rest/posts', { method: 'POST', headers: h, body: JSON.stringify({
    author: authorUrn, commentary: pkg.caption, visibility: 'PUBLIC',
    distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
    content: { media: { title: (pkg.title || 'Documento').slice(0, 200), id: initData.value.document } },
    lifecycleState: 'PUBLISHED', isReshareDisabledByAuthor: false,
  }) });
  const id = res.headers.get('x-restli-id') ?? res.headers.get('x-linkedin-id') ?? '';
  return { id, url: `https://www.linkedin.com/feed/update/${encodeURIComponent(id)}/`, pdf_url: pdfUrl };
}

// ---------------- Stories: progresso por unidade dentro da operação ----------------
export async function ensureUnitRows(pubId: string, userId: string, postId: string, pkg: SeqPackage): Promise<void> {
  await rest(`/post_unit_publications?on_conflict=publication_id,unit_id`, { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify(pkg.units.map((u) => ({ publication_id: pubId, user_id: userId, post_id: postId, unit_id: u.id, position: u.position, status: 'pending' }))) });
}

// Publica as telas pendentes NA ORDEM; para na primeira falha. Tela com resultado desconhecido não é
// repetida às cegas: a sequência para até a conferência.
export async function publishStories(token: string, igId: string, pubId: string, pkg: SeqPackage):
  Promise<{ published: number; failed: string | null; unknown: boolean; first?: { id: string; url: string } }> {
  const recs = await rest<Row[]>(`/post_unit_publications?publication_id=eq.${pubId}&select=*&order=position.asc`);
  let published = recs.filter((r) => r.status === 'published').length;
  const pendingUnknown = recs.find((r) => r.status === 'unknown');
  if (pendingUnknown) return { published, failed: `Story ${pendingUnknown.position}: confira se foi publicado antes de continuar.`, unknown: true };
  let first: { id: string; url: string } | undefined;
  for (const r of recs.filter((x) => x.status !== 'published')) {
    const u = pkg.units.find((x) => x.id === r.unit_id);
    try {
      if (!u?.rendered_url) throw new Error(`Unidade ${r.position} sem imagem.`);
      const res = await publishInstagramStoryUnit(token, igId, u.rendered_url);
      first = first ?? res;
      published++;
      await rest(`/post_unit_publications?id=eq.${r.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'published', external_id: res.id, error: null, published_at: new Date().toISOString() }) });
    } catch (e) {
      const unknown = e instanceof SendError && !e.beforeSend;
      await rest(`/post_unit_publications?id=eq.${r.id}`, { method: 'PATCH', body: JSON.stringify({ status: unknown ? 'unknown' : 'failed', error: (e as Error).message.slice(0, 400) }) });
      return { published, failed: `Story ${r.position}: ${(e as Error).message}`, unknown, first };
    }
  }
  return { published, failed: null, unknown: false, first };
}
