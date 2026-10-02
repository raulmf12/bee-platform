// Mapeamento PURO de uma mídia do Instagram (Graph API) para a peça da base
// (user_posts). Sem Deno: importado pelo importador e pelos testes unitários.

export interface IgChild { media_type: string; media_url?: string; thumbnail_url?: string }
export interface IgMedia {
  id: string; caption?: string; media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM' | string; media_product_type?: string;
  media_url?: string; thumbnail_url?: string; permalink?: string; timestamp: string;
  like_count?: number; comments_count?: number; children?: { data: IgChild[] };
}

// Formato da peça: imagem, carrossel ou vídeo (reel).
export function igFormat(m: Pick<IgMedia, 'media_type'>): 'image' | 'carousel' | 'reel' {
  if (m.media_type === 'CAROUSEL_ALBUM') return 'carousel';
  if (m.media_type === 'VIDEO') return 'reel';
  return 'image';
}

// A "frase" da peça = a primeira linha com conteúdo da legenda (o gancho), sem
// hashtags/menções soltas, cortada numa fronteira de palavra. É o que o
// "Reaproveitar" usa como título de referência.
export function quoteFromCaption(caption: string | undefined | null, max = 140): string {
  const lines = (caption ?? '').split('\n').map((l) => l.replace(/(^|\s)[#@][\p{L}\p{N}_.]+/gu, ' ').replace(/\s+/g, ' ').trim());
  const first = lines.find((l) => l.replace(/[^\p{L}\p{N}]/gu, '').length >= 3) ?? '';
  if (first.length <= max) return first;
  const cut = first.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 20)).trim()}…`;
}

// Imagens a guardar (na ordem): carrossel = cada slide (vídeo dentro do
// carrossel → capa); vídeo = capa; imagem = a própria.
export function imageSources(m: IgMedia, maxSlides = 10): string[] {
  if (m.media_type === 'CAROUSEL_ALBUM') {
    return (m.children?.data ?? [])
      .map((c) => (c.media_type === 'VIDEO' ? c.thumbnail_url : c.media_url))
      .filter((u): u is string => !!u).slice(0, maxSlides);
  }
  const u = m.media_type === 'VIDEO' ? (m.thumbnail_url ?? undefined) : m.media_url;
  return u ? [u] : [];
}

// Métricas por tipo de mídia (a Graph recusa a chamada inteira se uma métrica
// não existe pro tipo). `views` substituiu impressions.
export function insightMetricsFor(m: Pick<IgMedia, 'media_type'>): string[] {
  if (m.media_type === 'VIDEO') return ['reach', 'views', 'saved', 'shares', 'total_interactions'];
  return ['reach', 'views', 'saved', 'shares', 'total_interactions'];
}

// "IG-DDMMYY-xxxx": código próprio do importado (não consome a numeração BEE-).
export function importedCode(m: Pick<IgMedia, 'id' | 'timestamp'>): string {
  const d = new Date(m.timestamp);
  const p = (n: number) => String(n).padStart(2, '0');
  return `IG-${p(d.getUTCDate())}${p(d.getUTCMonth() + 1)}${String(d.getUTCFullYear()).slice(2)}-${m.id.slice(-5)}`;
}

// O id da mídia escondido numa URL antiga (o publish gravava /p/<media_id>/).
export function mediaIdFromUrl(url?: string | null): string | null {
  const m = url?.match(/instagram\.com\/(?:p|reel)\/(\d{6,})\/?/);
  return m ? m[1] : null;
}
