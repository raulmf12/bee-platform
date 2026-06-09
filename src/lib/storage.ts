// Helpers de upload para o bucket "media".
// Path convention: {user_id}/assets/{asset_id}/{filename}

import * as tus from 'tus-js-client';
import { MEDIA_BUCKET, supabase } from './supabase';

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, b64] = dataUrl.split(',');
  const mime = meta.match(/data:(.*?);base64/)?.[1] ?? 'image/png';
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// Hash simples do dataURL pra evitar uploads redundantes (mesmo PNG gerado 2x).
export async function hashDataUrl(dataUrl: string): Promise<string> {
  const enc = new TextEncoder();
  const buffer = await crypto.subtle.digest('SHA-256', enc.encode(dataUrl));
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}

interface UploadParams {
  userId: string;
  assetId: string;
  dataUrl: string;
  // sufixo do nome (ex: "preview.png"). Default usa timestamp.
  filename?: string;
}

export async function uploadAssetImage({
  userId,
  assetId,
  dataUrl,
  filename,
}: UploadParams): Promise<{ path: string; publicUrl: string }> {
  const blob = dataUrlToBlob(dataUrl);
  const ext = blob.type.split('/')[1] || 'png';
  const finalName = filename ?? `${Date.now()}.${ext}`;
  const path = `${userId}/assets/${assetId}/${finalName}`;

  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, blob, { upsert: true, contentType: blob.type, cacheControl: '3600' });
  if (error) throw error;

  const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
  return { path, publicUrl: data.publicUrl };
}

export async function deleteAssetImage(path: string): Promise<void> {
  const { error } = await supabase.storage.from(MEDIA_BUCKET).remove([path]);
  if (error) throw error;
}

// Apaga todas as imagens de um asset (ex: ao deletar o asset).
export async function deleteAssetFolder(userId: string, assetId: string): Promise<void> {
  const prefix = `${userId}/assets/${assetId}`;
  const { data, error } = await supabase.storage.from(MEDIA_BUCKET).list(prefix);
  if (error || !data?.length) return;
  const paths = data.map((file) => `${prefix}/${file.name}`);
  await supabase.storage.from(MEDIA_BUCKET).remove(paths);
}

// Upload de video via TUS (resumable, chunks 6MB).
// Suporta arquivos grandes (>50MB) e retoma em caso de falha de rede.
// Path: {user_id}/videos/{post_id}/source.{ext}
export async function uploadVideo(
  userId: string,
  postId: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<{ path: string; publicUrl: string }> {
  const ext = file.name.split('.').pop() ?? 'mp4';
  return uploadVideoToPath(`${userId}/videos/${postId}/source.${ext}`, file, onProgress);
}

// Upload de corte de podcast.
// Path: {user_id}/podcasts/{clip_id}/source.{ext}
export async function uploadPodcastClip(
  userId: string,
  clipId: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<{ path: string; publicUrl: string }> {
  const ext = file.name.split('.').pop() ?? 'mp4';
  return uploadVideoToPath(`${userId}/podcasts/${clipId}/source.${ext}`, file, onProgress);
}

// Core do upload TUS pra um path arbitrario no bucket media.
async function uploadVideoToPath(
  path: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<{ path: string; publicUrl: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  const jwt = session?.access_token;
  if (!jwt) throw new Error('Nao autenticado');

  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${jwt}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        'x-upsert': 'true',
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      // Supabase exige chunks de exatamente 6MB (menos no ultimo)
      chunkSize: 6 * 1024 * 1024,
      metadata: {
        bucketName: MEDIA_BUCKET,
        objectName: path,
        contentType: file.type,
        cacheControl: '3600',
      },
      onError: (error) => {
        console.error('[uploadVideo TUS]', error);
        reject(error);
      },
      onProgress: (bytesUploaded, bytesTotal) => {
        if (onProgress) onProgress((bytesUploaded / bytesTotal) * 100);
      },
      onSuccess: () => {
        const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
        resolve({ path, publicUrl: data.publicUrl });
      },
    });

    // Tenta retomar upload anterior se existir
    upload.findPreviousUploads().then((previous) => {
      if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
      upload.start();
    }).catch(() => {
      upload.start();
    });
  });
}
