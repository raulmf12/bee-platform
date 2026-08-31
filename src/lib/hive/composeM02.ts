// Compositor da Hive — M02 (Rosto + Pensamento). Segue a prancha oficial:
//   - foto real do Marcos (ou, no fallback honesto, gerada) como matéria;
//   - pensamento autoral em serifada, com a VIRADA em laranja itálico;
//   - frase secundária curta (opcional) precedida de um tique laranja;
//   - assinatura universal: espiral laranja + "MARCOS PICCINI" no rodapé central;
//   - variação D (Diário): o texto vira um registro em cartão de papel creme.
// O texto se posiciona pelo ESPAÇO NEGATIVO da foto (tag espaco_texto) e a cor
// segue a luz da foto (tag texto_cor: claro|escuro). A foto NÃO ilustra o texto:
// foto e pensamento formam UMA mensagem.
//
// NÃO altera o texto (EDITORIAL_LOCKED). Canvas v1 = feed 1080x1350 (IG + LinkedIn).

import { layoutText } from '@/lib/templates/layout';
import type { M01Recipe, DesignLayer } from './composeM01';

const SPIRAL_NATIVE = 1080;
const FONT_SERIF = 'Playfair Display';
const FONT_SANS = 'Hanken Grotesk, sans-serif';
const LINE_HEIGHT = 1.08;

export interface M02Asset {
  url: string;
  width?: number | null;
  height?: number | null;
  espaco_texto?: string | null;   // esquerda | centro | baixo | direita | topo
  texto_cor?: string | null;      // claro (texto creme) | escuro (texto azul)
  origin?: string;
}

export interface ComposeM02Input {
  recipe: M01Recipe;
  colors: Record<string, string>;
  spiralUrl: string;
  text: string;                      // pensamento autoral (travado)
  subtitle?: string | null;          // frase secundária opcional (eco aforístico)
  highlight?: { target: string } | null;
  canvas: { w: number; h: number };
  asset?: M02Asset | null;
}

interface Zone { x: number; w: number; cy: number; align: string }

function resolveColor(colors: Record<string, string>, slug?: string, fallback = '#EFE8DB'): string {
  if (!slug) return fallback;
  if (colors[slug]) return colors[slug];
  if (slug.includes('_ou_')) return colors[slug.split('_ou_')[0]] ?? fallback;
  return fallback;
}
const num = (v: unknown, d = 0): number => (typeof v === 'number' && isFinite(v) ? v : d);

// Estilos por char do trecho de destaque: laranja (a "virada"). Sem itálico —
// o faux-italic (só temos Playfair bold no render) inclina a última letra e
// engole o espaço seguinte quando o destaque está no MEIO da linha ("liberdadeno").
function highlightStyles(lines: string[], target: string, fill: string): Record<number, Record<number, object>> {
  const styles: Record<number, Record<number, object>> = {};
  const needle = target.trim().toLowerCase();
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

// Véu de legibilidade direcional. claro => escurece (texto creme);
// escuro => clareia de leve (texto azul sobre área clara, ex.: céu do Campo).
function overlay(zoneKey: string, W: number, H: number, strength: number, mode: 'dark' | 'light', creme: string): object {
  const rgb = mode === 'dark' ? '11,17,30' : hexToRgb(creme);
  const c = (a: number) => `rgba(${rgb},${(a * strength).toFixed(3)})`;
  const zero = `rgba(${rgb},0)`;
  let coords = { x1: 0, y1: 0, x2: 0, y2: H };
  let stops = [{ offset: 0.4, color: zero }, { offset: 1, color: c(0.82) }];
  switch (zoneKey) {
    case 'topo':
      stops = [{ offset: 0, color: c(0.82) }, { offset: 0.6, color: zero }]; break;
    case 'esquerda':
      coords = { x1: 0, y1: 0, x2: W, y2: 0 };
      stops = [{ offset: 0, color: c(0.85) }, { offset: 0.62, color: zero }]; break;
    case 'direita':
      coords = { x1: 0, y1: 0, x2: W, y2: 0 };
      stops = [{ offset: 0.38, color: zero }, { offset: 1, color: c(0.85) }]; break;
    case 'centro':
      stops = [{ offset: 0, color: c(0.4) }, { offset: 0.5, color: c(0.55) }, { offset: 1, color: c(0.4) }]; break;
    case 'baixo':
    default: break;
  }
  return {
    type: 'Rect', version: '6.0.0', left: 0, top: 0, width: W, height: H,
    fill: { type: 'linear', coords, colorStops: stops }, selectable: false, name: 'overlay',
  };
}
function hexToRgb(hex: string): string {
  const m = hex.replace('#', '');
  const n = m.length === 3 ? m.split('').map((x) => x + x).join('') : m;
  const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16);
  return `${isFinite(r) ? r : 239},${isFinite(g) ? g : 232},${isFinite(b) ? b : 219}`;
}

