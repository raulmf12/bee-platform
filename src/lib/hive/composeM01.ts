// Compositor da Hive — M01. Transforma uma RECEITA (design_variacoes.layer_stack,
// geometria em % do canvas) + TOKENS + texto aprovado num documento Fabric.js
// (slides_json de 1 slide) que o render/editor existentes consomem.
//
// Chave da visão: a geometria é em % do canvas, então o MESMO recipe deriva pra
// qualquer formato (feed 1080x1350 serve IG e LinkedIn; square/story depois).
// O corpo do texto é ajustado pelo motor de layout (layoutText) — quanto maior a
// frase, menor a fonte, sempre dentro do respiro.
//
// NÃO altera o texto (EDITORIAL_LOCKED). Só decide a forma.

import { layoutText } from '@/lib/templates/layout';

const SPIRAL_NATIVE = 1080;       // bee-spiral.png é 1080x1080
const FONT_FAMILY = 'Playfair Display';
const FONT_WEIGHT = 'bold';       // casa com o preload do renderFabricToDataUrl
const LINE_HEIGHT = 1.08;

export interface DesignLayer {
  role: string;
  required?: boolean;
  source?: Record<string, unknown>;
  geometry?: Record<string, unknown> | null;
}
export interface M01Recipe {
  id: string;
  nome: string;
  limites?: Record<string, unknown>;
  layer_stack: DesignLayer[];
}
export interface ComposeInput {
  recipe: M01Recipe;
  colors: Record<string, string>;   // slug -> hex (ex: {azul_mp:'#1C2E4A', ...})
  spiralUrl: string;
  text: string;                      // texto aprovado
  highlight?: { target: string } | null;
  canvas: { w: number; h: number }; // ex: {w:1080,h:1350} (feed IG/LinkedIn)
}

// Aliases p/ slugs pseudo que ficaram nos recipes (ex: "creme_ou_branco").
function resolveColor(colors: Record<string, string>, slug?: string, fallback = '#EFE8DB'): string {
  if (!slug) return fallback;
  if (colors[slug]) return colors[slug];
  if (slug.includes('_ou_')) return colors[slug.split('_ou_')[0]] ?? fallback;
  return fallback;
}

const num = (v: unknown, d = 0): number => (typeof v === 'number' && isFinite(v) ? v : d);

// Índices de char (por linha) do trecho de destaque, p/ colorir em laranja.
function highlightStyles(lines: string[], target: string, fill: string): Record<number, Record<number, { fill: string }>> {
  const styles: Record<number, Record<number, { fill: string }>> = {};
  const needle = target.trim().toLowerCase();
  if (!needle) return styles;
  for (let li = 0; li < lines.length; li++) {
    const hay = lines[li].toLowerCase();
    const at = hay.indexOf(needle);
    if (at === -1) continue;
    styles[li] = styles[li] ?? {};
    for (let c = at; c < at + needle.length; c++) styles[li][c] = { fill };
    break; // destaque é 1 ocorrência
  }
  return styles;
}

export interface ComposedSlide { version: string; background: string; objects: object[] }

