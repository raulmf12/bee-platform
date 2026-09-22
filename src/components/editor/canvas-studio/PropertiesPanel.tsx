// Painel direito de propriedades — aparece quando objeto e selecionado.
// Chunk 3: posicao, tamanho, rotacao, stroke pra shapes, border-radius p/ rect.

import {
  AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowDownToLine,
  ArrowUp, ArrowUpToLine, Bold, Circle as CircleIcon, Image as ImageIcon,
  Italic, Layers, Lock, LockOpen, Minus, Move,
  Paintbrush, RotateCcw, RotateCw, Square, Trash2, Type as TypeIcon,
} from 'lucide-react';
import type * as fabric from 'fabric';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import type { EditorApi } from './useEditor';
import { SlotSection } from './SlotSection';

const FONTS = ['Inter', 'Plus Jakarta Sans', 'Playfair Display', 'Georgia', 'Helvetica', 'Arial'];

// Helper: nome amigavel pro tipo
function prettyType(t?: string): string {
  switch (t) {
    case 'textbox':
    case 'i-text':
    case 'text': return 'Texto';
    case 'rect': return 'Retângulo';
    case 'circle': return 'Círculo';
    case 'triangle': return 'Triângulo';
    case 'line': return 'Linha';
    case 'path': return 'Forma';
    case 'image': return 'Imagem';
    case 'group': return 'Grupo';
    default: return t ?? 'Objeto';
  }
}

// Nome amigável pra cada camada. Usa o `name` que a Hive dá aos objetos
// (texture/headline/line/bee-spiral); senão cai pro tipo.
function layerName(o: fabric.Object): string {
  const raw = (o as unknown as { name?: string }).name;
  switch (raw) {
    case 'texture':
    case 'bg':
    case 'background': return 'Fundo';
    case 'headline':
    case 'quote': return 'Texto principal';
    case 'subtitle': return 'Subtítulo';
    case 'line': return 'Linha (detalhe)';
    case 'bee-spiral':
    case 'spiral': return 'Espiral Bee';
    case 'signature': return 'Assinatura';
    default: break;
  }
  if (raw && raw.trim()) return raw;
  return prettyType(o.type);
}

function LayerIcon({ type }: { type?: string }) {
  const cls = 'h-3.5 w-3.5 shrink-0';
  switch (type) {
    case 'textbox':
    case 'i-text':
    case 'text': return <TypeIcon className={cls} />;
    case 'image': return <ImageIcon className={cls} />;
    case 'circle': return <CircleIcon className={cls} />;
    case 'line': return <Minus className={cls} />;
    default: return <Square className={cls} />;
  }
}

