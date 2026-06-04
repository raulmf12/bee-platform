// Painel de Marca Bee — paleta oficial, logo espiral, fontes da marca.
// Aplica cor: se houver objeto selecionado, atualiza fill (ou stroke pra linhas);
// senao, aplica como background do canvas.

import * as fabric from 'fabric';
import { Droplet, Palette, Sparkles, Type as TypeIcon } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { BEE_SPIRAL_URL } from '@/lib/templates/beeQuote';
import type { EditorApi } from '../useEditor';

// Paleta Bee oficial (Guia de Voz + identidade visual)
const PALETTE: Array<{ key: string; name: string; hex: string; meta?: string }> = [
  { key: 'navy', name: 'Navy', hex: '#2D4A5C', meta: 'Cor principal — titulos, fundos serios' },
  { key: 'navy-dark', name: 'Navy escuro', hex: '#1A2A35', meta: 'Texto base' },
  { key: 'honey', name: 'Honey', hex: '#E8A04C', meta: 'Acento — logo, destaques' },
  { key: 'honey-dark', name: 'Honey escuro', hex: '#C77E2C', meta: 'Hover, secundario' },
  { key: 'sand', name: 'Areia', hex: '#F5E6D3', meta: 'Fundo quente sutil' },
  { key: 'cream', name: 'Creme', hex: '#FAF6F0', meta: 'Fundo claro padrao' },
  { key: 'gray', name: 'Cinza', hex: '#5C6E78', meta: 'Texto secundario' },
  { key: 'white', name: 'Branco', hex: '#FFFFFF' },
];

const FONTS: Array<{ family: string; role: string; sample: string }> = [
  { family: 'Playfair Display', role: 'Frases / serif elegante', sample: 'A liderança começa em si.' },
  { family: 'Plus Jakarta Sans', role: 'Títulos / sans moderno', sample: 'Olhar Bee' },
  { family: 'Inter', role: 'Corpo / legibilidade', sample: 'Texto fluido para parágrafos.' },
];

