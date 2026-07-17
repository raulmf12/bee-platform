// Edge function: editorial-line-tick
// Chamada a cada 15min pelo pg_cron. Para cada linha 'active' com next_run_at <= NOW():
//   1. Pega proximo editorial na rotacao
//   2. Para cada plataforma (linkedin/instagram):
//      - Gera quote+caption via generate-content (com continuidade dos ultimos 5 posts)
//      - Hidrata template Bee Quote (portrait pra LI, square pra IG)
//      - Cria user_posts (status='idea', kanban coluna padrao)
//      - Marca posts irmaos via companion_post_id
//   3. Cria editorial_line_runs (1 por plataforma)
//   4. Atualiza linha: next_run_at, last_run_at, posts_generated_count, rotation_cursor
//
// Aceita chamada sem JWT (cron + service_role automatico via header da supabase pg_net).

import { corsHeaders, errorResponse, jsonResponse, preflight } from '../_shared/security.ts';

interface EditorialLine {
  id: string;
  user_id: string;
  product_id: string | null;
  name: string;
  description: string | null;
  editorial_slugs: string[];
  rotation_cursor: number;
  target_avatar: string | null;
  platforms: string[];
  campaign_phase: string;
  briefing_base: string | null;
  theme: string | null;
  next_run_at: string | null;
  posts_generated_count: number;
  frequency_type: string;
  frequency_days: number[] | null;
  preferred_hour: number;
  start_date: string | null;
  end_date: string | null;
  last_run_at: string | null;
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function svc(extra: HeadersInit = {}): HeadersInit {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function fetchPendingLines(): Promise<EditorialLine[]> {
  const now = new Date().toISOString();
  const url = `${SUPABASE_URL}/rest/v1/editorial_lines?select=*&status=eq.active&next_run_at=lte.${now}&order=next_run_at.asc&limit=10`;
  const res = await fetch(url, { headers: svc() });
  if (!res.ok) throw new Error(`fetch lines HTTP ${res.status}: ${await res.text()}`);
  return await res.json();
}

// O PORTAO — a trava que importa de verdade.
//
// A UI mostrar cadeado nao impede nada: quem gera e publica sozinho e ESTE
// cron, e ele roda sem sessao, a cada 15min. Sem esta checagem a campanha
// continuaria produzindo com a UI travada.
//
// Consulta a MESMA funcao do banco que o frontend (ai_gate_status), por
// usuario: a eficacia e da IA aprendendo a voz DAQUELE usuario.
async function gateOpen(userId: string): Promise<{ open: boolean; why: string }> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/ai_gate_status`, {
      method: 'POST',
      headers: svc(),
      body: JSON.stringify({ p_user_id: userId }),
    });
    if (!res.ok) {
      return { open: false, why: `portao indisponivel (HTTP ${res.status})` };
    }
    const g = await res.json();
    return {
      open: g?.destravada === true,
      why: `acuracia ${g?.acuracia}% · amostra ${g?.amostra}/${g?.min_amostra} · geracoes ${g?.geracoes}/${g?.min_geracoes}`,
    };
  } catch (e) {
    // Falhou ao perguntar? NAO gera. Uma campanha autonoma errando e cara;
    // ficar parada 15min ate o proximo tick nao e.
    return { open: false, why: `portao inacessivel: ${String(e).slice(0, 80)}` };
  }
}

async function fetchProduct(productId: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/bee_products?id=eq.${productId}&limit=1`, {
    headers: svc(),
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] ?? null;
}

async function fetchLastPosts(lineId: string, n: number) {
  const url = `${SUPABASE_URL}/rest/v1/user_posts?select=id,title,caption,carousel_text,platform,created_at&editorial_line_id=eq.${lineId}&order=created_at.desc&limit=${n}`;
  const res = await fetch(url, { headers: svc() });
  if (!res.ok) return [];
  return await res.json();
}

async function generateContentForLine(line: EditorialLine, editorialSlug: string, previousPosts: any[]): Promise<{
  quote: string;
  caption: string;
  headline_type_used?: string;
  analogy_used?: string;
}> {
  // monta briefing enriquecido com continuidade + produto
  const product = line.product_id ? await fetchProduct(line.product_id) : null;
  const parts: string[] = [];

  if (line.briefing_base) parts.push(`Tema base da linha: ${line.briefing_base}`);
  if (line.theme) parts.push(`Foco editorial: ${line.theme}`);
  if (product) {
    parts.push(`Produto vinculado: ${product.name}`);
    if (product.promessa) parts.push(`Promessa do produto: ${product.promessa}`);
    if (line.campaign_phase && line.campaign_phase !== 'free') {
      const phaseTxt = {
        pre_launch: 'Fase: PRE-LANCAMENTO — provoque consciencia da dor, sem mencionar produto.',
        launch: 'Fase: LANCAMENTO — pode mencionar o produto como solucao.',
        post_launch: 'Fase: POS-LANCAMENTO — case, depoimento, reforco.',
      }[line.campaign_phase as 'pre_launch' | 'launch' | 'post_launch'] ?? '';
      if (phaseTxt) parts.push(phaseTxt);
    }
  }
  if (previousPosts.length) {
    parts.push(`\n== POSTS ANTERIORES NESTA LINHA (NAO REPETIR — adicionar uma camada que complemente) ==`);
    previousPosts.forEach((p, i) => {
      const quote = p.carousel_text?.quote ?? '';
      const captionExcerpt = (p.caption ?? '').slice(0, 200);
      parts.push(`\n[Post ${i + 1} — ${p.platform}] Quote: "${quote}"\nCaption (excerto): ${captionExcerpt}...`);
    });
    parts.push(`\n== FIM POSTS ANTERIORES ==\n`);
  }

  const briefing = parts.join('\n');

  // chama generate-content via REST (mesmo edge)
  const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-content`, {
    method: 'POST',
    // x-bee-user-id: o cron nao tem sessao, e o JWT do service_role nao tem
    // `sub`. Sem dizer por quem age, o generate-content responde 401 — e era
    // exatamente isso que travava a campanha.
    headers: svc({ 'x-bee-user-id': line.user_id }),
    body: JSON.stringify({
      editorial_slug: editorialSlug,
      target_avatar: line.target_avatar ?? 'ambos',
      briefing,
      quote_max_chars: 200,
    }),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`generate-content HTTP ${res.status}: ${txt.slice(0, 300)}`);
  const json = JSON.parse(txt);
  if (!json.success) throw new Error(`generate-content failed: ${json.error}`);
  return json;
}

// ---- hidratacao template Bee Quote inline (versao Deno) ----
// (copia minimalista do beeQuote.ts pra evitar import cross-deno)
const LAYOUT_PORTRAIT = { width: 1080, height: 1350, textTopRatio: 0.50, textWidthRatio: 0.86, initialFontSize: 60, minFontSize: 30, maxLines: 4, logoTopRatio: 0.79, logoSize: 58 };
const LAYOUT_SQUARE = { width: 1080, height: 1080, textTopRatio: 0.48, textWidthRatio: 0.84, initialFontSize: 64, minFontSize: 32, maxLines: 4, logoTopRatio: 0.80, logoSize: 60 };

function autofitFontSize(text: string, maxWidth: number, maxLines: number, initial: number, min: number): number {
  let fs = initial;
  const segs = text.split(/\r?\n/);
  while (fs >= min) {
    const cpl = Math.max(8, Math.floor(maxWidth / (fs * 0.5)));
    let total = 0;
    for (const s of segs) {
      const words = s.split(' ');
      let line = 0, cur = 0;
      for (const w of words) {
        const wl = w.length + 1;
        if (cur + wl > cpl && cur > 0) { line++; cur = wl; } else cur += wl;
      }
      total += line + 1;
    }
    if (total <= maxLines) return fs;
    fs -= 2;
  }
  return min;
}

function createSpiralPath(cx: number, cy: number, maxR: number): string {
  const turns = 2.2, points = 90, totalAngle = turns * 2 * Math.PI, startAngle = Math.PI * 1.55;
  let path = '';
  for (let i = 0; i <= points; i++) {
    const t = i / points;
    const angle = startAngle + t * totalAngle;
    const r = maxR * t;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    path += (i === 0 ? `M ${x.toFixed(2)} ${y.toFixed(2)} ` : `L ${x.toFixed(2)} ${y.toFixed(2)} `);
  }
  return path;
}

function hydrateBeeQuote(quote: string, layout: typeof LAYOUT_PORTRAIT) {
  const { width, height } = layout;
  const textWidth = Math.round(width * layout.textWidthRatio);
  const fs = autofitFontSize(quote || 'Sua frase aqui', textWidth, layout.maxLines, layout.initialFontSize, layout.minFontSize);
  const textTop = Math.round(height * layout.textTopRatio - (fs * 1.35 * layout.maxLines) / 2);
  const lx = width / 2;
  const ly = Math.round(height * layout.logoTopRatio);
  return {
    version: '6.0.0',
    background: '#FFFFFF',
    objects: [
      {
        type: 'Textbox', version: '6.0.0', text: quote || 'Sua frase aqui',
        left: Math.round((width - textWidth) / 2), top: textTop, width: textWidth,
        fontSize: fs, fontFamily: 'Playfair Display', fontWeight: 'bold',
        fill: '#2D4A5C', textAlign: 'center', lineHeight: 1.25, editable: true, name: 'bee-quote',
      },
      {
        type: 'Path', version: '6.0.0', path: createSpiralPath(lx, ly, layout.logoSize),
        left: lx - layout.logoSize, top: ly - layout.logoSize,
        fill: '', stroke: '#E8A04C', strokeWidth: Math.max(6, Math.round(layout.logoSize / 9)),
        strokeLineCap: 'round', strokeLineJoin: 'round', selectable: false, evented: false,
        hoverCursor: 'default', name: 'bee-spiral',
      },
    ],
  };
}
// ---- fim hidratacao ----

async function fetchDefaultKanbanColumn(userId: string): Promise<string | null> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/kanban_columns?user_id=eq.${userId}&order=position.asc&limit=1`, { headers: svc() });
  if (!res.ok) return null;
  const cols = await res.json();
  return cols[0]?.id ?? null;
}

