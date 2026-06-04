// Mini-toolbar usada no modo embedded (PostEditor).
// Subset da Toolbar normal: preset + undo/redo + zoom + download.
// Sem campo de titulo, sem botao back/save (vem do parent — PostEditor).

import { Download, Maximize2, Minus, Plus, Redo2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { EditorApi } from './useEditor';
import { CANVAS_PRESETS } from './useEditor';

interface EmbeddedToolbarProps {
  api: EditorApi;
  preset: string;
  onPresetChange: (s: string) => void;
}

export function EmbeddedToolbar({ api, preset, onPresetChange }: EmbeddedToolbarProps) {
  return (
    <div className="flex items-center gap-1 border-b border-border bg-card/60 px-2 py-1.5 backdrop-blur">
      <Select value={preset} onValueChange={onPresetChange}>
        <SelectTrigger className="h-7 w-40 text-[11px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(CANVAS_PRESETS).map(([key, p]) => (
            <SelectItem key={key} value={key} className="text-xs">{p.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Separator orientation="vertical" className="mx-0.5 h-5" />

      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void api.undo()} disabled={!api.canUndo} title="Desfazer (Cmd+Z)">
        <Undo2 className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void api.redo()} disabled={!api.canRedo} title="Refazer">
        <Redo2 className="h-3.5 w-3.5" />
      </Button>

      <Separator orientation="vertical" className="mx-0.5 h-5" />

      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={api.zoomOut} title="Diminuir zoom">
        <Minus className="h-3.5 w-3.5" />
      </Button>
      <button
        type="button"
        onClick={api.resetZoom}
        className="min-w-[44px] rounded px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        title="Ajustar à tela"
      >
        {Math.round(api.zoom * 100)}%
      </button>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={api.zoomIn} title="Aumentar zoom">
        <Plus className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={api.resetZoom} title="Ajustar à tela">
        <Maximize2 className="h-3.5 w-3.5" />
      </Button>

      <div className="ml-auto">
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-[11px]" onClick={api.downloadPng} title="Download PNG">
          <Download className="h-3 w-3" /> PNG
        </Button>
      </div>
    </div>
  );
}
