// APROVAÇÃO DURÁVEL (Estabilização · doc 02 §5): a decisão só é "aprovada" depois que o
// SERVIDOR gravou. As revisões são mescladas no banco (merge_post_review) — nunca o
// metadata inteiro de uma cópia antiga — e levam a impressão digital do texto apresentado:
// se o texto mudou no meio (outra aba, autosave), o banco recusa em vez de aprovar a versão nova.
import { db } from './db';
import type { UserPost } from '@/types';

export type ReviewField = 'titulo' | 'legenda';

export async function sha256Hex(text: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text ?? ''));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const one = (r: UserPost | UserPost[]): UserPost => (Array.isArray(r) ? r[0] : r);

// Mescla campos de revisão (titulo_status, legenda_status, review_stage) no servidor.
// expect: textos apresentados ao produtor, conferidos contra o gravado.
export async function mergeReview(postId: string, patch: Record<string, string>, expect: Partial<Record<ReviewField, string>> = {}): Promise<UserPost> {
  const exp: Record<string, string> = {};
  for (const [k, v] of Object.entries(expect)) if (v !== undefined) exp[k] = await sha256Hex(v);
  return one(await db.rpc<UserPost | UserPost[]>('merge_post_review', { p_post: postId, p_patch: patch, p_expect: exp }));
}

// "Aprovar peça" (imagem única/vídeo): confirma o visual apresentado (rendered) e pronto. Não desagenda.
export async function approvePieceOnServer(postId: string, rendered?: string | null, approveAi = false): Promise<UserPost> {
  return one(await db.rpc<UserPost | UserPost[]>('approve_piece', { p_post: postId, p_rendered: rendered ?? null, p_approve_ai: approveAi }));
}

// Publicação feita fora da Hive: registra como resultado confirmado (substitui status 'published' direto).
export async function registerManualPublication(postId: string, url?: string | null): Promise<UserPost> {
  return one(await db.rpc<UserPost | UserPost[]>('register_manual_publication', { p_post: postId, p_url: url ?? null }));
}
