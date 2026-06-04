// Container principal do Canvas Studio.
// Layout standalone: [Toolbar topo] / [Sidebar L | Painel ativo | Canvas | Properties R]
// Layout embedded:   [MiniToolbar] / [Sidebar L | Painel ativo | Canvas | Properties R]
//                    (sem h-screen — herda altura do parent)

import { useEffect, useRef, useState } from 'react';
import { Toolbar } from './Toolbar';
import { EmbeddedToolbar } from './EmbeddedToolbar';
import { SidebarLeft, type PanelKey } from './SidebarLeft';
import { CanvasArea } from './CanvasArea';
import { PropertiesPanel } from './PropertiesPanel';
import { TemplatesPanel } from './panels/TemplatesPanel';
import { TextPanel } from './panels/TextPanel';
import { ElementsPanel } from './panels/ElementsPanel';
import { UploadsPanel } from './panels/UploadsPanel';
import { BrandPanel } from './panels/BrandPanel';
import { useEditor, CANVAS_PRESETS } from './useEditor';

export interface CanvasStudioChangeState {
  fabricJson: object;
  dataUrl: string;
}

interface CanvasStudioProps {
  initialPreset?: string;
  initialFabricJson?: object;
  onBack?: () => void;
  onSave?: (state: { fabricJson: object; dataUrl: string; title: string }) => Promise<void> | void;
  onChange?: (state: CanvasStudioChangeState) => void;
  /**
   * Embedded mode: usado quando CanvasStudio vive dentro de outra pagina (ex: PostEditor).
   * - Esconde a Toolbar principal (back/title/save) — quem hospeda fornece esses controles
   * - Mostra uma mini-toolbar interna (preset/undo/redo/zoom/download)
   * - Layout sem h-screen — herda altura do parent
   */
  embedded?: boolean;
}

export function CanvasStudio({
  initialPreset = 'linkedin-portrait',
  initialFabricJson,
  onBack,
  onSave,
  onChange,
  embedded = false,
}: CanvasStudioProps) {
  const [preset, setPreset] = useState(initialPreset);
  const size = CANVAS_PRESETS[preset] ?? CANVAS_PRESETS['linkedin-portrait'];
  const [title, setTitle] = useState('Sem título');
  // Em embedded, comeca sem painel aberto pra economizar largura.
  const [activePanel, setActivePanel] = useState<PanelKey>(embedded ? null : 'templates');
  const [saving, setSaving] = useState(false);
  const [lastState, setLastState] = useState<CanvasStudioChangeState | null>(null);

  const api = useEditor({
    width: size.width,
    height: size.height,
    onChange: (s) => {
      setLastState(s);
      onChange?.(s);
    },
  });

  // Carrega initialFabricJson UMA UNICA VEZ por instancia do CanvasStudio.
  // Usar useRef estavel (nao prop em api, que se recria a cada render — bug
  // que fazia re-load do canvas a cada selecao e roubava a selecao).
  // Pra trocar de post, o parent usa key={post.id} → remonta tudo e carrega de novo.
  // Dep em initialFabricJson cobre o caso "prop chega num render posterior"
  // (ex: PostEditor carrega post async), mas loadedJsonRef garante carga unica.
  const loadedJsonRef = useRef(false);
  useEffect(() => {
    if (!initialFabricJson) return;
    if (loadedJsonRef.current) return;
    let cancelled = false;
    const tryLoad = () => {
      if (cancelled) return;
      if (api.fabric.current) {
        loadedJsonRef.current = true;
        void api.loadFromJson(initialFabricJson);
      } else {
        setTimeout(tryLoad, 50);
      }
    };
    tryLoad();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFabricJson]);

  async function handleSave() {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave({
        fabricJson: lastState?.fabricJson ?? api.fabric.current?.toJSON() ?? {},
        dataUrl: lastState?.dataUrl ?? api.exportPng(1) ?? '',
        title,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={embedded ? 'flex h-full flex-col bg-background' : 'flex h-screen flex-col bg-background'}>
      {embedded ? (
        <EmbeddedToolbar api={api} preset={preset} onPresetChange={setPreset} />
      ) : (
        <Toolbar
          api={api}
          title={title}
          onTitleChange={setTitle}
          onBack={onBack}
          onSave={onSave ? handleSave : undefined}
          saving={saving}
          preset={preset}
          onPresetChange={setPreset}
        />
      )}

      <div className="flex flex-1 overflow-hidden">
        <SidebarLeft active={activePanel} onChange={setActivePanel} />

        {/* Painel ativo (slide-in) */}
        {activePanel && (
          <div className="w-72 shrink-0 border-r border-border bg-card/40 overflow-y-auto">
            {activePanel === 'templates' && <TemplatesPanel api={api} />}
            {activePanel === 'text' && <TextPanel api={api} />}
            {activePanel === 'elements' && <ElementsPanel api={api} />}
            {activePanel === 'uploads' && <UploadsPanel api={api} />}
            {activePanel === 'brand' && <BrandPanel api={api} />}
          </div>
        )}

        <CanvasArea api={api} width={size.width} height={size.height} />

        <PropertiesPanel api={api} />
      </div>
    </div>
  );
}
