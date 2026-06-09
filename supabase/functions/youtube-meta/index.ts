// Edge function: youtube-meta
// Recebe { url } (link do YouTube) e devolve { video_id, title, description,
// channel, thumbnail_url }.
//
// Estrategia (na ordem):
//   1. Se YOUTUBE_API_KEY estiver setada -> YouTube Data API v3 (titulo +
//      descricao completa, robusto).
//   2. Senao -> oEmbed (titulo + canal + thumb, sem key) + scrape da pagina
//      watch pra pegar a descricao (shortDescription do ytInitialPlayerResponse).

import {
  errorResponse,
  jsonResponse,
  preflight,
  userIdFromAuth,
} from '../_shared/security.ts';

interface Input {
  url?: string;
}

// Extrai o videoId de qualquer formato comum de URL do YouTube.
function extractVideoId(raw: string): string | null {
  const url = raw.trim();
  // ja e um id puro (11 chars)
  if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return url;
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,        // watch?v=
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,   // youtu.be/
    /\/embed\/([a-zA-Z0-9_-]{11})/,     // /embed/
    /\/shorts\/([a-zA-Z0-9_-]{11})/,    // /shorts/
    /\/live\/([a-zA-Z0-9_-]{11})/,      // /live/
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

async function fromDataApi(videoId: string, key: string) {
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${key}`,
  );
  if (!res.ok) return null;
  const data = await res.json();
  const snippet = data?.items?.[0]?.snippet;
  if (!snippet) return null;
  return {
    title: snippet.title as string,
    description: (snippet.description as string) ?? '',
    channel: (snippet.channelTitle as string) ?? '',
    thumbnail_url:
      snippet.thumbnails?.maxres?.url ??
      snippet.thumbnails?.high?.url ??
      snippet.thumbnails?.default?.url ??
      '',
  };
}

async function fromOEmbed(videoId: string) {
  const res = await fetch(
    `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
  );
  if (!res.ok) return null;
  const data = await res.json();
  return {
    title: (data.title as string) ?? '',
    channel: (data.author_name as string) ?? '',
    thumbnail_url: (data.thumbnail_url as string) ?? '',
  };
}

// Scrape da descricao a partir do HTML da pagina watch.
async function scrapeDescription(videoId: string): Promise<string> {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      },
    });
    if (!res.ok) return '';
    const html = await res.text();
    // shortDescription vem como string JSON-escapada dentro do ytInitialPlayerResponse
    const m = html.match(/"shortDescription":"((?:\\.|[^"\\])*)"/);
    if (!m) return '';
    // desfaz o escape JSON
    return JSON.parse(`"${m[1]}"`);
  } catch {
    return '';
  }
}

Deno.serve(async (req: Request) => {
  const pf = preflight(req);
  if (pf) return pf;

  // exige usuario autenticado (mesma convencao das outras functions)
  const userId = userIdFromAuth(req);
  if (!userId) return errorResponse('Nao autenticado', 401);

  let input: Input;
  try {
    input = await req.json();
  } catch {
    return errorResponse('JSON invalido', 400);
  }

  if (!input.url) return errorResponse('url obrigatoria', 400);
  const videoId = extractVideoId(input.url);
  if (!videoId) return errorResponse('URL do YouTube invalida', 400);

  const apiKey = Deno.env.get('YOUTUBE_API_KEY');

  try {
    if (apiKey) {
      const meta = await fromDataApi(videoId, apiKey);
      if (meta) {
        return jsonResponse({
          success: true,
          video_id: videoId,
          url: `https://www.youtube.com/watch?v=${videoId}`,
          ...meta,
        });
      }
    }

    // fallback sem key
    const oembed = await fromOEmbed(videoId);
    if (!oembed) return errorResponse('Nao foi possivel ler o video (privado/removido?)', 422);
    const description = await scrapeDescription(videoId);

    return jsonResponse({
      success: true,
      video_id: videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      title: oembed.title,
      description,
      channel: oembed.channel,
      thumbnail_url: oembed.thumbnail_url,
    });
  } catch (e) {
    return errorResponse(`Falha ao buscar metadados: ${(e as Error).message}`, 500);
  }
});
