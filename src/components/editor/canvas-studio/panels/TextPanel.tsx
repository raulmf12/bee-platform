// Painel de texto: presets prontos + galeria de fontes.

import { Type } from 'lucide-react';
import type { EditorApi } from '../useEditor';

const PRESETS: Array<{ label: string; preview: string; opts: object; size: string }> = [
  {
    label: 'Adicionar título',
    preview: 'Título',
    size: 'text-2xl font-bold',
    opts: { fontSize: 96, fontFamily: 'Plus Jakarta Sans', fontWeight: 'bold', fill: '#2D4A5C' },
  },
  {
    label: 'Adicionar subtítulo',
    preview: 'Subtítulo',
    size: 'text-lg font-semibold',
    opts: { fontSize: 56, fontFamily: 'Plus Jakarta Sans', fontWeight: '600', fill: '#2D4A5C' },
  },
  {
    label: 'Frase de impacto',
    preview: 'Frase em destaque',
    size: 'text-base font-bold italic',
    opts: { fontSize: 60, fontFamily: 'Playfair Display', fontWeight: 'bold', fill: '#2D4A5C', textAlign: 'center' },
  },
  {
    label: 'Adicionar parágrafo',
    preview: 'Texto corpo do post',
    size: 'text-xs',
    opts: { fontSize: 28, fontFamily: 'Inter', fontWeight: 'normal', fill: '#1A2A35' },
  },
  {
    label: 'Pequeno / legenda',
    preview: 'Legenda menor',
    size: 'text-[10px] text-muted-foreground',
    opts: { fontSize: 20, fontFamily: 'Inter', fontWeight: 'normal', fill: '#5C6E78' },
  },
];

const FONTS = [
  'Playfair Display',
  'Plus Jakarta Sans',
  'Inter',
  'Georgia',
  'Helvetica',
  'Arial',
  'Times New Roman',
  'Courier New',
];

export function TextPanel({ api }: { api: EditorApi }) {
  const activeIsText = api.activeObject &&
    (api.activeObject.type === 'textbox' || api.activeObject.type === 'i-text' || api.activeObject.type === 'text');

  return (
    <div className="space-y-4 p-3">
      <div className="flex items-center gap-2 px-1">
        <Type className="h-3.5 w-3.5 text-accent" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Texto</h3>
      </div>

      <div className="space-y-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => api.addText(p.preview, p.opts)}
            className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-card p-2.5 text-left transition-all hover:border-accent hover:shadow-sm"
          >
            <span className={p.size}>{p.preview}</span>
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground shrink-0">+</span>
          </button>
        ))}
      </div>

      <div className="space-y-1.5 pt-3 border-t border-border">
        <p className="px-1 text-[10px] uppercase tracking-wider text-muted-foreground">Fontes</p>
        <div className="grid grid-cols-1 gap-1">
          {FONTS.map((f) => (
            <button
              key={f}
              onClick={() => {
                if (activeIsText) {
                  api.updateActive({ fontFamily: f });
                } else {
                  api.addText('Texto', { fontFamily: f, fontSize: 48, fill: '#2D4A5C' });
                }
              }}
              className="rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-secondary"
              style={{ fontFamily: f }}
            >
              {f}
            </button>
          ))}
        </div>
        <p className="px-1 pt-1 text-[10px] text-muted-foreground">
          {activeIsText
            ? '✏️ Selecionado um texto — fonte muda o estilo dele.'
            : '💡 Click numa fonte adiciona texto novo nela.'}
        </p>
      </div>
    </div>
  );
}
