// Compositor da Hive — M02 (Rosto + Pensamento). Segue a PRANCHA OFICIAL:
//   - foto real do Marcos como matéria (full-bleed), deslocada pra abrir o
//     ESPAÇO NEGATIVO onde o texto vai viver (a foto não ilustra o texto —
//     foto e pensamento formam UMA mensagem);
//   - um painel escuro direcional (véu) cria a área de leitura com respiro;
//   - pensamento autoral em serifada editorial, alinhado à esquerda, com a
//     VIRADA em laranja;
//   - frase secundária curta (opcional) precedida de um tique laranja;
//   - assinatura universal: espiral laranja + "MARCOS PICCINI" no rodapé central;
//   - variação D (Diário): o texto vira registro num cartão de papel creme.
// A posição vem da tag espaco_texto da foto; a cor do texto, da tag texto_cor
// (claro=creme | escuro=azul). NÃO altera o texto. Canvas v1 = feed 1080x1350.

import { layoutText } from '@/lib/templates/layout';
import type { M01Recipe } from './composeM01';

const SPIRAL_NATIVE = 1080;
const FONT_SERIF = 'Playfair Display';
const FONT_SANS = 'Hanken Grotesk, sans-serif';
const LINE_HEIGHT = 1.14;

export interface M02Asset {
  url: string;
  width?: number | null;
  height?: number | null;
  espaco_texto?: string | null;   // esquerda | centro | baixo | direita | topo
  texto_cor?: string | null;      // claro (texto creme) | escuro (texto azul)
  origin?: string;
  preComposed?: boolean;          // cena já veio com espaço negativo (IA) -> sem zoom/push, véu leve
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

function resolveColor(colors: Record<string, string>, slug?: string, fallback = '#EFE8DB'): string {
  if (!slug) return fallback;
  if (colors[slug]) return colors[slug];
  if (slug.includes('_ou_')) return colors[slug.split('_ou_')[0]] ?? fallback;
  return fallback;
}
const num = (v: unknown, d = 0): number => (typeof v === 'number' && isFinite(v) ? v : d);

function hexToRgb(hex: string): string {
  const m = hex.replace('#', '');
  const n = m.length === 3 ? m.split('').map((x) => x + x).join('') : m;
  const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16);
  return `${isFinite(r) ? r : 11},${isFinite(g) ? g : 17},${isFinite(b) ? b : 30}`;
}

// Índices de char do trecho de destaque -> laranja (a "virada"). 1 ocorrência.
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

// Zona de texto (em % do canvas) por espaco_texto. Painéis laterais são
// estreitos (respiro editorial); topo/baixo ocupam a largura com margem.
type Placement = 'esquerda' | 'direita' | 'topo' | 'baixo' | 'centro';
interface Zone { x: number; w: number; align: 'left' | 'center'; vAnchor: 'top' | 'middle' | 'bottom'; vRef: number }
const ZONES: Record<Placement, Zone> = {
  esquerda: { x: 8,  w: 46, align: 'left',   vAnchor: 'middle', vRef: 46 },
  direita:  { x: 46, w: 46, align: 'left',   vAnchor: 'middle', vRef: 46 },
  topo:     { x: 8,  w: 68, align: 'left',   vAnchor: 'top',    vRef: 11 },
  baixo:    { x: 8,  w: 62, align: 'left',   vAnchor: 'bottom', vRef: 80 },
  centro:   { x: 12, w: 76, align: 'center', vAnchor: 'middle', vRef: 46 },
};

export interface ComposedSlide { version: string; background: string; objects: object[] }

