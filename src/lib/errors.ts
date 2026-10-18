// Mensagem legível de um erro do banco/funções. O cliente REST lança
// "HTTP 409 Conflict: {json}"; as regras do banco (RAISE ... PT4xx) e das funções
// trazem o motivo em `message`/`details`/`error` — é isso que o produtor deve ler.
export function userMessage(e: unknown, fallback = 'Não foi possível concluir.'): string {
  const raw = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
  const json = raw.slice(raw.indexOf('{'));
  if (raw.includes('{')) {
    try {
      const body = JSON.parse(json) as { message?: string; details?: string; error?: string };
      const msg = body.details && body.error ? body.details : body.message || body.details || body.error;
      if (msg) return msg;
    } catch { /* não é JSON: segue */ }
  }
  return raw && !/^HTTP \d+/.test(raw) ? raw : fallback;
}

// Peça publicada (ou publicada e arquivada) é histórico: não volta à fila nem ganha nova data.
export function isPublishedHistory(p: { status: string; published_at?: string | null; published_url?: string | null }): boolean {
  return p.status === 'published' || (p.status === 'archived' && !!(p.published_at || p.published_url));
}

export const PUBLISHED_HISTORY_MSG = 'Este conteúdo já foi publicado e permanece no histórico.';
