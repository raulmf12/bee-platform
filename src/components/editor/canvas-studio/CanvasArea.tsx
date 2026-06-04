// Area do canvas centralizada com fundo dimmed.
// ZOOM via CSS transform: scale() — canvas mantem tamanho nativo, wrapper escala visual.
//   - outer:   width*zoom x height*zoom (afeta layout, ocupa espaco real escalado)
//   - inner:   width x height + transform scale(zoom) (visual)
//   - canvas:  width x height nativo (Fabric hit-test perfeito)

import { useCallback, useEffect, useRef } from 'react';
import type * as fabric from 'fabric';
import type { EditorApi } from './useEditor';

interface CanvasAreaProps {
  api: EditorApi;
  width: number;
  height: number;
}

export function CanvasArea({ api, width, height }: CanvasAreaProps) {
  // Ref estavel — nao muda entre renders, evita o ciclo
  // (attach/dispose a cada re-render causado por evento do Fabric).
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const attachRef = useRef(api.attach);
  attachRef.current = api.attach;

  // Anexa uma vez ao montar; dispose ao desmontar de verdade
  useEffect(() => {
    if (canvasElRef.current) attachRef.current(canvasElRef.current);
    return () => attachRef.current(null);
  }, []);

  // Atalhos de teclado
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null;
      const isField = tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable);
      const obj = api.fabric.current?.getActiveObject();
      const editingText = !!(obj && (obj as fabric.IText).isEditing);

      if (!isField && !editingText && (e.key === 'Delete' || e.key === 'Backspace')) {
        if (obj) { e.preventDefault(); api.deleteActive(); }
        return;
      }
      const meta = e.metaKey || e.ctrlKey;
      if (!meta || editingText) return;
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); void api.undo(); }
      else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') { e.preventDefault(); void api.redo(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [api]);

  // Zoom via Cmd/Ctrl + scroll
  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      api.setZoom(api.zoom * factor);
    },
    [api],
  );

  const scaledWidth = width * api.zoom;
  const scaledHeight = height * api.zoom;

  return (
    <div className="relative flex flex-1 min-w-0 flex-col bg-secondary/40">
      <div
        ref={api.containerRef}
        onWheel={onWheel}
        className="relative flex flex-1 items-center justify-center overflow-auto p-4"
      >
        {/* Outer: ocupa o espaco do canvas escalado no layout */}
        <div
          className="relative shrink-0"
          style={{ width: scaledWidth, height: scaledHeight }}
        >
          {/* Inner: tamanho nativo + transform scale (escala visual) */}
          <div
            className="absolute left-0 top-0 origin-top-left rounded-md bg-white shadow-2xl ring-1 ring-black/10"
            style={{
              width,
              height,
              transform: `scale(${api.zoom})`,
            }}
          >
            <canvas ref={canvasElRef} />
          </div>
        </div>
      </div>

      {/* badge de dimensoes */}
      <div className="pointer-events-none absolute bottom-3 left-3 rounded-md border border-border bg-card/90 px-2 py-1 text-[10px] font-mono text-muted-foreground backdrop-blur">
        {width} × {height} · {Math.round(api.zoom * 100)}%
      </div>
    </div>
  );
}
