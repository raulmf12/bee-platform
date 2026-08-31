// Compositor da Hive — M04 (Convite / Jornada). Transforma interesse em movimento
// sem virar publicidade. 3 variações, seguindo o board M04:
//   A · Convite Essencial — foto + oferta clara + CTA (produto protagonista)
//   B · Ideia → Convite    — reflexão sobre a foto + card do evento + CTA
//   C · Jornada            — 3 etapas (MC → FLS → Clareira) + fechamento
//
// O CONTEÚDO do evento (nome, benefício, data, hora, formato, autor, CTA,
// etapas) é REAL e vem do usuário (EventBrief) — nunca inferido. A tela
// /hive/convite preenche isto. Playfair nos títulos, Inter no apoio, espiral
// como assinatura. "Presença que convida." Feed 1080x1350 (IG + LinkedIn).

import { layoutText } from '@/lib/templates/layout';
import type { M01Recipe, DesignLayer } from './composeM01';

const FONT_SERIF = 'Playfair Display';
const FONT_SANS = 'Inter, "Hanken Grotesk", sans-serif';
const SPIRAL_NATIVE = 1080;

export interface EventStep { n: string; nome: string; title: string; desc: string; focal?: boolean }
export interface EventBrief {
  kicker?: string;            // "MASTERCLASS"
  title: string;             // "Liderar uma oitava acima."
  highlight?: string;        // "oitava"
  subtitle?: string;         // "Uma nova consciência para liderar..."
  // B — reflexão que abre o convite
  idea?: string;             // "O mundo mudou. A forma de liderar, não."
  idea_highlight?: string;   // "não."
  idea_support?: string;     // desenvolvimento curto
  // dados objetivos (A/B)
  date?: string; location?: string; time?: string; format?: string; author?: string;
  cta?: string; vagas_limitadas?: boolean;
  // C — jornada
  steps?: EventStep[];
  closing_title?: string; closing_desc?: string;
}

export interface ComposeM04Input {
  recipe: M01Recipe;
  colors: Record<string, string>;
  spiralUrl: string;
  canvas: { w: number; h: number };
  event: EventBrief;
  asset?: { url: string; width?: number | null; height?: number | null } | null;
}

function resolveColor(colors: Record<string, string>, slug?: string, fallback = '#EFE8DB'): string {
  return (slug && colors[slug]) ? colors[slug] : fallback;
}
const num = (v: unknown, d = 0): number => (typeof v === 'number' && isFinite(v) ? v : d);

function highlightStyles(lines: string[], target: string, fill: string): Record<number, Record<number, object>> {
  const styles: Record<number, Record<number, object>> = {};
  const needle = (target ?? '').trim().toLowerCase();
  if (!needle) return styles;
  for (let li = 0; li < lines.length; li++) {
    const at = lines[li].toLowerCase().indexOf(needle);
    if (at === -1) continue;
    styles[li] = styles[li] ?? {};
    for (let c = at; c < at + needle.length; c++) styles[li][c] = { fill };
    break;
  }
  return styles;
}

export interface ComposedSlide { version: string; background: string; objects: object[] }

