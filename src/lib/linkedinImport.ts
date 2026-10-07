// Importação do histórico do LinkedIn (scraper Apify, assíncrono): dispara, acompanha
// até terminar, importa e indexa tudo na memória anti-repetição.
import { edge } from '@/lib/edge';

export interface LiImportProgress { phase: 'scraping' | 'importing' | 'memory' | 'done'; found?: number; inserted?: number; memoryPending?: number }

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function importLinkedInHistory(accountId: string, profile: string, onProgress?: (p: LiImportProgress) => void, opts: { pollMs?: number } = {}): Promise<LiImportProgress> {
  await edge.linkedinImport({ action: 'start', account_id: accountId, profile });
  onProgress?.({ phase: 'scraping' });
  let r: Awaited<ReturnType<typeof edge.linkedinImport>> | null = null;
  for (let i = 0; i < 180; i++) {             // até ~15 min
    await wait(opts.pollMs ?? 5000);
    r = await edge.linkedinImport({ action: 'status', account_id: accountId });
    if (r.done) break;
  }
  if (!r?.done) throw new Error('O LinkedIn está demorando para responder. Tente "Importar histórico" de novo daqui a pouco — nada se duplica.');
  const p: LiImportProgress = { phase: 'memory', found: r.found, inserted: r.inserted };
  onProgress?.({ ...p });
  for (let i = 0; i < 60; i++) {
    const m = await edge.contentMemorySync({ limit: 40 });
    p.memoryPending = m.pending;
    onProgress?.({ ...p });
    if (m.pending === 0) break;
  }
  p.phase = 'done';
  onProgress?.({ ...p });
  return p;
}