async function createPost(input: {
  user_id: string;
  editorial_line_id: string;
  product_id: string | null;
  companion_post_id?: string | null;
  platform: string;
  title: string;
  briefing: string;
  carousel_text: any;
  carousel_fabric_json: any[];
  caption: string;
  metadata: any;
  kanban_column_id: string | null;
}): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/user_posts`, {
    method: 'POST',
    headers: svc({ Prefer: 'return=representation' }),
    body: JSON.stringify({
      user_id: input.user_id,
      editorial_line_id: input.editorial_line_id,
      product_id: input.product_id,
      companion_post_id: input.companion_post_id ?? null,
      platform: input.platform,
      format: 'image',
      status: 'idea',
      title: input.title,
      briefing: input.briefing,
      carousel_text: input.carousel_text,
      carousel_fabric_json: input.carousel_fabric_json,
      caption: input.caption,
      metadata: input.metadata,
      kanban_column_id: input.kanban_column_id,
    }),
  });
  if (!res.ok) throw new Error(`create post HTTP ${res.status}: ${await res.text()}`);
  const [row] = await res.json();
  return row.id;
}

async function logRun(input: {
  line_id: string;
  user_id: string;
  post_id: string | null;
  platform: string;
  editorial_slug: string;
  status: 'success' | 'failed' | 'skipped';
  error?: string;
  duration_ms: number;
}) {
  await fetch(`${SUPABASE_URL}/rest/v1/editorial_line_runs`, {
    method: 'POST',
    headers: svc({ Prefer: 'return=minimal' }),
    body: JSON.stringify({
      line_id: input.line_id,
      user_id: input.user_id,
      post_id: input.post_id,
      platform: input.platform,
      editorial_slug: input.editorial_slug,
      status: input.status,
      error_message: input.error,
      duration_ms: input.duration_ms,
      run_at: new Date().toISOString(),
    }),
  });
}

async function updateLineAfterRun(line: EditorialLine) {
  const newCursor = (line.rotation_cursor + 1) % Math.max(1, line.editorial_slugs.length);
  await fetch(`${SUPABASE_URL}/rest/v1/editorial_lines?id=eq.${line.id}`, {
    method: 'PATCH',
    headers: svc({ Prefer: 'return=minimal' }),
    body: JSON.stringify({
      last_run_at: new Date().toISOString(),
      rotation_cursor: newCursor,
      posts_generated_count: line.posts_generated_count + 1,
    }),
  });
}

async function processLine(line: EditorialLine) {
  const t0 = Date.now();
  const editorialSlug = line.editorial_slugs[line.rotation_cursor % line.editorial_slugs.length];
  const previousPosts = await fetchLastPosts(line.id, 5);
  const kanbanColId = await fetchDefaultKanbanColumn(line.user_id);

  // 1 chamada de IA pra gerar conteudo conceitual
  const content = await generateContentForLine(line, editorialSlug, previousPosts);
  const t1 = Date.now();

  const platforms = (line.platforms && line.platforms.length) ? line.platforms : ['linkedin'];
  let firstPostId: string | null = null;

  for (const platform of platforms) {
    try {
      const layout = platform === 'instagram' ? LAYOUT_SQUARE : LAYOUT_PORTRAIT;
      const fabricJson = hydrateBeeQuote(content.quote, layout);
      const postId = await createPost({
        user_id: line.user_id,
        editorial_line_id: line.id,
        product_id: line.product_id,
        companion_post_id: firstPostId,
        platform,
        title: `[${line.name}] ${content.quote.slice(0, 60)}`,
        briefing: line.briefing_base ?? '',
        carousel_text: {
          quote: content.quote,
          caption: content.caption,
          headline_type: content.headline_type_used,
          analogy: content.analogy_used,
          editorial_slug: editorialSlug,
        },
        carousel_fabric_json: [fabricJson],
        caption: content.caption,
        metadata: {
          canvas_size: platform === 'instagram' ? 'square' : 'portrait',
          editorial_slug: editorialSlug,
          target_avatar: line.target_avatar,
          editorial_line_id: line.id,
          campaign_phase: line.campaign_phase,
          auto_generated: true,
        },
        kanban_column_id: kanbanColId,
      });
      if (!firstPostId) firstPostId = postId;
      await logRun({
        line_id: line.id, user_id: line.user_id, post_id: postId, platform,
        editorial_slug: editorialSlug, status: 'success', duration_ms: Date.now() - t0,
      });
    } catch (e) {
      await logRun({
        line_id: line.id, user_id: line.user_id, post_id: null, platform,
        editorial_slug: editorialSlug, status: 'failed',
        error: String(e).slice(0, 400), duration_ms: Date.now() - t0,
      });
    }
  }

  await updateLineAfterRun(line);
  return { line_id: line.id, platforms: platforms.length, duration_ms: Date.now() - t0 };
}

Deno.serve(async (req: Request) => {
  const cors = preflight(req);
  if (cors) return cors;

  try {
    const lines = await fetchPendingLines();
    if (!lines.length) return jsonResponse({ success: true, processed: 0, message: 'sem linhas pendentes' });

    const results = [];
    let travadas = 0;
    // Cache por usuario: varias linhas do mesmo dono nao precisam de N chamadas.
    const portao = new Map<string, { open: boolean; why: string }>();

    for (const line of lines) {
      try {
        if (!portao.has(line.user_id)) {
          portao.set(line.user_id, await gateOpen(line.user_id));
        }
        const g = portao.get(line.user_id)!;
        if (!g.open) {
          travadas++;
          console.log(`[tick] linha ${line.id} pulada — campanha travada (${g.why})`);
          results.push({ line_id: line.id, skipped: 'campanha travada', gate: g.why });
          continue;
        }
        results.push(await processLine(line));
      } catch (e) {
        console.error('[tick] line failed', line.id, e);
        results.push({ line_id: line.id, error: String(e).slice(0, 200) });
      }
    }
    return jsonResponse({
      success: true,
      processed: lines.length - travadas,
      skipped_gated: travadas,
      results,
    });
  } catch (e) {
    return errorResponse('tick fatal', 500, String(e));
  }
});

export {};