export function BrandPanel({ api }: { api: EditorApi }) {
  const obj = api.activeObject;
  const hasSelection = !!obj;

  function applyColor(hex: string) {
    if (!obj) {
      api.setBackground(hex);
      toast.success('Fundo atualizado.');
      return;
    }
    // Linha: aplicar no stroke
    if (obj.type === 'line') {
      api.updateActive({ stroke: hex });
    } else {
      api.updateActive({ fill: hex });
    }
  }

  async function addLogo(variant: 'plain' | 'on-cream' | 'on-navy') {
    const c = api.fabric.current;
    if (!c) return;
    const W = c.getWidth() ?? 1080;
    const H = c.getHeight() ?? 1350;
    const spiralSide = Math.min(W, H) * 0.18;
    const cx = W / 2;
    const cy = H / 2;

    try {
      const img = await fabric.FabricImage.fromURL(BEE_SPIRAL_URL, { crossOrigin: 'anonymous' });
      const native = img.width ?? 1080;
      const scale = spiralSide / native;
      img.set({
        left: cx - spiralSide / 2,
        top: cy - spiralSide / 2,
        scaleX: scale,
        scaleY: scale,
        name: 'bee-spiral',
      });

      if (variant === 'plain') {
        c.add(img);
        c.setActiveObject(img);
      } else {
        // Composto: circulo de fundo + espiral por cima
        const bgColor = variant === 'on-navy' ? '#2D4A5C' : '#FAF6F0';
        const bgRadius = spiralSide * 0.78;
        const bg = new fabric.Circle({
          left: cx - bgRadius,
          top: cy - bgRadius,
          radius: bgRadius,
          fill: bgColor,
        });
        c.add(bg);
        c.add(img);
        c.setActiveObject(img);
      }
      c.requestRenderAll();
    } catch (e) {
      console.error('[BrandPanel.addLogo]', e);
      toast.error('Falha ao carregar a espiral');
    }
  }

  function applyFont(family: string) {
    if (obj && (obj.type === 'textbox' || obj.type === 'i-text' || obj.type === 'text')) {
      api.updateActive({ fontFamily: family });
    } else {
      const fallbackColor = '#2D4A5C';
      const isSerif = family === 'Playfair Display';
      api.addText(isSerif ? 'A liderança começa em si.' : 'Olhar Bee', {
        fontFamily: family,
        fontSize: isSerif ? 64 : 56,
        fontWeight: isSerif ? 'normal' : 'bold',
        fill: fallbackColor,
      });
    }
  }

  return (
    <div className="space-y-4 p-3">
      <div className="flex items-center gap-2 px-1">
        <Palette className="h-3.5 w-3.5 text-accent" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Marca Bee</h3>
      </div>

      {/* Paleta */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between px-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Paleta</p>
          <span className="text-[9px] text-muted-foreground">
            {hasSelection ? 'aplica no objeto' : 'aplica no fundo'}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {PALETTE.map((c) => (
            <button
              key={c.key}
              onClick={() => applyColor(c.hex)}
              title={`${c.name} • ${c.hex}${c.meta ? `\n${c.meta}` : ''}`}
              className={cn(
                'group relative aspect-square rounded-md border transition-all hover:scale-105 hover:shadow-md',
                c.hex === '#FFFFFF' ? 'border-border' : 'border-transparent',
              )}
              style={{ backgroundColor: c.hex }}
            >
              <span className="sr-only">{c.name}</span>
            </button>
          ))}
        </div>
        <div className="space-y-0.5 pt-1 text-[10px] text-muted-foreground">
          {PALETTE.slice(0, 4).map((c) => (
            <div key={c.key} className="flex items-center justify-between gap-2 px-1">
              <span>{c.name}</span>
              <span className="font-mono">{c.hex}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Logo */}
      <div className="space-y-1.5 border-t border-border pt-3">
        <div className="flex items-center gap-1.5 px-1">
          <Sparkles className="h-3 w-3 text-accent" />
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Logo</p>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <LogoButton bg="transparent" label="Original" onClick={() => void addLogo('plain')} />
          <LogoButton bg="#FAF6F0" label="Em creme" onClick={() => void addLogo('on-cream')} />
          <LogoButton bg="#2D4A5C" label="Em navy" onClick={() => void addLogo('on-navy')} />
        </div>
      </div>

      {/* Fontes */}
      <div className="space-y-1.5 border-t border-border pt-3">
        <div className="flex items-center gap-1.5 px-1">
          <TypeIcon className="h-3 w-3 text-accent" />
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Fontes oficiais</p>
        </div>
        <div className="space-y-1.5">
          {FONTS.map((f) => (
            <button
              key={f.family}
              onClick={() => applyFont(f.family)}
              className="flex w-full flex-col items-start gap-0.5 rounded-md border border-border bg-card p-2.5 text-left transition-all hover:border-accent hover:shadow-sm"
            >
              <span className="text-base text-foreground" style={{ fontFamily: f.family }}>
                {f.sample}
              </span>
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
                {f.family} · {f.role}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Dica */}
      <div className="flex gap-2 rounded-md border border-accent/30 bg-accent/5 p-2 text-[10px] text-muted-foreground">
        <Droplet className="h-3 w-3 shrink-0 text-accent" />
        <span>
          Cor com objeto selecionado → muda o objeto. Sem seleção → muda o fundo.
        </span>
      </div>
    </div>
  );
}

function LogoButton({ bg, label, onClick }: { bg: string; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={`Adicionar logo ${label}`}
      className="group flex flex-col items-center gap-1 rounded-md border border-border bg-card p-2 transition-all hover:border-accent hover:shadow-sm"
    >
      <div
        className="flex aspect-square w-full items-center justify-center rounded"
        style={{ backgroundColor: bg }}
      >
        <img src={BEE_SPIRAL_URL} alt={`Espiral ${label}`} className="h-8 w-8 object-contain" />
      </div>
      <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
    </button>
  );
}
