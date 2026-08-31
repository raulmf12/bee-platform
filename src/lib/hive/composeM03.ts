// Compositor da Hive — M03 (Conceito / Lente). Diagramas geométricos que tornam
// visível uma ESTRUTURA necessária pra compreender a ideia (não decoram).
// 4 variações, seguindo o board M03:
//   A · Relação   — 2 polos + causalidade circular (arcos recíprocos)
//   B · Camadas   — círculos concêntricos (visível → essência) sobre navy
//   C · Movimento — 3 estados + conectores (quebra → transição → integração)
//   D · Mapa      — hexágono das 6 Dimensões Sistêmicas + espiral no centro
//
// Vocabulário: ponto, linha, círculo, plano, camadas, conectores, números,
// tipografia, espaço negativo, espiral. Playfair nos títulos, Inter no apoio.
// Conteúdo estrutural vem do DADO curável (design_variacoes.layer_stack); só os
// polos do A podem ser extraídos do texto pelo motor. "Silêncio visual."
//
// NÃO altera o texto (EDITORIAL_LOCKED). Feed 1080x1350 (IG + LinkedIn).

import { layoutText } from '@/lib/templates/layout';
import type { M01Recipe, DesignLayer } from './composeM01';

const FONT_SERIF = 'Playfair Display';
const FONT_SANS = 'Inter, "Hanken Grotesk", sans-serif';
const SPIRAL_NATIVE = 1080;

export interface ComposeM03Input {
  recipe: M01Recipe;
  colors: Record<string, string>;
  spiralUrl: string;
  text: string;
  highlight?: { target: string } | null;
  canvas: { w: number; h: number };
  diagram?: { poleA?: string; poleB?: string } | null;
}

interface DiagramData {
  poleA?: string; poleB?: string; support?: string;
  layers?: Array<{ nome: string; desc: string }>;
  states?: Array<{ n: string; nome: string; desc: string; cor: string }>;
  nodes?: Array<{ nome: string; desc: string; angle: number }>;
  center?: string;
}

function resolveColor(colors: Record<string, string>, slug?: string, fallback = '#EFE8DB'): string {
  if (!slug) return fallback;
  return colors[slug] ?? fallback;
}
const num = (v: unknown, d = 0): number => (typeof v === 'number' && isFinite(v) ? v : d);

// --- Primitivas em Path absoluto (confiáveis no loadFromJSON do Fabric) ---
function line(x1: number, y1: number, x2: number, y2: number, color: string, w = 2, dashed = false): object {
  return {
    type: 'Path', version: '6.0.0', path: `M ${x1} ${y1} L ${x2} ${y2}`,
    stroke: color, strokeWidth: w, fill: '', selectable: false,
    ...(dashed ? { strokeDashArray: [4, 6] } : {}),
  };
}
function quad(sx: number, sy: number, cx: number, cy: number, ex: number, ey: number, color: string, w = 3): object {
  return {
    type: 'Path', version: '6.0.0', path: `M ${sx} ${sy} Q ${cx} ${cy} ${ex} ${ey}`,
    stroke: color, strokeWidth: w, fill: '', selectable: false,
  };
}
function arrowHead(x: number, y: number, ang: number, size: number, color: string): object {
  const a1 = ang - 0.45, a2 = ang + 0.45;
  const p1x = x - size * Math.cos(a1), p1y = y - size * Math.sin(a1);
  const p2x = x - size * Math.cos(a2), p2y = y - size * Math.sin(a2);
  return {
    type: 'Path', version: '6.0.0',
    path: `M ${x} ${y} L ${p1x} ${p1y} L ${p2x} ${p2y} Z`,
    fill: color, stroke: '', selectable: false,
  };
}
function circle(cx: number, cy: number, r: number, fill: string, stroke = '', sw = 0, opacity = 1): object {
  return {
    type: 'Circle', version: '6.0.0', left: cx - r, top: cy - r, radius: r,
    fill, stroke, strokeWidth: sw, opacity, selectable: false,
  };
}
function label(text: string, left: number, top: number, w: number, fs: number, fill: string, align: string, weight = '400'): object {
  return {
    type: 'Textbox', version: '6.0.0', text, left, top, width: w,
    fontSize: fs, fontFamily: FONT_SANS, fontWeight: weight, fill, textAlign: align,
    lineHeight: 1.2, selectable: false,
  };
}
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

