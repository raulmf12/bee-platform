// Toolbar superior do Canvas Studio.

import { ArrowLeft, Download, Maximize2, Minus, Plus, Redo2, Save, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { EditorApi } from './useEditor';
import { CANVAS_PRESETS } from './useEditor';

interface ToolbarProps {
  api: EditorApi;
  title: string;
  onTitleChange: (s: string) => void;
  onBack?: () => void;
  onSave?: () => void;
  saving?: boolean;
  preset: string;
  onPresetChange: (s: string) => void;
}

export function Toolbar({
  api, title, onTitleChange, onBack, onSave, saving, preset, onPresetChange,
}: ToolbarProps) {
  return (
    <header className="flex h-14 items-center gap-2 border-b border-border bg-card/80 px-3 backdrop-blur">
      {onBack && (
        <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </Button>
      )}

      <Input
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder="Sem título"
        className="h-8 max-w-xs border-transparent bg-transparent text-sm font-semibold focus-visible:border-input"
      />

      <Separator orientation="vertical" className="mx-1 h-6" />

      <Select value={preset} onValueChange={onPresetChange}>
        <SelectTrigger className="h-8 w-44 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(CANVAS_PRESETS).map(([key, p]) => (
            <SelectItem key={key} value={key} className="text-xs">{p.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Separator orientation="vertical" className="mx-1 h-6" />

      <Button
        variant="ghost" size="icon"
        onClick={() => void api.undo()}
        disabled={!api.canUndo}
        title="Desfazer (Cmd+Z)"
      >
        <Undo2 className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost" size="icon"
        onClick={() => void api.redo()}
        disabled={!api.canRedo}
        title="Refazer (Cmd+Shift+Z)"
      >
        <Redo2 className="h-4 w-4" />
      </Button>

      <Separator orientation="vertical" className="mx-1 h-6" />

      {/* Zoom controls */}
      <Button variant="ghost" size="icon" onClick={api.zoomOut} title="Diminuir zoom">
        <Minus className="h-4 w-4" />
      </Button>
      <button
        type="button"
        onClick={api.resetZoom}
        className="min-w-[52px] rounded-md px-2 py-1 text-xs font-mono tabular-nums text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        title="Reset zoom (ajustar à tela)"
      >
        {Math.round(api.zoom * 100)}%
      </button>
      <Button variant="ghost" size="icon" onClick={api.zoomIn} title="Aumentar zoom">
        <Plus className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" onClick={api.resetZoom} title="Ajustar à tela">
        <Maximize2 className="h-4 w-4" />
      </Button>

      <div className="ml-auto flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={api.downloadPng}>
          <Download className="h-4 w-4" /> PNG
        </Button>
        {onSave && (
          <Button variant="accent" size="sm" onClick={onSave} disabled={saving}>
            <Save className="h-4 w-4" />
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        )}
      </div>
    </header>
  );
}
