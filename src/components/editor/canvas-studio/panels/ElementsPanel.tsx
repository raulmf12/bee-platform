// Painel de elementos: formas + espiral Bee + separadores.

import * as fabric from 'fabric';
import { Circle, Minus, Shapes, Square, Triangle } from 'lucide-react';
import { BEE_SPIRAL_URL } from '@/lib/templates/beeQuote';
import type { EditorApi } from '../useEditor';

export function ElementsPanel({ api }: { api: EditorApi }) {
  const addSpiral = async () => {
    const c = api.fabric.current;
    if (!c) return;
    const W = c.getWidth() ?? 1080;
    const H = c.getHeight() ?? 1350;
    const targetSide = Math.min(W, H) * 0.18;
    try {
      const img = await fabric.FabricImage.fromURL(BEE_SPIRAL_URL, { crossOrigin: 'anonymous' });
      const native = img.width ?? 1080;
      const scale = targetSide / native;
      img.set({
        left: (W - targetSide) / 2,
        top: (H - targetSide) / 2,
        scaleX: scale,
        scaleY: scale,
        name: 'bee-spiral',
      });
      c.add(img);
      c.setActiveObject(img);
      c.requestRenderAll();
    } catch (e) {
      console.error('[ElementsPanel.addSpiral]', e);
    }
  };

  const addTriangle = () => {
    const c = api.fabric.current;
    if (!c) return;
    const w = (c.getWidth() ?? 1080) * 0.2;
    const tri = new fabric.Triangle({
      left: (c.getWidth() ?? 1080) / 2 - w / 2,
      top: (c.getHeight() ?? 1350) / 2 - w / 2,
      width: w,
      height: w,
      fill: '#2D4A5C',
    });
    c.add(tri);
    c.setActiveObject(tri);
    c.requestRenderAll();
  };

  const addSeparator = (kind: 'thin' | 'thick' | 'dot') => {
    const c = api.fabric.current;
    if (!c) return;
    const w = c.getWidth() ?? 1080;
    const h = c.getHeight() ?? 1350;
    if (kind === 'thin' || kind === 'thick') {
      const line = new fabric.Line([w * 0.2, h / 2, w * 0.8, h / 2], {
        stroke: '#2D4A5C',
        strokeWidth: kind === 'thin' ? 2 : 8,
      });
      c.add(line);
      c.setActiveObject(line);
    } else {
      // 3 dots
      for (let i = 0; i < 3; i++) {
        const dot = new fabric.Circle({
          left: w / 2 - 30 + i * 20,
          top: h / 2,
          radius: 4,
          fill: '#2D4A5C',
        });
        c.add(dot);
      }
    }
    c.requestRenderAll();
  };

  return (
    <div className="space-y-4 p-3">
      <div className="flex items-center gap-2 px-1">
        <Shapes className="h-3.5 w-3.5 text-accent" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Elementos</h3>
      </div>

      {/* Formas básicas */}
      <div className="space-y-1.5">
        <p className="px-1 text-[10px] uppercase tracking-wider text-muted-foreground">Formas</p>
        <div className="grid grid-cols-4 gap-1.5">
          <ElementButton onClick={api.addRect} icon={<Square className="h-5 w-5" />} label="Retângulo" />
          <ElementButton onClick={api.addCircle} icon={<Circle className="h-5 w-5" />} label="Círculo" />
          <ElementButton onClick={addTriangle} icon={<Triangle className="h-5 w-5" />} label="Triângulo" />
          <ElementButton onClick={api.addLine} icon={<Minus className="h-5 w-5" />} label="Linha" />
        </div>
      </div>

      {/* Elementos Bee */}
      <div className="space-y-1.5 pt-2 border-t border-border">
        <p className="px-1 text-[10px] uppercase tracking-wider text-muted-foreground">Bee</p>
        <button
          onClick={() => void addSpiral()}
          className="group flex w-full items-center gap-3 rounded-md border border-border bg-card p-2.5 transition-all hover:border-accent hover:shadow-sm"
        >
          <img src={BEE_SPIRAL_URL} alt="Espiral Bee" className="h-9 w-9 object-contain" />
          <div className="text-left">
            <p className="text-xs font-semibold">Espiral Bee</p>
            <p className="text-[10px] text-muted-foreground">Logo oficial honey</p>
          </div>
        </button>
      </div>

      {/* Separadores */}
      <div className="space-y-1.5 pt-2 border-t border-border">
        <p className="px-1 text-[10px] uppercase tracking-wider text-muted-foreground">Separadores</p>
        <div className="grid grid-cols-1 gap-1.5">
          <button
            onClick={() => addSeparator('thin')}
            className="flex items-center justify-center rounded-md border border-border bg-card p-3 transition-all hover:border-accent"
          >
            <div className="h-px w-full bg-foreground" />
          </button>
          <button
            onClick={() => addSeparator('thick')}
            className="flex items-center justify-center rounded-md border border-border bg-card p-3 transition-all hover:border-accent"
          >
            <div className="h-1 w-full rounded-full bg-foreground" />
          </button>
          <button
            onClick={() => addSeparator('dot')}
            className="flex items-center justify-center gap-1.5 rounded-md border border-border bg-card p-3 transition-all hover:border-accent"
          >
            <span className="h-1 w-1 rounded-full bg-foreground" />
            <span className="h-1 w-1 rounded-full bg-foreground" />
            <span className="h-1 w-1 rounded-full bg-foreground" />
          </button>
        </div>
      </div>
    </div>
  );
}

function ElementButton({ onClick, icon, label }: { onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="flex aspect-square flex-col items-center justify-center rounded-md border border-border bg-card transition-all hover:border-accent hover:shadow-sm"
    >
      {icon}
    </button>
  );
}
