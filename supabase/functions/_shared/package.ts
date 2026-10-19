// PACOTE IMUTÁVEL DE PUBLICAÇÃO (Estabilização · doc 03 §5–§7, §12–§14).
// O que vai ao ar é fechado no agendamento (ou no "Publicar agora"): textos, arquivos COPIADOS para um
// caminho próprio do pacote (bucket `packages`, escrito só pelo servidor) com SHA-256 completo, ordem das
// unidades e o destino resolvido (identidade real da conta, não "padrão"). Edições posteriores da peça não
// mexem no pacote; a troca é sempre um comando explícito (replace_package).

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const BUCKET = 'packages';
export const PACKAGE_SCHEMA = 1;

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;
function svc(): Record<string, string> {
  const k = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' };
}
export async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, { ...init, headers: { ...svc(), ...(init.headers ?? {}) } });
  const text = await res.text();
  if (!res.ok) {
    let msg = text.slice(0, 300), code = '';
    try { const j = JSON.parse(text); msg = j.message ?? msg; code = j.code ?? ''; } catch { /* texto cru */ }
    const e = new Error(msg) as Error & { code?: string; status?: number };
    e.code = code; e.status = res.status;
    throw e;
  }
  return (text ? JSON.parse(text) : null) as T;
}
export const rpc = <T>(fn: string, args: object) => rest<T>(`/rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });

export async function sha256Hex(data: ArrayBuffer | Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data instanceof Uint8Array ? data : new Uint8Array(data);
  const h = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
// JSON canônico (chaves ordenadas, campos indefinidos omitidos — como o banco guarda) para a impressão
// digital do manifesto: o mesmo manifesto lido do banco precisa dar o mesmo hash.
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? 'null' : canonical(x))).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v as Row).filter((k) => (v as Row)[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Row)[k])}`).join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

export interface PkgFile { role: 'image' | 'unit' | 'pdf' | 'video'; position?: number; url: string; path: string | null; mime: string; bytes: number; sha256: string | null; source_url: string; copied: boolean }
export interface PkgUnit { id: string; position: number; title: string | null; alt_text: string | null; file: number }
export interface Manifest {
  schema_version: number;
  post_id: string; source_version: number; platform: string; format: string;
  destination: string; account_id: string | null;
  texts: { caption: string; quote: string | null; title: string | null };
  files: PkgFile[];
  units: PkgUnit[];
  approvals: Row;
  visual: { variant: string | null };
  context: { profile_id: string | null; context_snapshot_id: string | null };
  planning_notes: Array<{ position: number; interaction: unknown }>;
}
export interface PackageRow { id: string; user_id: string; post_id: string; schema_version: number; source_version: number; platform: string; format: string; account_id: string | null; destination: string; manifest: Manifest; manifest_sha256: string; origin: string; created_at: string }

// Destino = identidade real da conta (03 §14): troca de "conta padrão" não muda peça já fechada.
export async function resolveDestination(post: Row): Promise<{ destination: string; account_id: string | null }> {
  const idOf = (platform: string, s: Row | null) => platform === 'linkedin' ? s?.linkedin_author_urn : s?.instagram_business_account_id;
  if (post.account_id) {
    const [acc] = await rest<Row[]>(`/social_accounts?id=eq.${post.account_id}&select=id,user_id,platform,label,status,metadata,linkedin_author_urn,instagram_business_account_id`);
    if (!acc || acc.user_id !== post.user_id) throw new Error('A conta desta peça não existe mais. Escolha outra conta antes de agendar.');
    if (acc.platform !== post.platform) throw new Error(`A conta "${acc.label}" é de outra rede.`);
    let ident = idOf(post.platform, acc);
    if (!ident && acc.metadata?.source === 'integrations') {
      const [s] = await rest<Row[]>(`/user_settings?user_id=eq.${post.user_id}&select=linkedin_author_urn,instagram_business_account_id`);
      ident = idOf(post.platform, s ?? null);
    }
    if (!ident) throw new Error(`A conta "${acc.label}" não tem a identificação da ${post.platform === 'linkedin' ? 'página/perfil do LinkedIn' : 'conta do Instagram'}.`);
    return { destination: `${post.platform}:${ident}`, account_id: acc.id };
  }
  const [s] = await rest<Row[]>(`/user_settings?user_id=eq.${post.user_id}&select=linkedin_author_urn,instagram_business_account_id`);
  const ident = idOf(post.platform, s ?? null);
  if (!ident) throw new Error('Nenhuma conta conectada para esta rede.');
  return { destination: `${post.platform}:${ident}`, account_id: null };
}

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };

// Copia os BYTES para o caminho imutável do pacote (sem upsert) e calcula o SHA-256 completo.
async function copyFile(userId: string, pkgId: string, n: number, role: PkgFile['role'], srcUrl: string, position?: number): Promise<PkgFile> {
  const r = await fetch(srcUrl);
  if (!r.ok) throw new Error(`Arquivo ${position ?? n + 1} inacessível (${r.status}).`);
  const mime = (r.headers.get('content-type') ?? '').split(';')[0].trim() || 'application/octet-stream';
  if (!EXT[mime]) throw new Error(`Arquivo ${position ?? n + 1} com tipo inesperado (${mime}).`);
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (!bytes.length) throw new Error(`Arquivo ${position ?? n + 1} vazio.`);
  const path = `${userId}/${pkgId}/${String(n + 1).padStart(2, '0')}-${role}.${EXT[mime]}`;
  const up = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST', headers: { ...svc(), 'Content-Type': mime, 'x-upsert': 'false', 'cache-control': 'max-age=31536000, immutable' }, body: bytes,
  });
  if (!up.ok) throw new Error(`Falha ao preservar o arquivo ${position ?? n + 1}: ${up.status} ${(await up.text()).slice(0, 160)}`);
  return { role, position, url: `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`, path, mime, bytes: bytes.length, sha256: await sha256Hex(bytes), source_url: srcUrl, copied: true };
}

// Fecha o pacote da VERSÃO ATUAL da peça (já validada pelo chamador). Se a peça mudar no meio do
// fechamento, recusa (03/T33 — nunca um pacote híbrido).
export async function sealPackage(postId: string, userId: string, origin: 'schedule' | 'publish_now' | 'legacy_confirmed', commandId?: string | null): Promise<PackageRow> {
  const sel = 'id,user_id,platform,format,caption,title,carousel_text,rendered_slides,visual_decision,metadata,account_id,version,updated_at,status,text_approved,image_approved,image_status,approved_version,profile_id,context_snapshot_id';
  const [post] = await rest<Row[]>(`/user_posts?id=eq.${postId}&select=${sel}`);
  if (!post || post.user_id !== userId) throw new Error('Peça não encontrada.');
  const { destination, account_id } = await resolveDestination(post);
  const pkgId = crypto.randomUUID();
  const files: PkgFile[] = [];
  const units: PkgUnit[] = [];
  const notes: Manifest['planning_notes'] = [];

  if (post.format === 'carousel' || post.format === 'story') {
    const us = await rest<Row[]>(`/post_units?post_id=eq.${postId}&select=id,position,title,alt_text,rendered_url,interaction&order=position.asc`);
    for (const u of us) {
      if (!u.rendered_url) throw new Error(`Página ${u.position} sem imagem.`);
      files.push(await copyFile(userId, pkgId, files.length, 'unit', u.rendered_url, u.position));
      units.push({ id: u.id, position: u.position, title: u.title ?? null, alt_text: u.alt_text ?? null, file: files.length - 1 });
      if (u.interaction) notes.push({ position: u.position, interaction: u.interaction });
    }
  } else if (post.format === 'video' || post.format === 'reel') {
    // Vídeo: referência ao arquivo original (não copiado — tamanho); tamanho registrado para conferência.
    const url = post.metadata?.video_url as string | undefined;
    if (!url) throw new Error('Vídeo não encontrado na peça.');
    const h = await fetch(url, { method: 'HEAD' }).catch(() => null);
    if (!h?.ok) throw new Error('O vídeo da peça está inacessível.');
    files.push({ role: 'video', url, path: null, mime: h.headers.get('content-type') ?? 'video/mp4', bytes: Number(h.headers.get('content-length') ?? 0), sha256: null, source_url: url, copied: false });
  } else {
    const img = post.rendered_slides?.slide1 as string | undefined;
    if (!img) throw new Error('Imagem final não renderizada.');
    files.push(await copyFile(userId, pkgId, 0, 'image', img));
  }

  const manifest: Manifest = {
    schema_version: PACKAGE_SCHEMA, post_id: postId, source_version: post.version ?? 1, platform: post.platform, format: post.format,
    destination, account_id,
    texts: { caption: post.caption ?? '', quote: (post.carousel_text?.quote as string | undefined) ?? null, title: post.title ?? null },
    files, units,
    approvals: {
      status: post.status, approved_version: post.approved_version ?? null, text_approved: !!post.text_approved, image_approved: !!post.image_approved,
      image_status: post.image_status ?? null, titulo_status: post.metadata?.titulo_status ?? null, legenda_status: post.metadata?.legenda_status ?? null,
      bg_approved: post.metadata?.bg_approved === true, approved_at: post.updated_at,
    },
    visual: { variant: (post.visual_decision?.variant as string | undefined) ?? null },
    context: { profile_id: post.profile_id ?? null, context_snapshot_id: post.context_snapshot_id ?? null },
    planning_notes: notes,
  };
  // a peça não pode ter mudado enquanto os arquivos eram copiados
  const [again] = await rest<Row[]>(`/user_posts?id=eq.${postId}&select=updated_at,version`);
  if (!again || again.updated_at !== post.updated_at || again.version !== post.version) {
    throw Object.assign(new Error('A peça mudou enquanto o conteúdo era preparado. Revise e tente de novo.'), { code: 'PT409', status: 409 });
  }
  const [row] = await rest<PackageRow[]>(`/publication_packages`, { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({
    id: pkgId, user_id: userId, post_id: postId, schema_version: PACKAGE_SCHEMA, source_version: manifest.source_version, platform: post.platform, format: post.format,
    account_id, destination, manifest, manifest_sha256: await sha256Hex(canonical(manifest)), origin, command_id: commandId ?? null,
  }) });
  return row;
}