export function composeM04(input: ComposeM04Input): ComposedSlide {
  const { recipe, colors, spiralUrl, canvas, event, asset } = input;
  const W = canvas.w, H = canvas.h;
  const pctW = (p: number) => (p / 100) * W;
  const pctH = (p: number) => (p / 100) * H;
  const laranja = resolveColor(colors, 'laranja', '#E08A3C');
  const creme = resolveColor(colors, 'creme', '#EFE8DB');
  const azul = resolveColor(colors, 'azul_mp', '#1C2E4A');

  const layers = recipe.layer_stack as DesignLayer[];
  const bgLayer = layers.find((l) => l.role === 'background');
  const inviteLayer = layers.find((l) => l.role === 'invite');
  const kind = String((inviteLayer?.source as Record<string, unknown>)?.kind ?? '');
  const scaffold = ((inviteLayer?.source as Record<string, unknown>)?.data ?? {}) as Partial<EventBrief>;

  const objects: object[] = [];
  const bgToken = (bgLayer?.source as Record<string, unknown>)?.token as string | undefined;
  let background = bgToken ? resolveColor(colors, bgToken, creme) : azul;

  // ---- helpers de desenho ----
  const T = (o: Record<string, unknown>) => objects.push({ type: 'Textbox', version: '6.0.0', selectable: false, fontFamily: FONT_SANS, ...o });
  const gradientVeil = (fromOffset: number, strength: number) => objects.push({
    type: 'Rect', version: '6.0.0', left: 0, top: 0, width: W, height: H,
    fill: { type: 'linear', coords: { x1: 0, y1: 0, x2: 0, y2: H }, colorStops: [
      { offset: fromOffset, color: 'rgba(11,17,30,0)' },
      { offset: 1, color: `rgba(11,17,30,${strength})` },
    ] }, selectable: false, name: 'veil',
  });
  const button = (left: number, top: number, w: number, h: number, text: string, fill: string, fg: string) => {
    objects.push({ type: 'Rect', version: '6.0.0', left, top, width: w, height: h, rx: h / 2, ry: h / 2, fill, selectable: false, name: 'cta' });
    const fs = Math.round(h * 0.32);
    T({ text: text.toUpperCase(), left, top: top + h / 2 - fs * 0.62, width: w, fontSize: fs, fontWeight: '700', fill: fg, textAlign: 'center', charSpacing: 120, name: 'cta-label' });
  };
  const photoFull = () => {
    if (!asset?.url) return;
    const aw = asset.width ?? W, ah = asset.height ?? H;
    const scale = Math.max(W / aw, H / ah);
    objects.push({ type: 'Image', version: '6.0.0', src: asset.url, crossOrigin: 'anonymous',
      left: Math.round((W - aw * scale) / 2), top: Math.round((H - ah * scale) / 2),
      scaleX: scale, scaleY: scale, selectable: false, name: 'photo' });
  };
  const spiral = (cx: number, cy: number, wp: number) => {
    const s = pctW(wp), sc = s / SPIRAL_NATIVE;
    objects.push({ type: 'Image', version: '6.0.0', src: spiralUrl, crossOrigin: 'anonymous',
      left: Math.round(cx - s / 2), top: Math.round(cy - s / 2), scaleX: sc, scaleY: sc, name: 'bee-spiral',
      filters: [{ type: 'BlendColor', color: laranja, mode: 'tint', alpha: 1 }] });
  };
  const titleBlock = (text: string, hlWord: string | undefined, x: number, topPct: number, wPct: number, fill: string, maxLines: number, maxF: number) => {
    const boxW = pctW(wPct);
    const { fontSize, lines } = layoutText(text, {
      textWidth: Math.round(boxW), maxLines, maxFontSize: Math.round(W * maxF), minFontSize: Math.round(W * 0.038),
      fontFamily: FONT_SERIF, fontWeight: 'bold', balance: true, step: 3,
    });
    const th = lines.length * fontSize * 1.08;
    const top = pctH(topPct);
    const styles = hlWord ? highlightStyles(lines, hlWord, laranja) : {};
    T({ text: lines.join('\n'), left: x, top, width: boxW, fontSize, fontFamily: FONT_SERIF, fontWeight: 'bold', fill, textAlign: 'left', lineHeight: 1.08, name: 'headline', ...(Object.keys(styles).length ? { styles } : {}) });
    return { bottom: top + th, fontSize };
  };
  // linha de detalhe: rótulo forte + sub discreta
  const detail = (x: number, y: number, w: number, main: string, sub: string, inkMain: string, inkSub: string) => {
    const fs = Math.round(W * 0.02);
    objects.push({ type: 'Rect', version: '6.0.0', left: x, top: y + 2, width: Math.round(W * 0.01), height: Math.round(W * 0.01), fill: laranja, selectable: false });
    T({ text: main, left: x + Math.round(W * 0.022), top: y - 2, width: w, fontSize: fs, fontWeight: '700', fill: inkMain, textAlign: 'left', name: 'detail-main' });
    if (sub) T({ text: sub, left: x + Math.round(W * 0.022), top: y + fs, width: w, fontSize: Math.round(fs * 0.82), fontWeight: '400', fill: inkSub, textAlign: 'left', name: 'detail-sub' });
  };

  const ev: EventBrief = { ...scaffold, ...event } as EventBrief;
  const cta = ev.cta || String((recipe.limites as Record<string, unknown>)?.cta_default ?? 'SAIBA MAIS');
  const kicker = ev.kicker || 'MASTERCLASS';

  // =====================================================================
  if (kind === 'convite_essencial') {
    background = azul;
    photoFull();
    gradientVeil(0.32, 0.86);
    const x = pctW(8);
    // kicker
    T({ text: kicker.toUpperCase(), left: x, top: pctH(33), width: pctW(84), fontSize: Math.round(W * 0.021), fontWeight: '700', fill: laranja, charSpacing: 300, name: 'kicker' });
    // título
    const tb = titleBlock(ev.title, ev.highlight, x, 37, 82, creme, 3, 0.072);
    let y = tb.bottom + pctH(1.6);
    if (ev.subtitle) { T({ text: ev.subtitle, left: x, top: y, width: pctW(66), fontSize: Math.round(W * 0.023), fontWeight: '400', fill: creme, textAlign: 'left', lineHeight: 1.25, name: 'subtitle' }); y += pctH(6); }
    // detalhes (2 colunas)
    y += pctH(1);
    const col2 = pctW(52);
    if (ev.date || ev.location) detail(x, y, pctW(40), ev.date || '', ev.location || '', creme, 'rgba(239,232,219,0.7)');
    if (ev.time || ev.format) detail(col2, y, pctW(44), ev.time || '', ev.format || '', creme, 'rgba(239,232,219,0.7)');
    y += pctH(6.5);
    if (ev.author) { detail(x, y, pctW(60), ev.author, '', creme, 'rgba(239,232,219,0.7)'); y += pctH(5); }
    // CTA
    const btnW = pctW(52), btnH = pctH(4.6);
    button(x, pctH(76), btnW, btnH, cta, laranja, '#FFFFFF');
    if (ev.vagas_limitadas) T({ text: 'VAGAS LIMITADAS', left: x, top: pctH(82.5), width: pctW(50), fontSize: Math.round(W * 0.017), fontWeight: '600', fill: 'rgba(239,232,219,0.75)', charSpacing: 200, name: 'vagas' });
    spiral(pctW(90), pctH(93), 6);
  }

  // =====================================================================
  else if (kind === 'ideia_convite') {
    background = azul;
    photoFull();
    gradientVeil(0.0, 0.5);
    const x = pctW(8);
    // reflexão (topo)
    const ib = titleBlock(ev.idea || ev.title, ev.idea_highlight, x, 16, 80, creme, 3, 0.06);
    let y = ib.bottom + pctH(1.8);
    if (ev.idea_support) { T({ text: ev.idea_support, left: x, top: y, width: pctW(78), fontSize: Math.round(W * 0.022), fontWeight: '400', fill: creme, lineHeight: 1.3, textAlign: 'left', name: 'idea-support' }); }
    // card do evento (navy) na parte de baixo
    const cardX = pctW(6), cardY = pctH(60), cardW = pctW(88), cardH = pctH(20);
    objects.push({ type: 'Rect', version: '6.0.0', left: cardX, top: cardY, width: cardW, height: cardH, rx: 14, ry: 14, fill: 'rgba(11,17,30,0.92)', selectable: false, name: 'event-card' });
    T({ text: kicker.toUpperCase(), left: cardX + pctW(4), top: cardY + pctH(2.2), width: pctW(50), fontSize: Math.round(W * 0.019), fontWeight: '700', fill: laranja, charSpacing: 260, name: 'kicker' });
    const ctitle = titleBlock(ev.title, ev.highlight, cardX + pctW(4), 65.5, 50, creme, 2, 0.05);
    // mini detalhes à direita do card
    const dx = cardX + cardW - pctW(30);
    let dy = cardY + pctH(3);
    for (const d of [ev.date, ev.time, ev.format].filter(Boolean) as string[]) {
      T({ text: d, left: dx, top: dy, width: pctW(28), fontSize: Math.round(W * 0.018), fontWeight: '600', fill: creme, textAlign: 'left', name: 'mini' });
      dy += pctH(3.2);
    }
    void ctitle;
    // CTA abaixo do card
    button(cardX, cardY + cardH + pctH(2), pctW(52), pctH(4.4), cta, laranja, '#FFFFFF');
    spiral(pctW(90), pctH(93), 5.5);
  }

  // =====================================================================
  else if (kind === 'jornada') {
    background = creme;
    // título
    titleBlock(ev.title || 'Uma jornada para liderar além do óbvio.', ev.highlight, pctW(13), 20, 74, azul, 2, 0.056);
    // (centraliza o título)
    // recoloca como centralizado: sobrescreve o headline recém-criado
    const hIdx = objects.findIndex((o) => (o as { name?: string }).name === 'headline');
    if (hIdx >= 0) (objects[hIdx] as Record<string, unknown>).textAlign = 'center';

    const steps: EventStep[] = ev.steps && ev.steps.length ? ev.steps : (scaffold.steps as EventStep[] ?? []);
    const n = steps.length || 3;
    const cy = pctH(40);
    const r = pctW(4.6);
    const xs = steps.map((_, i) => pctW(50 - ((n - 1) / 2 - i) * 28));
    // conectores
    for (let i = 0; i < xs.length - 1; i++) {
      objects.push({ type: 'Path', version: '6.0.0', path: `M ${xs[i] + r} ${cy} L ${xs[i + 1] - r} ${cy}`, stroke: 'rgba(28,46,74,0.35)', strokeWidth: 2, fill: '', selectable: false });
    }
    steps.forEach((st, i) => {
      const fill = st.focal ? laranja : azul;
      objects.push({ type: 'Circle', version: '6.0.0', left: xs[i] - r, top: cy - r, radius: r, fill, selectable: false, name: 'node' });
      T({ text: st.n, left: xs[i] - r, top: cy - r * 0.5, width: r * 2, fontSize: Math.round(W * 0.032), fontWeight: '700', fill: creme, textAlign: 'center', name: 'node-n' });
      const cw = pctW(26), lx = xs[i] - cw / 2;
      let yy = cy + r + pctH(2.4);
      T({ text: st.nome.toUpperCase(), left: lx, top: yy, width: cw, fontSize: Math.round(W * 0.02), fontWeight: '700', fill: st.focal ? laranja : azul, textAlign: 'center', charSpacing: 120, name: 'step-nome' });
      yy += pctH(3.2);
      objects.push({ type: 'Textbox', version: '6.0.0', text: st.title, left: lx, top: yy, width: cw, fontSize: Math.round(W * 0.023), fontFamily: FONT_SERIF, fontWeight: 'bold', fill: azul, textAlign: 'center', lineHeight: 1.08, selectable: false, name: 'step-title' });
      yy += pctH(5.5);
      T({ text: st.desc, left: lx, top: yy, width: cw, fontSize: Math.round(W * 0.017), fontWeight: '400', fill: 'rgba(28,46,74,0.62)', textAlign: 'center', lineHeight: 1.25, name: 'step-desc' });
    });
    // fechamento
    const closeT = ev.closing_title || scaffold.closing_title;
    if (closeT) {
      const cardX = pctW(8), cardY = pctH(76), cardW = pctW(84), cardH = pctH(11);
      objects.push({ type: 'Rect', version: '6.0.0', left: cardX, top: cardY, width: cardW, height: cardH, rx: 12, ry: 12, fill: 'rgba(28,46,74,0.06)', selectable: false, name: 'closing-card' });
      T({ text: closeT, left: cardX + pctW(4), top: cardY + pctH(2.4), width: cardW - pctW(8), fontSize: Math.round(W * 0.024), fontWeight: '700', fill: azul, textAlign: 'left', name: 'closing-title' });
      const cd = ev.closing_desc || scaffold.closing_desc;
      if (cd) T({ text: cd, left: cardX + pctW(4), top: cardY + pctH(5.8), width: cardW - pctW(8), fontSize: Math.round(W * 0.018), fontWeight: '400', fill: 'rgba(28,46,74,0.62)', textAlign: 'left', lineHeight: 1.25, name: 'closing-desc' });
    }
    spiral(W / 2, pctH(91), 4.4);
    T({ text: 'MARCOS PICCINI', left: pctW(25), top: pctH(94), width: pctW(50), fontSize: Math.round(W * 0.015), fontWeight: '600', fill: azul, textAlign: 'center', charSpacing: 360, name: 'signature' });
  }

  return { version: '6.0.0', background, objects };
}
