// Mapeamento puro de um post do LinkedIn (scraper Apify apimaestro/linkedin-profile-posts)
// para a base de posts. Sem métricas por enquanto (só o que foi DITO, para não repetir).
import { quoteFromCaption } from './instagram-map.ts';

export interface LiScraped {
  urn?: string; url?: string; text?: string; post_type?: string;
  posted_at?: { date?: string; timestamp?: number } | string | null;
  reshared_post?: unknown; media?: unknown;
}

// Perfil: aceita URL completa ou só o usuário.
export function liUsername(profile: string): string | null {
  const s = profile.trim();
  const m = s.match(/linkedin\.com\/in\/([^/?#]+)/i);
  const u = decodeURIComponent((m ? m[1] : s).replace(/^@/, '')).trim();
  return /^[\p{L}\d\-_.%]{2,100}$/u.test(u) ? u : null;
}

export function liPostedAt(p: LiScraped): string | null {
  const v = p.posted_at;
  if (!v) return null;
  if (typeof v === 'string') { const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d.toISOString(); }
  if (typeof v.timestamp === 'number') return new Date(v.timestamp < 1e12 ? v.timestamp * 1000 : v.timestamp).toISOString();
  if (v.date) { const d = new Date(v.date.replace(' ', 'T')); return Number.isNaN(d.getTime()) ? null : d.toISOString(); }
  return null;
}

export const liKey = (p: LiScraped): string | null => p.urn ?? p.url?.split('?')[0] ?? null;

// Só o que o autor ESCREVEU: repost sem comentário próprio não entra.
export function liMapPost(p: LiScraped): { key: string; quote: string; text: string; posted_at: string | null; url: string | null; post_type: string } | null {
  const text = String(p.text ?? '').trim();
  const key = liKey(p);
  if (!key || text.length < 15) return null;
  return { key, quote: quoteFromCaption(text) || text.slice(0, 120), text, posted_at: liPostedAt(p), url: p.url?.split('?')[0] ?? null, post_type: p.post_type ?? (p.reshared_post ? 'quote' : 'regular') };
}