export async function loadPackageRow(id: string): Promise<PackageRow | null> {
  const [row] = await rest<PackageRow[]>(`/publication_packages?id=eq.${id}&select=*`);
  return row ?? null;
}

// Conferência de integridade ANTES de qualquer efeito externo (03 §12): esquema conhecido, manifesto íntegro,
// arquivos presentes e com os MESMOS bytes (o 200 do servidor não basta — 03/T08).
export async function verifyPackage(pkg: PackageRow, opts: { bytes?: boolean } = { bytes: true }): Promise<string[]> {
  const issues: string[] = [];
  if (pkg.schema_version !== PACKAGE_SCHEMA || pkg.manifest?.schema_version !== PACKAGE_SCHEMA) return [`Pacote com formato técnico desconhecido (v${pkg.schema_version}). A publicação foi interrompida.`];
  if (await sha256Hex(canonical(pkg.manifest)) !== pkg.manifest_sha256) issues.push('O conteúdo programado não confere com o registro original.');
  const m = pkg.manifest;
  if (!m.files?.length) issues.push('O pacote programado não tem arquivos.');
  if ((m.format === 'carousel' || m.format === 'story') && m.units.length !== m.files.filter((f) => f.role === 'unit').length) issues.push('A sequência programada está incompleta.');
  for (const [i, f] of (m.files ?? []).entries()) {
    const label = f.position ? `página ${f.position}` : `arquivo ${i + 1}`;
    if (!f.copied) {
      const h = await fetch(f.url, { method: 'HEAD' }).catch(() => null);
      if (!h?.ok) issues.push(`O ${label} programado está indisponível.`);
      continue;
    }
    if (!opts.bytes) continue;
    // Lê o objeto GRAVADO (API do storage com a credencial do servidor), não a cópia em cache da CDN.
    const r = await fetch(f.path ? `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${f.path}` : f.url, { headers: f.path ? svc() : {}, cache: 'no-store' }).catch(() => null);
    if (!r?.ok) { issues.push(`O ${label} programado está indisponível.`); continue; }
    const sum = await sha256Hex(await r.arrayBuffer());
    if (sum !== f.sha256) issues.push(`O ${label} programado não corresponde à versão escolhida.`);
  }
  return issues;
}