// Lista de camadas clicável. Resolve o caso do detalhe fino (a "linha" de 3px)
// e da espiral, que são praticamente impossíveis de clicar no canvas: aqui você
// seleciona qualquer objeto pelo nome e aí move/edita/apaga pelo painel.
function LayersList({ api }: { api: EditorApi }) {
  const canvas = api.fabric.current;
  // Depende de activeObject/canvasEpoch pra re-renderizar quando a seleção ou os
  // objetos mudam (add/delete/reorder). getObjects() vem de baixo→topo; invertemos
  // pra mostrar o topo primeiro (ordem visual).
  void api.canvasEpoch;
  const objs = canvas ? [...canvas.getObjects()].reverse() : [];
  if (objs.length === 0) return null;
  return (
    <div className="space-y-0.5">
      {objs.map((o, i) => {
        const active = o === api.activeObject;
        return (
          <button
            key={(o as unknown as { name?: string }).name ?? `${o.type}-${i}`}
            onClick={() => api.selectObject(o)}
            title="Selecionar camada"
            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
              active ? 'bg-accent/15 text-accent ring-1 ring-accent/40' : 'hover:bg-accent/5 text-foreground'
            }`}
          >
            <LayerIcon type={o.type} />
            <span className="truncate">{layerName(o)}</span>
          </button>
        );
      })}
    </div>
  );
}

export function PropertiesPanel({ api, templateMode = false }: { api: EditorApi; templateMode?: boolean }) {
  const obj = api.activeObject;

  if (!obj) {
    return (
      <aside className="hidden w-72 shrink-0 border-l border-border bg-card/40 p-4 lg:flex lg:flex-col lg:gap-3">
        <div className="flex flex-col items-center gap-1 py-2 text-center">
          <Move className="h-5 w-5 text-muted-foreground" />
          <p className="text-xs font-medium text-muted-foreground">Nenhum objeto selecionado</p>
          <p className="text-[10px] text-muted-foreground/70">Clique em algo no canvas ou escolha uma camada abaixo.</p>
        </div>
        <Separator />
        <div>
          <Label className="mb-2 flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted-foreground">
            <Layers className="h-3 w-3" /> Camadas
          </Label>
          <LayersList api={api} />
        </div>
      </aside>
    );
  }

  const isText = obj.type === 'textbox' || obj.type === 'i-text' || obj.type === 'text';
  const isImage = obj.type === 'image';
  const isLine = obj.type === 'line';
  const isRect = obj.type === 'rect';
  const tb = obj as fabric.Textbox;

  // Tamanho visual (considerando scale)
  const visibleW = Math.round((obj.width ?? 0) * (obj.scaleX ?? 1));
  const visibleH = Math.round((obj.height ?? 0) * (obj.scaleY ?? 1));

  function setVisibleW(v: number) {
    const base = obj?.width ?? 1;
    api.updateActive({ scaleX: Math.max(0.01, v / base) });
  }
  function setVisibleH(v: number) {
    const base = obj?.height ?? 1;
    api.updateActive({ scaleY: Math.max(0.01, v / base) });
  }

  return (
    <aside className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto border-l border-border bg-card/40 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {prettyType(obj.type)}
        </span>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => api.updateActive({ selectable: !obj.selectable, evented: !obj.evented })}
            title={obj.selectable ? 'Travar' : 'Destravar'}
          >
            {obj.selectable ? <LockOpen className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5 text-accent" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={api.deleteActive} title="Apagar">
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      </div>

      {/* --------- SLOT (so no editor de templates) --------- */}
      {templateMode && <SlotSection api={api} />}

      {/* --------- TEXTO --------- */}
      {isText && (
        <>
          <div className="space-y-1">
            <Label className="text-[11px]">Fonte</Label>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={tb.fontFamily ?? 'Inter'}
              onChange={(e) => api.updateActive({ fontFamily: e.target.value })}
            >
              {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[11px]">Tamanho</Label>
              <Input
                type="number"
                value={tb.fontSize ?? 48}
                onChange={(e) => api.updateActive({ fontSize: Number(e.target.value) || 1 })}
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Cor</Label>
              <input
                type="color"
                className="h-9 w-full cursor-pointer rounded-md border border-input"
                value={(tb.fill as string) ?? '#000000'}
                onChange={(e) => api.updateActive({ fill: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px]">Espaço entre linhas</Label>
            <input
              type="range" min={0.8} max={2.5} step={0.05}
              value={tb.lineHeight ?? 1.16}
              onChange={(e) => api.updateActive({ lineHeight: Number(e.target.value) })}
              className="w-full accent-accent"
            />
          </div>

          <div className="flex flex-wrap gap-1">
            <Button
              variant={tb.fontWeight === 'bold' ? 'accent' : 'outline'}
              size="icon"
              onClick={() => api.updateActive({ fontWeight: tb.fontWeight === 'bold' ? 'normal' : 'bold' })}
              title="Negrito"
            >
              <Bold className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant={tb.fontStyle === 'italic' ? 'accent' : 'outline'}
              size="icon"
              onClick={() => api.updateActive({ fontStyle: tb.fontStyle === 'italic' ? 'normal' : 'italic' })}
              title="Italico"
            >
              <Italic className="h-3.5 w-3.5" />
            </Button>
            {(['left', 'center', 'right'] as const).map((al) => (
              <Button
                key={al}
                variant={tb.textAlign === al ? 'accent' : 'outline'}
                size="icon"
                onClick={() => api.updateActive({ textAlign: al })}
                title={`Alinhar ${al}`}
              >
                {al === 'left' && <AlignLeft className="h-3.5 w-3.5" />}
                {al === 'center' && <AlignCenter className="h-3.5 w-3.5" />}
                {al === 'right' && <AlignRight className="h-3.5 w-3.5" />}
              </Button>
            ))}
          </div>
        </>
      )}

      {/* --------- FORMA / LINHA --------- */}
      {!isText && !isImage && (
        <div className="space-y-2">
          {!isLine && (
            <div className="space-y-1">
              <Label className="text-[11px]">Preenchimento</Label>
              <input
                type="color"
                className="h-9 w-full cursor-pointer rounded-md border border-input"
                value={(obj.fill as string) ?? '#000000'}
                onChange={(e) => api.updateActive({ fill: e.target.value })}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[11px]">Borda</Label>
              <input
                type="color"
                className="h-9 w-full cursor-pointer rounded-md border border-input"
                value={(obj.stroke as string) ?? '#000000'}
                onChange={(e) => api.updateActive({ stroke: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Espessura</Label>
              <Input
                type="number"
                min={0}
                value={obj.strokeWidth ?? 0}
                onChange={(e) => api.updateActive({ strokeWidth: Math.max(0, Number(e.target.value)) })}
                className="h-9"
              />
            </div>
          </div>

          {isRect && (
            <div className="space-y-1">
              <Label className="text-[11px]">Cantos arredondados</Label>
              <input
                type="range" min={0} max={200} step={2}
                value={(obj as fabric.Rect).rx ?? 0}
                onChange={(e) => {
                  const r = Number(e.target.value);
                  api.updateActive({ rx: r, ry: r });
                }}
                className="w-full accent-accent"
              />
            </div>
          )}
        </div>
      )}

      {/* --------- IMAGEM (tint via BlendColor filter) --------- */}
      {isImage && <ImageTintControl api={api} obj={obj} />}

      {/* --------- POSICAO / TAMANHO / ROTACAO --------- */}
      <Separator />

      <div className="space-y-2">
        <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Posição</Label>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-0.5">
            <Label className="text-[10px] text-muted-foreground">X</Label>
            <Input
              type="number"
              value={Math.round(obj.left ?? 0)}
              onChange={(e) => api.updateActive({ left: Number(e.target.value) })}
              className="h-9"
            />
          </div>
          <div className="space-y-0.5">
            <Label className="text-[10px] text-muted-foreground">Y</Label>
            <Input
              type="number"
              value={Math.round(obj.top ?? 0)}
              onChange={(e) => api.updateActive({ top: Number(e.target.value) })}
              className="h-9"
            />
          </div>
        </div>
      </div>

      {!isLine && (
        <div className="space-y-2">
          <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Tamanho</Label>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-0.5">
              <Label className="text-[10px] text-muted-foreground">Largura</Label>
              <Input
                type="number"
                value={visibleW}
                onChange={(e) => setVisibleW(Number(e.target.value) || 1)}
                className="h-9"
              />
            </div>
            <div className="space-y-0.5">
              <Label className="text-[10px] text-muted-foreground">Altura</Label>
              <Input
                type="number"
                value={visibleH}
                onChange={(e) => setVisibleH(Number(e.target.value) || 1)}
                className="h-9"
              />
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted-foreground">
          <RotateCw className="h-3 w-3" />
          Rotação · {Math.round(obj.angle ?? 0)}°
        </Label>
        <input
          type="range" min={-180} max={180} step={1}
          value={obj.angle ?? 0}
          onChange={(e) => api.updateActive({ angle: Number(e.target.value) })}
          className="w-full accent-accent"
        />
      </div>

      <div className="space-y-1">
        <Label className="text-[11px]">Opacidade · {Math.round((obj.opacity ?? 1) * 100)}%</Label>
        <input
          type="range" min={0} max={1} step={0.05}
          value={obj.opacity ?? 1}
          onChange={(e) => api.updateActive({ opacity: Number(e.target.value) })}
          className="w-full accent-accent"
        />
      </div>

      <Separator />

      <div>
        <Label className="mb-2 flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted-foreground">
          <Layers className="h-3 w-3" /> Camadas
        </Label>
        <div className="mb-2">
          <LayersList api={api} />
        </div>
        <div className="grid grid-cols-4 gap-1">
          <Button variant="outline" size="icon" onClick={() => api.moveLayer('top')} title="Pro topo"><ArrowUpToLine className="h-3 w-3" /></Button>
          <Button variant="outline" size="icon" onClick={() => api.moveLayer('up')} title="Subir"><ArrowUp className="h-3 w-3" /></Button>
          <Button variant="outline" size="icon" onClick={() => api.moveLayer('down')} title="Descer"><ArrowDown className="h-3 w-3" /></Button>
          <Button variant="outline" size="icon" onClick={() => api.moveLayer('bottom')} title="Pro fundo"><ArrowDownToLine className="h-3 w-3" /></Button>
        </div>
      </div>
    </aside>
  );
}

// Controle de tint pra imagens. Aplica BlendColor filter no PNG —
// util pra trocar a cor da espiral Bee (honey original) por navy, branco, etc.
const SPIRAL_PRESETS: Array<{ label: string; hex: string | null }> = [
  { label: 'Original', hex: null },
  { label: 'Navy', hex: '#2D4A5C' },
  { label: 'Creme', hex: '#FAF6F0' },
  { label: 'Branco', hex: '#FFFFFF' },
];

function ImageTintControl({ api, obj }: { api: EditorApi; obj: fabric.FabricObject }) {
  const img = obj as fabric.FabricImage;
  const currentFilter = img.filters?.find(
    (f): f is fabric.filters.BlendColor =>
      (f as fabric.filters.BlendColor).type === 'BlendColor',
  );
  const currentHex = currentFilter?.color ?? null;

  return (
    <div className="space-y-2 pt-1">
      <Label className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted-foreground">
        <Paintbrush className="h-3 w-3" /> Cor da imagem
      </Label>

      <div className="flex flex-wrap gap-1.5">
        {SPIRAL_PRESETS.map((p) => {
          const active = currentHex === p.hex;
          return (
            <button
              key={p.label}
              onClick={() => api.tintActiveImage(p.hex)}
              title={p.label}
              className={`h-7 w-7 rounded-md border-2 transition-all ${
                active ? 'border-accent ring-1 ring-accent/40' : 'border-border'
              } ${p.hex === '#FFFFFF' ? 'bg-white' : ''}`}
              style={p.hex ? { backgroundColor: p.hex } : undefined}
            >
              {p.hex === null && <RotateCcw className="mx-auto h-3.5 w-3.5 text-muted-foreground" />}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="color"
          className="h-8 flex-1 cursor-pointer rounded-md border border-input"
          value={currentHex ?? '#E8A04C'}
          onChange={(e) => api.tintActiveImage(e.target.value)}
        />
        {currentHex && (
          <Button
            variant="outline"
            size="icon"
            onClick={() => api.tintActiveImage(null)}
            title="Remover cor"
            className="h-8 w-8"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground">
        Tinge a imagem com a cor escolhida (preserva o formato).
      </p>
    </div>
  );
}