export interface ComposedSlide { version: string; background: string; objects: object[] }

export function composeM03(input: ComposeM03Input): ComposedSlide {
  const { recipe, colors, spiralUrl, text, highlight, canvas, diagram } = input;
  const W = canvas.w, H = canvas.h;
  const pctW = (p: unknown) => (num(p) / 100) * W;
  const pctH = (p: unknown) => (num(p) / 100) * H;
  const laranja = resolveColor(colors, 'laranja', '#E08A3C');
  const creme = resolveColor(colors, 'creme', '#EFE8DB');
  const azul = resolveColor(colors, 'azul_mp', '#1C2E4A');
  const cinza = resolveColor(colors, 'neutro_linha', '#B8BCC2');

  const layers = recipe.layer_stack as DesignLayer[];
  const bgLayer = layers.find((l) => l.role === 'background');
  const background = resolveColor(colors, (bgLayer?.source as Record<string, unknown>)?.token as string | undefined, creme);
  const onDark = background.toLowerCase() === azul.toLowerCase();
  const inkTitle = onDark ? creme : azul;
  const inkBody = onDark ? cinza : azul;
  const mutedBody = onDark ? 'rgba(239,232,219,0.7)' : 'rgba(28,46,74,0.62)';

  const objects: object[] = [];

  // --- Título (Playfair) com a virada em laranja ---
  const hl = layers.find((l) => l.role === 'headline');
  const hg = (hl?.geometry ?? {}) as Record<string, unknown>;
  const boxW = pctW(hg.w ?? 74);
  const { fontSize, lines } = layoutText(text, {
    textWidth: Math.round(boxW), maxLines: num(recipe.limites?.max_linhas, 3),
    maxFontSize: Math.round(W * 0.062), minFontSize: Math.round(W * 0.036),
    fontFamily: FONT_SERIF, fontWeight: 'bold', balance: true, step: 3,
  });
  if (lines.length > 1 && /^[.,;:!?"')\]…]+$/.test(lines[lines.length - 1].trim())) {
    lines[lines.length - 2] = lines[lines.length - 2] + lines[lines.length - 1];
    lines.pop();
  }
  const titleH = lines.length * fontSize * 1.1;
  const titleTop = Math.round(pctH(hg.cy ?? 22) - titleH / 2);
  const titleStyles = highlight?.target ? highlightStyles(lines, highlight.target, laranja) : {};
  objects.push({
    type: 'Textbox', version: '6.0.0', text: lines.join('\n'),
    left: Math.round((W - boxW) / 2), top: titleTop, width: Math.round(boxW),
    fontSize, fontFamily: FONT_SERIF, fontWeight: 'bold', fill: inkTitle,
    textAlign: 'center', lineHeight: 1.1, editable: true, name: 'headline',
    ...(Object.keys(titleStyles).length ? { styles: titleStyles } : {}),
  });

  // --- Diagrama ---
  const dg = layers.find((l) => l.role === 'diagram');
  const kind = String((dg?.source as Record<string, unknown>)?.kind ?? '');
  const data = ((dg?.source as Record<string, unknown>)?.data ?? {}) as DiagramData;
  const geo = (dg?.geometry ?? {}) as Record<string, unknown>;

  if (kind === 'relacao') {
    const cy = pctH(geo.cy ?? 52);
    const r = pctW(geo.r ?? 9);
    const ax = pctW(38), bx = pctW(62);
    const poleA = (diagram?.poleA || data.poleA || 'A');
    const poleB = (diagram?.poleB || data.poleB || 'B');
    // linha pontilhada de base entre os polos
    objects.push(line(ax + r, cy, bx - r, cy, cinza, 1.5, true));
    // arco superior A -> B (azul)
    const topCy = cy - r * 2.1;
    objects.push(quad(ax + r * 0.66, cy - r * 0.66, (ax + bx) / 2, topCy, bx - r * 0.66, cy - r * 0.66, azul, 3));
    objects.push(arrowHead(bx - r * 0.66, cy - r * 0.66, Math.atan2((cy - r * 0.66) - topCy, (bx - r * 0.66) - (ax + bx) / 2), r * 0.34, azul));
    // arco inferior B -> A (laranja)
    const botCy = cy + r * 2.1;
    objects.push(quad(bx - r * 0.66, cy + r * 0.66, (ax + bx) / 2, botCy, ax + r * 0.66, cy + r * 0.66, laranja, 3));
    objects.push(arrowHead(ax + r * 0.66, cy + r * 0.66, Math.atan2((cy + r * 0.66) - botCy, (ax + r * 0.66) - (ax + bx) / 2), r * 0.34, laranja));
    // polos
    objects.push(circle(ax, cy, r, azul));
    objects.push(circle(bx, cy, r, creme, azul, 2));
    objects.push({ type: 'Textbox', version: '6.0.0', text: poleA, left: ax - r, top: cy - r * 0.42, width: r * 2, fontSize: Math.round(poleA.length > 2 ? W * 0.026 : W * 0.05), fontFamily: FONT_SERIF, fontWeight: 'bold', fill: creme, textAlign: 'center', selectable: false });
    objects.push({ type: 'Textbox', version: '6.0.0', text: poleB, left: bx - r, top: cy - r * 0.42, width: r * 2, fontSize: Math.round(poleB.length > 2 ? W * 0.026 : W * 0.05), fontFamily: FONT_SERIF, fontWeight: 'bold', fill: azul, textAlign: 'center', selectable: false });
    // apoio
    const sup = (data.support ?? '').replace(/\{A\}/g, poleA).replace(/\{B\}/g, poleB);
    if (sup) objects.push(label(sup, pctW(16), Math.round(pctH(74)), pctW(68), Math.round(W * 0.023), inkBody, 'center'));
  }

  if (kind === 'camadas') {
    const cx = pctW(geo.cx ?? 37), cy = pctH(58);
    const R = pctW(geo.r_outer ?? 27);
    const radii = [R, R * 0.72, R * 0.47, R * 0.25];
    const fills = onDark
      ? ['rgba(239,232,219,0.06)', 'rgba(239,232,219,0.11)', 'rgba(239,232,219,0.18)', 'rgba(239,232,219,0.28)']
      : ['rgba(28,46,74,0.06)', 'rgba(28,46,74,0.11)', 'rgba(28,46,74,0.18)', 'rgba(28,46,74,0.28)'];
    radii.forEach((rr, i) => objects.push(circle(cx, cy, rr, fills[i], onDark ? 'rgba(239,232,219,0.18)' : 'rgba(28,46,74,0.18)', 1)));
    objects.push(circle(cx, cy, R * 0.07, laranja)); // núcleo (essência)
    // rótulos à direita, com conector até a borda de cada anel
    const items = data.layers ?? [];
    const lx = pctW(60);
    items.forEach((it, i) => {
      const ly = cy - R * 0.66 + i * (R * 0.62);
      const ringR = radii[i];
      objects.push(line(cx + ringR, cy - ringR * 0.35 + i * 4, lx - pctW(2), ly + Math.round(W * 0.02), onDark ? 'rgba(239,232,219,0.35)' : 'rgba(28,46,74,0.3)', 1.2));
      objects.push(label(it.nome, lx, ly, pctW(34), Math.round(W * 0.026), inkTitle, 'left', '600'));
      objects.push(label(it.desc, lx, ly + Math.round(W * 0.03), pctW(34), Math.round(W * 0.019), mutedBody, 'left'));
    });
  }

  if (kind === 'movimento') {
    const cy = pctH(geo.cy ?? 44);
    const r = pctW(geo.r ?? 7);
    const xs = [pctW(28), pctW(50), pctW(72)];
    const states = data.states ?? [];
    const colorOf = (c: string) => (c === 'laranja' ? laranja : c === 'azul' ? azul : cinza);
    // conectores entre os estados
    for (let i = 0; i < xs.length - 1; i++) {
      objects.push(line(xs[i] + r, cy, xs[i + 1] - r, cy, azul, 2));
      objects.push(arrowHead(xs[i + 1] - r, cy, 0, r * 0.4, azul));
    }
    states.forEach((st, i) => {
      objects.push(circle(xs[i], cy, r, colorOf(st.cor)));
      // número/nome/descrição sob o círculo
      const cw = pctW(26), lx = xs[i] - cw / 2;
      objects.push(label(`${st.n}. ${st.nome.toUpperCase()}`, lx, Math.round(cy + r + pctH(3)), cw, Math.round(W * 0.021), azul, 'center', '700'));
      objects.push(label(st.desc, lx, Math.round(cy + r + pctH(6.2)), cw, Math.round(W * 0.018), mutedBody, 'center'));
    });
    // divisor + apoio (espiral de aprendizagens)
    objects.push(line(pctW(42), pctH(74), pctW(58), pctH(74), cinza, 1.5));
    if (data.support) {
      objects.push({
        type: 'Textbox', version: '6.0.0', text: data.support,
        left: pctW(18), top: Math.round(pctH(77)), width: pctW(64),
        fontSize: Math.round(W * 0.026), fontFamily: FONT_SERIF, fontWeight: 'normal', fontStyle: 'italic',
        fill: azul, textAlign: 'center', selectable: false,
      });
    }
  }

  if (kind === 'mapa') {
    const cx = pctW(geo.cx ?? 50), cy = pctH(geo.cy ?? 58);
    const R = pctW(geo.r ?? 24);
    const nodes = data.nodes ?? [];
    const pos = (ang: number) => ({ x: cx + R * Math.cos((ang * Math.PI) / 180), y: cy - R * Math.sin((ang * Math.PI) / 180) });
    // arestas do hexágono (ordena por ângulo p/ o perímetro)
    const sorted = [...nodes].sort((a, b) => a.angle - b.angle).map((n) => pos(n.angle));
    if (sorted.length) {
      let path = `M ${sorted[0].x} ${sorted[0].y}`;
      for (let i = 1; i < sorted.length; i++) path += ` L ${sorted[i].x} ${sorted[i].y}`;
      path += ' Z';
      objects.push({ type: 'Path', version: '6.0.0', path, stroke: 'rgba(28,46,74,0.4)', strokeWidth: 1.5, fill: '', selectable: false });
    }
    const nodeR = W * 0.03;
    for (const n of nodes) {
      const p = pos(n.angle);
      objects.push(line(cx, cy, p.x, p.y, 'rgba(28,46,74,0.18)', 1)); // raio discreto
      objects.push(circle(p.x, p.y, nodeR, azul));
      const right = Math.cos((n.angle * Math.PI) / 180) >= -0.01;
      const lw = pctW(24);
      const lx = right ? p.x + nodeR + pctW(1) : p.x - nodeR - pctW(1) - lw;
      const align = right ? 'left' : 'right';
      objects.push(label(n.nome, lx, p.y - Math.round(W * 0.026), lw, Math.round(W * 0.022), azul, align, '600'));
      objects.push(label(n.desc, lx, p.y + Math.round(W * 0.004), lw, Math.round(W * 0.016), mutedBody, align));
    }
    // espiral no centro (assinatura do sistema)
    const cs = W * 0.085, csc = cs / SPIRAL_NATIVE;
    objects.push({
      type: 'Image', version: '6.0.0', src: spiralUrl, crossOrigin: 'anonymous',
      left: Math.round(cx - cs / 2), top: Math.round(cy - cs / 2), scaleX: csc, scaleY: csc,
      name: 'bee-spiral-center', filters: [{ type: 'BlendColor', color: laranja, mode: 'tint', alpha: 1 }],
    });
  }

  // --- Assinatura: espiral laranja + MARCOS PICCINI no rodapé (não no D central) ---
  if (kind !== 'mapa') {
    const s = W * 0.042, sc = s / SPIRAL_NATIVE;
    objects.push({
      type: 'Image', version: '6.0.0', src: spiralUrl, crossOrigin: 'anonymous',
      left: Math.round(W / 2 - s / 2), top: Math.round(pctH(87) - s / 2), scaleX: sc, scaleY: sc,
      name: 'bee-spiral', filters: [{ type: 'BlendColor', color: laranja, mode: 'tint', alpha: 1 }],
    });
  }
  const nameFs = Math.round(W * 0.015);
  objects.push({
    type: 'Textbox', version: '6.0.0', text: 'MARCOS PICCINI',
    left: Math.round(W * 0.25), top: Math.round(pctH(kind === 'mapa' ? 90 : 91) - nameFs / 2), width: Math.round(W * 0.5),
    fontSize: nameFs, fontFamily: FONT_SANS, fontWeight: '600',
    fill: onDark ? creme : azul, textAlign: 'center', charSpacing: 360, name: 'signature', selectable: false,
  });

  return { version: '6.0.0', background, objects };
}
