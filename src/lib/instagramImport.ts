// Importação do histórico de uma conta do Instagram, página a página (a edge
// processa ~10 mídias por chamada). Devolve o progresso a cada página.
import { edge } from '@/lib/edge';

export interface ImportProgress { processed: number; total: number | null; inserted: number; updated: number; insights: boolean; errors: string[]; done: boolean }

export async function importInstagramHistory(accountId: string, onProgress?: (p: ImportProgress) => void): Promise<ImportProgress> {
  const p: ImportProgress = { processed: 0, total: null, inserted: 0, updated: 0, insights: true, errors: [], done: false };
  let cursor: string | null = null;
  for (let guard = 0; guard < 500; guard++) {
    const r = await edge.instagramImport({ account_id: accountId, cursor });
    p.processed += r.processed; p.inserted += r.inserted; p.updated += r.updated;
    p.total = r.total ?? p.total; p.insights = p.insights && r.insights; p.errors.push(...r.errors);
    p.done = r.done;
    onProgress?.({ ...p });
    if (r.done || !r.next) break;
    cursor = r.next;
  }
  p.done = true;
  return p;
}
