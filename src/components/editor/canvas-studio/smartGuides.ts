// Smart guides estilo Canva pro Canvas Studio (Fabric v6).
//
// O que faz enquanto você ARRASTA (ou escala) um objeto:
//   • linhas de alinhamento (magenta) quando uma borda/centro do objeto encosta
//     no centro/borda do CANVAS ou de OUTRO objeto — com SNAP (gruda);
//   • rótulos de DISTÂNCIA do objeto até as 4 bordas do canvas (em px);
//   • rótulo de DISTÂNCIA entre o objeto e o vizinho com que ele se alinhou.
//
// Como desenha: nada é adicionado ao canvas (não polui a serialização). As guias
// são pintadas no contexto do próprio canvas no evento `after:render`, e limpas
// no `mouse:up`. Coordenadas em espaço de cena; o zoom é via CSS transform, então
// larguras/fontes são divididas por `getZoom()` pra ficarem crocantes na tela.

import type * as fabric from 'fabric';

const COLOR = '#FF2E88';        // magenta Canva
const SNAP_SCREEN = 7;          // px de tela pra "grudar"
const COINCIDE = 0.5;           // tolerância pra considerar alinhado (px cena)

interface VLine { x: number; y1: number; y2: number }
interface HLine { y: number; x1: number; x2: number }
interface Measure { x1: number; y1: number; x2: number; y2: number; text: string; mx: number; my: number }

interface Bounds { left: number; top: number; width: number; height: number }

function anchorsX(b: Bounds) { return [b.left, b.left + b.width / 2, b.left + b.width]; }
function anchorsY(b: Bounds) { return [b.top, b.top + b.height / 2, b.top + b.height]; }

