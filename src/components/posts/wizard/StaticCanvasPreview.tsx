import { useEffect, useRef, useState } from 'react';
import * as fabric from 'fabric';
import { Loader2 } from 'lucide-react';
import { CANVAS_PRESETS } from '@/components/editor/canvas-studio/useEditor';

interface StaticCanvasPreviewProps {
  fabricJson: object;
  // Dimensões REAIS do canvas. Preferidas — o slide hidratado não carrega dims
  // próprias, então confiar só no presetId erra (ex: square 1200 vs preset 1080).
  width?: number;
  height?: number;
  presetId?: string;
  className?: string;
}

export function StaticCanvasPreview({ fabricJson, width, height, presetId = 'linkedin-portrait', className }: StaticCanvasPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);

  const preset = CANVAS_PRESETS[presetId] ?? CANVAS_PRESETS['linkedin-portrait'];
  const dims = { width: width ?? preset.width, height: height ?? preset.height };

  useEffect(() => {
    if (!canvasElRef.current || !containerRef.current) return;

    const size = dims;

    // StaticCanvas é focado apenas em renderizar, não possui listeners de interação.
    const canvas = new fabric.StaticCanvas(canvasElRef.current, {
      width: size.width,
      height: size.height,
      backgroundColor: '#FFFFFF',
    });

    let isMounted = true;

    async function load() {
      try {
        await canvas.loadFromJSON(fabricJson);
        if (isMounted) {
          canvas.renderAll();
          setLoading(false);
          fit();
        }
      } catch (err) {
        console.error('Failed to load canvas JSON', err);
        if (isMounted) setLoading(false);
      }
    }

    // Auto-fit function via CSS transform based on container size
    const fit = () => {
      const container = containerRef.current;
      if (!container) return;
      const PAD = 16;
      const cw = container.clientWidth - PAD;
      const ch = container.clientHeight - PAD;
      if (cw <= 0 || ch <= 0) return;
      const scale = Math.min(cw / size.width, ch / size.height, 1);
      
      const wrapper = container.querySelector('.canvas-wrapper') as HTMLElement;
      if (wrapper) {
        wrapper.style.transform = `scale(${scale})`;
      }
    };

    const ro = new ResizeObserver(() => fit());
    ro.observe(containerRef.current);

    void load();

    return () => {
      isMounted = false;
      ro.disconnect();
      try {
        void canvas.dispose();
      } catch (e) {
        console.warn('Dispose error', e);
      }
    };
  }, [fabricJson, dims.width, dims.height]);

  const size = dims;

  return (
    <div 
      ref={containerRef} 
      className={`relative flex items-center justify-center overflow-hidden rounded-md bg-accent/5 ${className || ''}`}
    >
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
          <Loader2 className="h-6 w-6 animate-spin text-accent" />
        </div>
      )}
      <div 
        className="canvas-wrapper origin-center shadow-md bg-white"
        style={{ width: size.width, height: size.height }}
      >
        <canvas ref={canvasElRef} />
      </div>
    </div>
  );
}
