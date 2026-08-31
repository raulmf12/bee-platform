// Biblioteca de assets da Hive (fotos p/ D, texturas p/ E): upload no bucket
// 'design' (público, mesmo projeto -> CORS ok pro render client-side) + CRUD na
// tabela design_assets. Usado pela tela de curadoria.

import { supabase } from '@/lib/supabase';

const BUCKET = 'design';

export interface DesignAssetRow {
  id: string;
  kind: 'photo' | 'texture' | string;
  title: string;
  url: string;
  storage_path: string | null;
  origin: string;
  tags: string[] | null;
  is_active: boolean;
}

let _seq = 0;
export function blobFromBase64(b64: string, mime = 'image/png'): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function imageDims(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 1080, h: 1350 });
    img.src = src;
  });
}

export async function uploadDesignAsset(blob: Blob): Promise<{ path: string; publicUrl: string }> {
  const ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
  const path = `hive/${Date.now()}-${_seq++}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    upsert: true, contentType: blob.type, cacheControl: '3600',
  });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { path, publicUrl: data.publicUrl };
}

export async function saveDesignAsset(row: {
  kind: 'photo' | 'texture' | string;
  title: string;
  url: string;
  storage_path: string;
  mime_type?: string;
  width?: number;
  height?: number;
  origin?: string;
  semantic?: Record<string, unknown>;
  tags?: string[];
  person_slug?: string;
  source_image_id?: string;
}): Promise<string> {
  const { data, error } = await supabase.from('design_assets').insert({
    kind: row.kind, title: row.title, url: row.url, storage_path: row.storage_path,
    mime_type: row.mime_type, width: row.width, height: row.height,
    origin: row.origin ?? 'generated', semantic: row.semantic ?? {}, tags: row.tags ?? [], is_active: true,
    person_slug: row.person_slug ?? null, source_image_id: row.source_image_id ?? null,
  }).select('id').single();
  if (error) throw error;
  return (data?.id as string) ?? '';
}

export async function listDesignAssets(): Promise<DesignAssetRow[]> {
  const { data, error } = await supabase
    .from('design_assets')
    .select('id,kind,title,url,storage_path,origin,tags,is_active')
    .in('kind', ['photo', 'texture'])
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as DesignAssetRow[];
}

export interface MarcosPhotoRow extends DesignAssetRow {
  semantic: Record<string, unknown>;
}

// Fotos REAIS do Marcos — o topo da hierarquia de imagem da M02.
export async function listMarcosPhotos(): Promise<MarcosPhotoRow[]> {
  const { data, error } = await supabase
    .from('design_assets')
    .select('id,kind,title,url,storage_path,origin,tags,is_active,semantic')
    .eq('kind', 'photo')
    .eq('person_slug', 'marcos')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as MarcosPhotoRow[];
}

// Sobe uma foto real do Marcos (o proprio arquivo do usuario) e registra as tags
// semanticas que deixam o motor da Hive ESCOLHER (nao sortear).
export async function saveMarcosPhoto(row: {
  title: string;
  url: string;
  storage_path: string;
  mime_type?: string;
  width?: number;
  height?: number;
  origin?: 'real' | 'real_adapted';
  semantic: Record<string, unknown>;
  tags?: string[];
}): Promise<string> {
  const id = await saveDesignAsset({
    kind: 'photo', title: row.title, url: row.url, storage_path: row.storage_path,
    mime_type: row.mime_type, width: row.width, height: row.height,
    origin: row.origin ?? 'real', semantic: row.semantic, tags: row.tags ?? [], person_slug: 'marcos',
  });
  // Foto real e a ancestral de si mesma (source_image_id = proprio id) — deriva­coes
  // futuras (real_adapted) apontam pra ca, e a diversidade conta por fonte.
  if (id && (row.origin ?? 'real') === 'real') {
    await supabase.from('design_assets').update({ source_image_id: id }).eq('id', id);
  }
  return id;
}

export async function deleteDesignAsset(id: string, storagePath: string | null): Promise<void> {
  if (storagePath) await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {});
  const { error } = await supabase.from('design_assets').delete().eq('id', id);
  if (error) throw error;
}

export async function setAssetActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('design_assets').update({ is_active: active }).eq('id', id);
  if (error) throw error;
}