export function composeM02(input: ComposeM02Input): ComposedSlide {
  const { recipe, colors, spiralUrl, text, subtitle, highlight, canvas, asset } = input;
  const W = canvas.w, H = canvas.h;
  const pctW = (p: number) => (p / 100) * W;
  const pctH = (p: number) => (p / 100) * H;
  const laranja = resolveColor(colors, 'laranja', '#E08A3C');
  const creme = resolveColor(colors, 'creme', '#EFE8DB');
  const azul = resolveColor(colors, 'azul_mp', '#1C2E4A');
  const darkRgb = hexToRgb(azul); // painel escuro na cor da marca

  const objects: object[] = [];
  const background = azul;

  const place = (['esquerda', 'direita', 'topo', 'baixo', 'centro'] as Placement[])
    .includes(asset?.espaco_texto as Placement) ? (asset!.espaco_texto as Placement) : 'baixo';
  const zone = ZONES[place];
  const isDark = String(asset?.texto_cor ?? 'claro') === 'escuro';
  const textFill = isDark ? azul : creme;
  const isDiary = recipe.id === 'M02-D';

  // 1) FOTO full-bleed. Como foto e canvas são 4:5, o "cover" encaixa exato.
  //    Um leve ZOOM (>cover) cria folga pra EMPURRAR o sujeito pro lado oposto
  //    ao texto e abrir espaço negativo — mas SEM estourar o rosto. O headshot
  //    do Marcos já é fechado; zoom forte fazia a cara ficar gigante. Então
  //    zoom mínimo + o painel (véu) escurece o lado do texto pra dar leitura,
  //    aceitando que o sujeito fique parcialmente atrás do texto.
  const pre = Boolean(asset?.preComposed); // cena da IA já tem espaço negativo
  const ZOOM: Record<Placement, number> = pre
    ? { esquerda: 1, direita: 1, topo: 1, baixo: 1, centro: 1 }
    : { esquerda: 1.12, direita: 1.12, topo: 1.04, baixo: 1.04, centro: 1.0 };
  const PUSH: Record<Placement, number> = pre
    ? { esquerda: 0, direita: 0, topo: 0, baixo: 0, centro: 0 }
    : { esquerda: 1.0, direita: 1.0, topo: 0.6, baixo: 0.6, centro: 0 };
  const photoLayer = recipe.layer_stack.find((l) => l.role === 'photo');
  if (photoLayer && asset?.url) {
    const aw = asset.width ?? W, ah = asset.height ?? H;
    const scale = Math.max(W / aw, H / ah) * ZOOM[place];
    const dw = aw * scale, dh = ah * scale;
    const slackX = (dw - W) / 2, slackY = (dh - H) / 2;
    const push = PUSH[place];
    let bx = 0, by = 0;
    if (place === 'esquerda') bx = slackX * push;        // sujeito -> direita
    else if (place === 'direita') bx = -slackX * push;   // sujeito -> esquerda
    else if (place === 'topo') by = slackY * push;       // sujeito -> baixo
    else if (place === 'baixo') by = -slackY * push;     // sujeito -> cima
    objects.push({
      type: 'Image', version: '6.0.0', src: asset.url, crossOrigin: 'anonymous',
      left: Math.round((W - dw) / 2 + bx), top: Math.round((H - dh) / 2 + by),
      scaleX: scale, scaleY: scale, selectable: false, name: 'photo',
    });
  }

  // 2) PAINEL de leitura (véu direcional). Diário não usa (texto vive no cartão).
  if (!isDiary) {
    const k = pre ? 0.5 : 1; // cena da IA já tem contraste -> véu mais leve
    const c = (a: number) => `rgba(${isDark ? hexToRgb(creme) : darkRgb},${(a * k).toFixed(3)})`;
    const zero = `rgba(${isDark ? hexToRgb(creme) : darkRgb},0)`;
    // Painel forte na FAIXA do texto (quase sólido) fundindo pra transparente
    // sobre o rosto — o texto ganha um painel editorial, não fica solto na cara.
    let coords = { x1: 0, y1: 0, x2: 0, y2: H };
    let stops = [{ offset: 0.34, color: zero }, { offset: 0.6, color: c(0.72) }, { offset: 1, color: c(0.97) }];
    if (place === 'esquerda') {
      coords = { x1: 0, y1: 0, x2: W, y2: 0 };
      stops = [{ offset: 0, color: c(0.97) }, { offset: 0.42, color: c(0.86) }, { offset: 0.68, color: zero }];
    } else if (place === 'direita') {
      coords = { x1: 0, y1: 0, x2: W, y2: 0 };
      stops = [{ offset: 0.32, color: zero }, { offset: 0.58, color: c(0.86) }, { offset: 1, color: c(0.97) }];
    } else if (place === 'topo') {
      stops = [{ offset: 0, color: c(0.97) }, { offset: 0.4, color: c(0.72) }, { offset: 0.66, color: zero }];
    } else if (place === 'centro') {
      stops = [{ offset: 0, color: c(0.6) }, { offset: 0.5, color: c(0.78) }, { offset: 1, color: c(0.6) }];
    }
    objects.push({
      type: 'Rect', version: '6.0.0', left: 0, top: 0, width: W, height: H,
      fill: { type: 'linear', coords, colorStops: stops }, selectable: false, name: 'overlay',
    });
    // Rodapé sempre escurecido de leve, pra assinatura respirar.
    objects.push({
      type: 'Rect', version: '6.0.0', left: 0, top: Math.round(pctH(84)), width: W, height: Math.round(pctH(16)),
      fill: { type: 'linear', coords: { x1: 0, y1: 0, x2: 0, y2: pctH(16) },
        colorStops: [{ offset: 0, color: `rgba(${darkRgb},0)` }, { offset: 1, color: `rgba(${darkRgb},0.75)` }] },
      selectable: false, name: 'footer-scrim',
    });
  }

  if (isDiary) {
    // DIÁRIO — pensamento como registro num cartão de papel creme.
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
    const cardTop = Math.round(pctH(78) - cardH);
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
    // PENSAMENTO em serifada editorial (com a virada em laranja).
    const boxW = Math.round(pctW(zone.w));
    // Mede num width um pouco MENOR que a caixa real: o layoutText e o Fabric
    // usam métricas de fonte diferentes; medir folgado evita o Fabric RE-quebrar
    // uma linha (o que estourava a altura e fazia o subtítulo colidir com a frase).
    const measureW = Math.round(boxW * 0.94);
    const { fontSize, lines } = layoutText(text, {
      textWidth: measureW, maxLines: Math.min(5, num(recipe.limites?.max_linhas, 5)),
      maxFontSize: Math.round(W * 0.066), minFontSize: Math.round(W * 0.038),
      fontFamily: FONT_SERIF, fontWeight: 'bold', balance: true, step: 2,
    });
    if (lines.length > 1 && /^[.,;:!?"')\]…]+$/.test(lines[lines.length - 1].trim())) {
      lines[lines.length - 2] = lines[lines.length - 2] + lines[lines.length - 1];
      lines.pop();
    }
    const textHeight = lines.length * fontSize * LINE_HEIGHT;
    const left = zone.align === 'center' ? Math.round((W - boxW) / 2) : Math.round(pctW(zone.x));

    // Bloco secundário: tique laranja + frase sans (reserva de altura). Só entra
    // quando a frase principal é curta o bastante — com 5 linhas não há respiro
    // e o subtítulo colava na frase (o "texto desconcertado").
    const hasSub = Boolean(subtitle && subtitle.trim()) && lines.length <= 4;
    const subFs = Math.round(W * 0.02);
    const tickGap = pctH(2.6);
    const subH = hasSub ? tickGap + pctH(1.4) + subFs * 1.3 * 2 : 0;
    const totalH = textHeight + subH;

    let top: number;
    if (zone.vAnchor === 'bottom') top = Math.round(pctH(zone.vRef) - totalH);
    else if (zone.vAnchor === 'top') top = Math.round(pctH(zone.vRef));
    else top = Math.round(pctH(zone.vRef) - totalH / 2);

    const styles = highlight?.target ? highlightStyles(lines, highlight.target, laranja) : {};
    objects.push({
      type: 'Textbox', version: '6.0.0', text: lines.join('\n'),
      left, top, width: boxW, fontSize, fontFamily: FONT_SERIF, fontWeight: 'bold',
      fill: textFill, textAlign: zone.align, lineHeight: LINE_HEIGHT,
      editable: true, name: 'headline',
      ...(Object.keys(styles).length ? { styles } : {}),
    });

    if (hasSub) {
      const tickY = top + textHeight + tickGap;
      objects.push({
        type: 'Rect', version: '6.0.0', left, top: Math.round(tickY),
        width: Math.round(pctW(4.5)), height: 3, fill: laranja, selectable: false, name: 'tick',
      });
      objects.push({
        type: 'Textbox', version: '6.0.0', text: subtitle!.trim(),
        left, top: Math.round(tickY + pctH(1.4)), width: boxW,
        fontSize: subFs, fontFamily: FONT_SANS, fontWeight: '400',
        fill: isDark ? azul : creme, textAlign: zone.align, lineHeight: 1.3,
        opacity: 0.9, selectable: false, name: 'subtitle',
      });
    }
  }

  // ASSINATURA universal: espiral laranja + MARCOS PICCINI no rodapé central.
  const sigSpiral = pctW(4.4);
  const sigScale = sigSpiral / SPIRAL_NATIVE;
  objects.push({
    type: 'Image', version: '6.0.0', src: spiralUrl, crossOrigin: 'anonymous',
    left: Math.round(W / 2 - sigSpiral / 2), top: Math.round(pctH(90) - sigSpiral / 2),
    scaleX: sigScale, scaleY: sigScale, name: 'bee-spiral',
    filters: [{ type: 'BlendColor', color: laranja, mode: 'tint', alpha: 1 }],
  });
  const nameFs = Math.round(W * 0.0135);
  objects.push({
    type: 'Textbox', version: '6.0.0', text: 'MARCOS PICCINI',
    left: Math.round(W * 0.2), top: Math.round(pctH(94) - nameFs / 2), width: Math.round(W * 0.6),
    fontSize: nameFs, fontFamily: FONT_SANS, fontWeight: '600',
    fill: creme, textAlign: 'center', charSpacing: 360, name: 'signature', selectable: false,
  });

  return { version: '6.0.0', background, objects };
}