export function attachSmartGuides(
  canvas: fabric.Canvas,
  opts: { getZoom: () => number },
): () => void {
  let vLines: VLine[] = [];
  let hLines: HLine[] = [];
  let measures: Measure[] = [];
  let active = false;

  const clear = () => {
    if (!active && !vLines.length && !hLines.length && !measures.length) return;
    vLines = []; hLines = []; measures = []; active = false;
    canvas.requestRenderAll();
  };

  // Candidatos de alinhamento: o canvas + todos os outros objetos visíveis.
  const collect = (target: fabric.Object) => {
    const W = canvas.getWidth();
    const H = canvas.getHeight();
    const xs: Array<{ pos: number; b?: Bounds }> = [
      { pos: 0 }, { pos: W / 2 }, { pos: W },
    ];
    const ys: Array<{ pos: number; b?: Bounds }> = [
      { pos: 0 }, { pos: H / 2 }, { pos: H },
    ];
    // Membros de uma seleção múltipla não contam como vizinhos.
    const members = new Set<fabric.Object>((target as unknown as { _objects?: fabric.Object[] })._objects ?? []);
    for (const o of canvas.getObjects()) {
      if (o === target || members.has(o) || o.visible === false) continue;
      const b = o.getBoundingRect() as Bounds;
      for (const x of anchorsX(b)) xs.push({ pos: x, b });
      for (const y of anchorsY(b)) ys.push({ pos: y, b });
    }
    return { xs, ys, W, H };
  };

  // Acha o melhor snap (menor delta dentro do limiar) num eixo.
  const bestSnap = (
    anchors: number[],
    cands: Array<{ pos: number; b?: Bounds }>,
    thr: number,
  ): { delta: number; hit: boolean } => {
    let best = { delta: 0, hit: false, abs: Infinity };
    for (const a of anchors) {
      for (const c of cands) {
        const d = a - c.pos;
        const ad = Math.abs(d);
        if (ad <= thr && ad < best.abs) best = { delta: d, hit: true, abs: ad };
      }
    }
    return { delta: best.delta, hit: best.hit };
  };

  const round = (n: number) => Math.round(n);

  const compute = (target: fabric.Object, snap: boolean) => {
    target.setCoords();
    const zoom = Math.max(opts.getZoom(), 0.0001);
    const thr = SNAP_SCREEN / zoom;
    const { xs, ys, W, H } = collect(target);

    // 1) SNAP: encaixa X e Y no melhor candidato.
    if (snap) {
      let b = target.getBoundingRect() as Bounds;
      const sx = bestSnap(anchorsX(b), xs, thr);
      if (sx.hit) { target.set({ left: (target.left ?? 0) - sx.delta }); target.setCoords(); }
      b = target.getBoundingRect() as Bounds;
      const sy = bestSnap(anchorsY(b), ys, thr);
      if (sy.hit) { target.set({ top: (target.top ?? 0) - sy.delta }); target.setCoords(); }
    }

    // 2) Guias: desenha TODA linha que ficou coincidente após o snap.
    const b = target.getBoundingRect() as Bounds;
    const ax = anchorsX(b);
    const ay = anchorsY(b);
    vLines = []; hLines = []; measures = [];

    for (const c of xs) {
      const a = ax.find((v) => Math.abs(v - c.pos) <= COINCIDE);
      if (a === undefined) continue;
      const y1 = c.b ? Math.min(b.top, c.b.top) : 0;
      const y2 = c.b ? Math.max(b.top + b.height, c.b.top + c.b.height) : H;
      vLines.push({ x: c.pos, y1, y2 });
      // distância vertical entre o objeto e o vizinho alinhado (gap positivo).
      if (c.b) {
        const gap = b.top >= c.b.top + c.b.height
          ? b.top - (c.b.top + c.b.height)
          : c.b.top >= b.top + b.height
            ? c.b.top - (b.top + b.height)
            : 0;
        if (gap > 1) {
          const my = b.top >= c.b.top + c.b.height ? (c.b.top + c.b.height + b.top) / 2 : (b.top + b.height + c.b.top) / 2;
          measures.push({ x1: c.pos, y1: my - gap / 2, x2: c.pos, y2: my + gap / 2, text: `${round(gap)}`, mx: c.pos, my });
        }
      }
    }
    for (const c of ys) {
      const a = ay.find((v) => Math.abs(v - c.pos) <= COINCIDE);
      if (a === undefined) continue;
      const x1 = c.b ? Math.min(b.left, c.b.left) : 0;
      const x2 = c.b ? Math.max(b.left + b.width, c.b.left + c.b.width) : W;
      hLines.push({ y: c.pos, x1, x2 });
      if (c.b) {
        const gap = b.left >= c.b.left + c.b.width
          ? b.left - (c.b.left + c.b.width)
          : c.b.left >= b.left + b.width
            ? c.b.left - (b.left + b.width)
            : 0;
        if (gap > 1) {
          const mx = b.left >= c.b.left + c.b.width ? (c.b.left + c.b.width + b.left) / 2 : (b.left + b.width + c.b.left) / 2;
          measures.push({ x1: mx - gap / 2, y1: c.pos, x2: mx + gap / 2, y2: c.pos, text: `${round(gap)}`, mx, my: c.pos });
        }
      }
    }

    // 3) Distância até as 4 bordas do canvas (sempre, enquanto move/escala).
    const cx = b.left + b.width / 2;
    const cy = b.top + b.height / 2;
    const left = b.left, right = W - (b.left + b.width), top = b.top, bottom = H - (b.top + b.height);
    if (left > 1) measures.push({ x1: 0, y1: cy, x2: b.left, y2: cy, text: `${round(left)}`, mx: b.left / 2, my: cy });
    if (right > 1) measures.push({ x1: b.left + b.width, y1: cy, x2: W, y2: cy, text: `${round(right)}`, mx: (b.left + b.width + W) / 2, my: cy });
    if (top > 1) measures.push({ x1: cx, y1: 0, x2: cx, y2: b.top, text: `${round(top)}`, mx: cx, my: b.top / 2 });
    if (bottom > 1) measures.push({ x1: cx, y1: b.top + b.height, x2: cx, y2: H, text: `${round(bottom)}`, mx: cx, my: (b.top + b.height + H) / 2 });

    active = true;
  };

  const onMoving = (e: { target?: fabric.Object }) => { if (e.target) compute(e.target, true); };
  const onScaling = (e: { target?: fabric.Object }) => { if (e.target) compute(e.target, false); };

  // Só há guias enquanto um transform (drag/scale) está REALMENTE em curso.
  // Sem isto, o desenho no after:render "gruda" na tela enquanto o objeto fica
  // só selecionado (re-render da seleção repinta as guias antigas).
  const transforming = () => Boolean((canvas as unknown as { _currentTransform?: unknown })._currentTransform);

  const draw = () => {
    if (!active || !transforming()) return;
    const ctx = canvas.getContext();
    const zoom = Math.max(opts.getZoom(), 0.0001);
    const vpt = canvas.viewportTransform ?? [1, 0, 0, 1, 0, 0];
    ctx.save();
    ctx.setTransform(vpt[0], vpt[1], vpt[2], vpt[3], vpt[4], vpt[5]);
    const lw = 1 / zoom;

    // linhas de alinhamento
    ctx.strokeStyle = COLOR;
    ctx.lineWidth = lw;
    ctx.setLineDash([]);
    ctx.beginPath();
    for (const l of vLines) { ctx.moveTo(l.x, l.y1); ctx.lineTo(l.x, l.y2); }
    for (const l of hLines) { ctx.moveTo(l.x1, l.y); ctx.lineTo(l.x2, l.y); }
    ctx.stroke();

    // marcadores em X nos cruzamentos das guias (feel Canva)
    const r = 4 / zoom;
    ctx.beginPath();
    const marks: Array<[number, number]> = [];
    for (const v of vLines) for (const h of hLines) marks.push([v.x, h.y]);
    for (const [mx, my] of marks) {
      ctx.moveTo(mx - r, my - r); ctx.lineTo(mx + r, my + r);
      ctx.moveTo(mx + r, my - r); ctx.lineTo(mx - r, my + r);
    }
    ctx.stroke();

    // medidas (linhas tracejadas + rótulo)
    const fs = 12 / zoom;
    ctx.font = `${fs}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.setLineDash([4 / zoom, 3 / zoom]);
    for (const m of measures) {
      ctx.strokeStyle = COLOR;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(m.x1, m.y1); ctx.lineTo(m.x2, m.y2);
      // ticks nas pontas
      const horiz = Math.abs(m.y2 - m.y1) < Math.abs(m.x2 - m.x1);
      const t = 3 / zoom;
      if (horiz) {
        ctx.moveTo(m.x1, m.y1 - t); ctx.lineTo(m.x1, m.y1 + t);
        ctx.moveTo(m.x2, m.y2 - t); ctx.lineTo(m.x2, m.y2 + t);
      } else {
        ctx.moveTo(m.x1 - t, m.y1); ctx.lineTo(m.x1 + t, m.y1);
        ctx.moveTo(m.x2 - t, m.y2); ctx.lineTo(m.x2 + t, m.y2);
      }
      ctx.stroke();

      // rótulo com fundo
      const padX = 5 / zoom, padY = 3 / zoom;
      const tw = ctx.measureText(m.text).width;
      const bw = tw + padX * 2, bh = fs + padY * 2;
      ctx.setLineDash([]);
      ctx.fillStyle = COLOR;
      const bx = m.mx - bw / 2, by = m.my - bh / 2;
      const rad = 3 / zoom;
      ctx.beginPath();
      ctx.moveTo(bx + rad, by);
      ctx.arcTo(bx + bw, by, bx + bw, by + bh, rad);
      ctx.arcTo(bx + bw, by + bh, bx, by + bh, rad);
      ctx.arcTo(bx, by + bh, bx, by, rad);
      ctx.arcTo(bx, by, bx + bw, by, rad);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(m.text, m.mx, m.my);
      ctx.setLineDash([4 / zoom, 3 / zoom]);
    }

    ctx.restore();
  };

  canvas.on('object:moving', onMoving);
  canvas.on('object:scaling', onScaling);
  canvas.on('object:rotating', clear);
  canvas.on('object:modified', clear);   // fim do arraste/escala — some as guias
  canvas.on('mouse:down', clear);
  canvas.on('mouse:up', clear);
  canvas.on('selection:updated', clear);
  canvas.on('selection:cleared', clear);
  canvas.on('after:render', draw);

  return () => {
    canvas.off('object:moving', onMoving);
    canvas.off('object:scaling', onScaling);
    canvas.off('object:rotating', clear);
    canvas.off('object:modified', clear);
    canvas.off('mouse:down', clear);
    canvas.off('mouse:up', clear);
    canvas.off('selection:updated', clear);
    canvas.off('selection:cleared', clear);
    canvas.off('after:render', draw);
  };
}