export function composeM01(input: ComposeInput): ComposedSlide {
  const { recipe, colors, spiralUrl, text, highlight, canvas } = input;
  const W = canvas.w, H = canvas.h;
  const pctW = (p: unknown) => (num(p) / 100) * W;
  const pctH = (p: unknown) => (num(p) / 100) * H;
  const laranja = resolveColor(colors, 'laranja', '#E08A3C');

  const objects: object[] = [];
  let background = '#EFE8DB';

  // Fundo: cor do token do layer background (ou placeholder navy p/ foto em D).
  const bgLayer = recipe.layer_stack.find((l) => l.role === 'background');
  if (bgLayer) {
    background = resolveColor(colors, bgLayer.source?.token as string | undefined, '#EFE8DB');
  } else if (recipe.layer_stack.some((l) => l.role === 'photo')) {
    background = resolveColor(colors, 'azul_mp', '#1C2E4A'); // placeholder até haver foto real
  }

  for (const layer of recipe.layer_stack) {
    const g = (layer.geometry ?? {}) as Record<string, unknown>;

    if (layer.role === 'readability_overlay') {
      // Véu de legibilidade em DEGRADÊ (transparente no topo -> escuro na base).
      // Retângulo de meia altura criava uma "linha" dura no meio; o gradiente
      // cobre o canvas inteiro e some suavemente. É o tratamento certo quando
      // entrar a foto real por baixo.
      objects.push({
        type: 'Rect', version: '6.0.0',
        left: 0, top: 0, width: W, height: H,
        fill: {
          type: 'linear',
          coords: { x1: 0, y1: 0, x2: 0, y2: H },
          colorStops: [
            { offset: 0.4, color: 'rgba(11,17,30,0)' },
            { offset: 1, color: 'rgba(11,17,30,0.72)' },
          ],
        },
        selectable: false, name: 'overlay',
      });
      continue;
    }

    if (layer.role === 'structural_graphic') {
      const kind = String((layer.source as Record<string, unknown>)?.kind ?? '');
      const color = resolveColor(colors, (layer.source as Record<string, unknown>)?.token_color as string | undefined, laranja);
      if (kind.includes('moldura')) {
        const inset = num(g.inset, 6);
        objects.push({
          type: 'Rect', version: '6.0.0',
          left: Math.round(pctW(inset)), top: Math.round(pctH(inset)),
          width: Math.round(W - 2 * pctW(inset)), height: Math.round(H - 2 * pctH(inset)),
          fill: 'transparent', stroke: color, strokeWidth: 2, selectable: false, name: 'frame',
        });
        const marker = g.marker as Record<string, unknown> | undefined;
        if (marker) {
          const mw = pctW(marker.w);
          objects.push({
            type: 'Rect', version: '6.0.0',
            left: Math.round(pctW(marker.cx) - mw / 2), top: Math.round(pctH(marker.cy)),
            width: Math.round(mw), height: 3, fill: laranja, selectable: false, name: 'marker',
          });
        }
      } else {
        // linha
        const lw = pctW(g.w);
        objects.push({
          type: 'Rect', version: '6.0.0',
          left: Math.round(pctW(g.cx) - lw / 2), top: Math.round(pctH(g.cy)),
          width: Math.round(lw), height: 3, fill: color, selectable: false, name: 'line',
        });
      }
      continue;
    }

    if (layer.role === 'headline') {
      const boxW = Math.round(pctW(g.w ?? 64));
      const align = String(g.align ?? 'center');
      const fill = resolveColor(colors, (layer.source as Record<string, unknown>)?.token_color as string | undefined, '#1C2E4A');
      // Até 3 linhas: em caixas estreitas (D/E), forçar 2 linhas espremia a
      // fonte. Permitir 3 deixa o ajustador escolher um corpo MAIOR. Piso de
      // fonte mais alto evita texto minúsculo.
      const { fontSize, lines } = layoutText(text, {
        textWidth: boxW,
        maxLines: num(recipe.limites?.max_linhas, 3),
        maxFontSize: Math.round(W * 0.085),
        minFontSize: Math.round(W * 0.042),
        fontFamily: FONT_FAMILY,
        fontWeight: FONT_WEIGHT,
        balance: true,
        step: 3,
      });
      const textHeight = lines.length * fontSize * LINE_HEIGHT;
      const cy = pctH(g.cy ?? 43);
      const top = Math.round(cy - textHeight / 2);
      const left = align === 'center' ? Math.round((W - boxW) / 2) : Math.round(pctW(g.x ?? 9));
      const styles = highlight?.target ? highlightStyles(lines, highlight.target, laranja) : {};
      objects.push({
        type: 'Textbox', version: '6.0.0',
        text: lines.join('\n'),
        left, top, width: boxW,
        fontSize, fontFamily: FONT_FAMILY, fontWeight: FONT_WEIGHT,
        fill, textAlign: align, lineHeight: LINE_HEIGHT,
        editable: true, name: 'headline',
        ...(Object.keys(styles).length ? { styles } : {}),
      });
      continue;
    }

    if (layer.role === 'bee_spiral_official') {
      const side = pctW(g.w ?? 9);
      const scale = side / SPIRAL_NATIVE;
      objects.push({
        type: 'Image', version: '6.0.0',
        src: spiralUrl, crossOrigin: 'anonymous',
        left: Math.round(pctW(g.cx ?? 50) - side / 2),
        top: Math.round(pctH(g.cy ?? 76) - side / 2),
        scaleX: scale, scaleY: scale, name: 'bee-spiral',
        // Tinge a espiral no laranja oficial, preservando o alpha do shape.
        filters: [{ type: 'BlendColor', color: laranja, mode: 'tint', alpha: 1 }],
      });
      continue;
    }

    if (layer.role === 'author_signature') {
      const txt = String((layer.source as Record<string, unknown>)?.text ?? 'MARCOS PICCINI');
      const fill = resolveColor(colors, (layer.source as Record<string, unknown>)?.token_color as string | undefined, '#6B7280');
      const fs = Math.round(W * 0.016);
      objects.push({
        type: 'Textbox', version: '6.0.0',
        text: txt.toUpperCase(),
        left: Math.round((W - pctW(g.w ?? 40)) / 2), top: Math.round(pctH(g.cy ?? 78) - fs),
        width: Math.round(pctW(g.w ?? 40)),
        fontSize: fs, fontFamily: 'Hanken Grotesk, sans-serif', fontWeight: '600',
        fill, textAlign: 'center', charSpacing: 320, name: 'signature', selectable: false,
      });
      continue;
    }

    // photo / texture: entram assets reais depois (v1 usa fundo placeholder acima).
  }

  return { version: '6.0.0', background, objects };
}
