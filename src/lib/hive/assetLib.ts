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
  kind: 'photo' | 'texture';
  title: string;
  url: string;
  storage_path: string;
  mime_type?: string;
  width?: number;
  height?: number;
  origin?: string;
  semantic?: Record<string, unknown>;
  tags?: string[];
}): Promise<void> {
  const { error } = await supabase.from('design_assets').insert({
    kind: row.kind, title: row.title, url: row.url, storage_path: row.storage_path,
    mime_type: row.mime_type, width: row.width, height: row.height,
    origin: row.origin ?? 'generated', semantic: row.semantic ?? {}, tags: row.tags ?? [], is_active: true,
  });
  if (error) throw error;
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

export async function deleteDesignAsset(id: string, storagePath: string | null): Promise<void> {
  if (storagePath) await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {});
  const { error } = await supabase.from('design_assets').delete().eq('id', id);
  if (error) throw error;
}

export async function setAssetActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('design_assets').update({ is_active: active }).eq('id', id);
  if (error) throw error;
}
