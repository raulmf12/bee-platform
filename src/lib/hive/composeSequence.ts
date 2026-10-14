// Compositor das PÁGINAS de uma sequência (carrossel) — Conteúdos sequenciais §8.
// A capa usa o pipeline de imagem única (generateHiveImage: template, foto/fundo, decisão).
// Páginas internas e de encerramento compartilham a direção visual do conjunto: tokens de
// cor, tipografia (Playfair no título, Inter no corpo), assinatura e ritmo; a composição varia
// pela função da página. Texto que não cabe NÃO é cortado: a página falha com motivo claro.
import { layoutText } from '@/lib/templates/layout';
import type { ComposedSlide } from './composeM01';

const TITLE_FONT = 'Playfair Display';
const BODY_FONT = 'Inter';
const SPIRAL_NATIVE = 1080;

export interface SequenceDirection {
  theme: 'claro' | 'escuro';         // fundo creme × azul
  numbering: boolean;                // número da página (elemento dependente da posição)
  signature?: string | null;         // assinatura do autor/marca
  cover_variant?: string | null;     // template da capa (imagem única)
}
export const DEFAULT_DIRECTION: SequenceDirection = { theme: 'claro', numbering: true, signature: null, cover_variant: null };

export class OverflowError extends Error {}

export function composeSequencePage(input: {
  layout: 'cover' | 'text' | 'closing'; title: string; body: string; position: number; total: number;
  direction: SequenceDirection; colors: Record<string, string>; spiralUrl: string; canvas?: { w: number; h: number };
}): ComposedSlide {
  const W = input.canvas?.w ?? 1080, H = input.canvas?.h ?? 1350;
  const c = (slug: string, fb: string) => input.colors[slug] ?? fb;
  const dark = input.direction.theme === 'escuro';
  const bg = dark ? c('azul_mp', '#1C2E4A') : c('creme', '#EFE8DB');
  const ink = dark ? c('creme', '#EFE8DB') : c('azul_mp', '#1C2E4A');
  const soft = dark ? 'rgba(239,232,219,0.82)' : c('azul_mp', '#1C2E4A');
  const accent = c('laranja', '#E08A3C');
  const muted = c('neutro_texto', '#6B7280');
  const objects: object[] = [];
  const marginX = Math.round(W * 0.1), boxW = W - 2 * marginX;
  const closing = input.layout === 'closing';
  // Capa composta aqui (Stories): título grande centrado, sem número — abre a sequência.
  const cover = input.layout === 'cover';
  const tall = H / W > 1.5;                     // Stories (9:16): texto maior e área mais alta

  if (input.direction.numbering && !cover) {
    objects.push({ type: 'Textbox', version: '6.0.0', text: String(input.position).padStart(2, '0'), left: marginX, top: Math.round(H * 0.07), width: 200,
      fontSize: Math.round(W * 0.03), fontFamily: BODY_FONT, fontWeight: '600', fill: accent, charSpacing: 120, name: 'page-number', selectable: false });
    objects.push({ type: 'Rect', version: '6.0.0', left: marginX, top: Math.round(H * 0.07 + W * 0.045), width: Math.round(W * 0.06), height: 3, fill: accent, name: 'page-rule', selectable: false });
  }

  const title = input.title.trim(), body = input.body.trim();
  const centered = closing || cover;
  const tMax = cover ? 5 : 4, bMax = closing ? 6 : tall ? 7 : 9;
  const t = title ? layoutText(title, { textWidth: boxW, maxLines: tMax, maxFontSize: Math.round(W * (cover ? 0.1 : closing ? 0.08 : 0.075) * (tall ? 1.1 : 1)), minFontSize: Math.round(W * 0.045), fontFamily: TITLE_FONT, fontWeight: 'bold', balance: true, step: 2 }) : null;
  const b = body ? layoutText(body, { textWidth: boxW, maxLines: bMax, maxFontSize: Math.round(W * 0.046 * (tall ? 1.15 : 1)), minFontSize: Math.round(W * 0.032), fontFamily: BODY_FONT, fontWeight: '400', balance: false, step: 1 }) : null;
  if (t && t.lines.length > tMax) throw new OverflowError(`O título da página ${input.position} não cabe (${t.lines.length} linhas). Encurte o texto.`);
  if (b && b.lines.length > bMax) throw new OverflowError(`O texto da página ${input.position} não cabe (${b.lines.length} linhas). Encurte ou divida a página.`);
  const tH = t ? t.lines.length * t.fontSize * 1.12 : 0;
  const gap = t && b ? Math.round(H * 0.035) : 0;
  const bH = b ? b.lines.length * b.fontSize * 1.42 : 0;
  const areaTop = Math.round(H * (tall ? 0.16 : 0.18)), areaBottom = Math.round(H * (closing ? 0.74 : tall ? 0.8 : 0.84));
  if (tH + gap + bH > areaBottom - areaTop) throw new OverflowError(`A página ${input.position} tem texto demais para a área legível. Encurte ou divida a página.`);
  // Bloco centrado na área legível (páginas internas um pouco acima do centro, para o ritmo de leitura).
  const free = areaBottom - areaTop - (tH + gap + bH);
  let y = Math.round(areaTop + free * (centered ? 0.5 : 0.4));
  const align = centered ? 'center' : 'left';
  if (t) {
    objects.push({ type: 'Textbox', version: '6.0.0', text: t.lines.join('\n'), left: marginX, top: y, width: boxW, fontSize: t.fontSize, fontFamily: TITLE_FONT, fontWeight: 'bold',
      fill: ink, textAlign: align, lineHeight: 1.12, name: 'unit-title' });
    y += tH + gap;
  }
  if (b) {
    objects.push({ type: 'Textbox', version: '6.0.0', text: b.lines.join('\n'), left: marginX, top: y, width: boxW, fontSize: b.fontSize, fontFamily: BODY_FONT, fontWeight: '400',
      fill: soft, textAlign: align, lineHeight: 1.42, name: 'unit-body' });
  }

  if (!closing && !tall) {
    // Continuidade: indica que a sequência segue.
    objects.push({ type: 'Textbox', version: '6.0.0', text: '→', left: W - marginX - 80, top: Math.round(H * 0.88), width: 80, fontSize: Math.round(W * 0.05),
      fontFamily: BODY_FONT, fontWeight: '400', fill: accent, textAlign: 'right', name: 'next-hint', selectable: false });
  }
  if (closing) {
    const side = Math.round(W * 0.1);
    objects.push({ type: 'Image', version: '6.0.0', src: input.spiralUrl, crossOrigin: 'anonymous', left: Math.round(W / 2 - side / 2), top: Math.round(H * 0.79),
      scaleX: side / SPIRAL_NATIVE, scaleY: side / SPIRAL_NATIVE, name: 'bee-spiral', filters: [{ type: 'BlendColor', color: accent, mode: 'tint', alpha: 1 }] });
  }
  if (input.direction.signature) {
    const fs = Math.round(W * 0.016);
    objects.push({ type: 'Textbox', version: '6.0.0', text: input.direction.signature.toUpperCase(), left: marginX, top: Math.round(H * 0.93 - fs), width: boxW,
      fontSize: fs, fontFamily: BODY_FONT, fontWeight: '600', fill: dark ? 'rgba(239,232,219,0.7)' : muted, textAlign: 'center', charSpacing: 320, name: 'signature', selectable: false });
  }
  return { version: '6.0.0', background: bg, objects };
}