export interface ComposedSlide { version: string; background: string; objects: object[] }

export function composeM02(input: ComposeM02Input): ComposedSlide {
  const { recipe, colors, spiralUrl, text, subtitle, highlight, canvas, asset } = input;
  const W = canvas.w, H = canvas.h;
  const pctW = (p: unknown) => (num(p) / 100) * W;
  const pctH = (p: unknown) => (num(p) / 100) * H;
  const laranja = resolveColor(colors, 'laranja', '#E08A3C');
  const creme = resolveColor(colors, 'creme', '#EFE8DB');
  const azul = resolveColor(colors, 'azul_mp', '#1C2E4A');

  const objects: object[] = [];
  const background = azul; // placeholder navy enquanto não há foto (prévia)

  const headlineLayer = recipe.layer_stack.find((l) => l.role === 'headline');
  const hg = (headlineLayer?.geometry ?? {}) as Record<string, unknown>;
  const zones = (hg.zones ?? {}) as Record<string, Zone>;
  const defaultZone = String(hg.default_zone ?? 'baixo');
  const zoneKey = (asset?.espaco_texto && zones[asset.espaco_texto]) ? asset.espaco_texto : defaultZone;
  const zone: Zone = zones[zoneKey] ?? { x: 8, w: 84, cy: 80, align: 'left' };

  const isDark = String(asset?.texto_cor ?? 'claro') === 'escuro';
  const textFill = isDark ? azul : creme;
  const isDiary = recipe.id === 'M02-D';

  // 1) Foto full-bleed.
  const photoLayer = recipe.layer_stack.find((l) => l.role === 'photo');
  if (photoLayer && asset?.url) {
    const aw = asset.width ?? W, ah = asset.height ?? H;
    const scale = Math.max(W / aw, H / ah);
    objects.push({
      type: 'Image', version: '6.0.0', src: asset.url, crossOrigin: 'anonymous',
      left: Math.round((W - aw * scale) / 2), top: Math.round((H - ah * scale) / 2),
      scaleX: scale, scaleY: scale, selectable: false, name: 'photo',
    });
  }

  // 2) Véu de legibilidade (o Diário evita véu — o texto vive no cartão).
  const ovLayer = recipe.layer_stack.find((l) => l.role === 'readability_overlay');
  if (ovLayer && !isDiary) {
    const strength = Math.max(0.2, Math.min(1, num((ovLayer.geometry as Record<string, unknown>)?.strength, 0.7)));
    objects.push(overlay(zoneKey, W, H, strength, isDark ? 'light' : 'dark', creme));
  }

  if (isDiary) {
    // 3D) DIÁRIO — o pensamento como registro num cartão de papel creme.
    const pad = pctW(3.4);
    const cardX = pctW(6), cardW = pctW(60);
    const kickerFs = Math.round(W * 0.015);
    const { fontSize, lines } = layoutText(text, {
      textWidth: Math.round(cardW - 2 * pad), maxLines: 5,
      maxFontSize: Math.round(W * 0.036), minFontSize: Math.round(W * 0.026),
      fontFamily: FONT_SERIF, fontWeight: 'normal', balance: true, step: 2,
    });
    const textH = lines.length * fontSize * 1.16;
    const cardH = pad * 2 + kickerFs + pctH(1.4) + textH;
    const cardTop = Math.round(pctH(80) - cardH);
    objects.push({
      type: 'Rect', version: '6.0.0', left: Math.round(cardX), top: cardTop,
      width: Math.round(cardW), height: Math.round(cardH), rx: 6, ry: 6,
      fill: creme, opacity: 0.97, selectable: false, name: 'diary-card',
      shadow: 'rgba(0,0,0,0.35) 0px 8px 26px',
    });
    objects.push({
      type: 'Textbox', version: '6.0.0', text: 'DIÁRIO',
      left: Math.round(cardX + pad), top: Math.round(cardTop + pad),
      width: Math.round(cardW - 2 * pad), fontSize: kickerFs, fontFamily: FONT_SANS,
      fontWeight: '700', fill: laranja, charSpacing: 300, name: 'diary-kicker', selectable: false,
    });
    objects.push({
      type: 'Textbox', version: '6.0.0', text: lines.join('\n'),
      left: Math.round(cardX + pad), top: Math.round(cardTop + pad + kickerFs + pctH(1.4)),
      width: Math.round(cardW - 2 * pad), fontSize, fontFamily: FONT_SERIF, fontWeight: 'normal',
      fontStyle: 'italic', fill: azul, textAlign: 'left', lineHeight: 1.16,
      editable: true, name: 'headline',
    });
  } else {
    // 3) Pensamento autoral em serifada (com a virada em laranja itálico).
    const boxW = Math.round(pctW(zone.w));
    const align = String(zone.align ?? 'left');
    const { fontSize, lines } = layoutText(text, {
      textWidth: boxW, maxLines: num(recipe.limites?.max_linhas, 5),
      maxFontSize: Math.round(W * 0.078), minFontSize: Math.round(W * 0.04),
      fontFamily: FONT_SERIF, fontWeight: 'bold', balance: true, step: 3,
    });
    if (lines.length > 1 && /^[.,;:!?"')\]…]+$/.test(lines[lines.length - 1].trim())) {
      lines[lines.length - 2] = lines[lines.length - 2] + lines[lines.length - 1];
      lines.pop();
    }
    const textHeight = lines.length * fontSize * LINE_HEIGHT;
    const left = align === 'center' ? Math.round((W - boxW) / 2) : Math.round(pctW(zone.x));
    // Altura do bloco secundário (tique + frase), pra reservar espaço.
    const hasSub = Boolean(subtitle && subtitle.trim());
    const subFs = Math.round(W * 0.021);
    const tickGap = pctH(2.4);
    const subH = hasSub ? tickGap + pctH(1.6) + subFs * 1.25 * 2 : 0;
    const totalH = textHeight + subH;
    // Na zona "baixo" o bloco é ancorado pelo RODAPÉ, logo acima da assinatura
    // (evita o texto colidir com a espiral/nome). Nas outras, centra na zona.
    const top = zoneKey === 'baixo'
      ? Math.round(pctH(82) - totalH)
      : Math.round(pctH(zone.cy) - textHeight / 2);
    const styles = highlight?.target ? highlightStyles(lines, highlight.target, laranja) : {};
    objects.push({
      type: 'Textbox', version: '6.0.0', text: lines.join('\n'),
      left, top, width: boxW, fontSize, fontFamily: FONT_SERIF, fontWeight: 'bold',
      fill: textFill, textAlign: align, lineHeight: LINE_HEIGHT,
      shadow: isDark ? undefined : 'rgba(0,0,0,0.35) 0px 2px 12px',
      editable: true, name: 'headline',
      ...(Object.keys(styles).length ? { styles } : {}),
    });

    // 4) Frase secundária (opcional): tique laranja + linha sans discreta.
    if (hasSub) {
      const tickY = top + textHeight + tickGap;
      objects.push({
        type: 'Rect', version: '6.0.0', left, top: Math.round(tickY),
        width: Math.round(pctW(4)), height: 3, fill: laranja, selectable: false, name: 'tick',
      });
      objects.push({
        type: 'Textbox', version: '6.0.0', text: subtitle!.trim(),
        left, top: Math.round(tickY + pctH(1.6)), width: boxW,
        fontSize: subFs, fontFamily: FONT_SANS, fontWeight: '400',
        fill: isDark ? azul : creme, textAlign: align, lineHeight: 1.25,
        opacity: 0.92, selectable: false, name: 'subtitle',
        shadow: isDark ? undefined : 'rgba(0,0,0,0.3) 0px 1px 8px',
      });
    }
  }

  // 5) Assinatura universal: espiral laranja + MARCOS PICCINI no rodapé central,
  //    bem abaixo do bloco de texto (que termina em ~82%).
  const sigSpiral = pctW(4);
  const sigScale = sigSpiral / SPIRAL_NATIVE;
  objects.push({
    type: 'Image', version: '6.0.0', src: spiralUrl, crossOrigin: 'anonymous',
    left: Math.round(W / 2 - sigSpiral / 2), top: Math.round(pctH(89) - sigSpiral / 2),
    scaleX: sigScale, scaleY: sigScale, name: 'bee-spiral',
    filters: [{ type: 'BlendColor', color: laranja, mode: 'tint', alpha: 1 }],
  });
  const nameFs = Math.round(W * 0.014);
  objects.push({
    type: 'Textbox', version: '6.0.0', text: 'MARCOS PICCINI',
    left: Math.round(W * 0.25), top: Math.round(pctH(93.5) - nameFs / 2), width: Math.round(W * 0.5),
    fontSize: nameFs, fontFamily: FONT_SANS, fontWeight: '600',
    fill: creme, textAlign: 'center', charSpacing: 360,
    name: 'signature', selectable: false, shadow: 'rgba(0,0,0,0.45) 0px 1px 6px',
  });

  return { version: '6.0.0', background, objects };
}
