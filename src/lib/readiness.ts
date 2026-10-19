// PRONTIDÃO POR FORMATO — leitura (Estabilização · doc 02 §7). Quem decide é o servidor
// (piece_readiness, usado por aprovar/agendar/publicar); aqui só mostramos as MESMAS
// pendências em editor, agenda e revisão, para o produtor saber o que falta.
import { useEffect, useState } from 'react';
import { db } from './db';

export type ReadinessScope = 'approve_piece' | 'schedule' | 'publish';
export interface Readiness { ready: boolean; missing: Array<{ component: string; reason: string }> }

export const fetchReadiness = (postId: string, scope: ReadinessScope = 'schedule') =>
  db.rpc<Readiness>('piece_readiness', { p_post: postId, p_scope: scope });

// Relê quando `stamp` muda (ex.: updated_at da peça). Falha de leitura ≠ "pronta": devolve null.
export function useReadiness(postId: string | null | undefined, scope: ReadinessScope, stamp?: unknown): Readiness | null {
  const [r, setR] = useState<Readiness | null>(null);
  useEffect(() => {
    if (!postId) { setR(null); return; }
    let alive = true;
    fetchReadiness(postId, scope).then((x) => alive && setR(x)).catch(() => alive && setR(null));
    return () => { alive = false; };
  }, [postId, scope, stamp]);
  return r;
}
