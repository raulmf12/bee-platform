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
import { SlotsPanel } from './panels/SlotsPanel';
import { TextPanel } from './panels/TextPanel';
import { ElementsPanel } from './panels/ElementsPanel';
import { UploadsPanel } from './panels/UploadsPanel';
import { BrandPanel } from './panels/BrandPanel';
import { TemplatePreviewBar } from './TemplatePreviewBar';
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
  /**
   * Template mode: usado no editor de templates (/templates/:id).
   * - Mostra o inspetor de slots (marcar campo dinamico) e a lista de campos
   * - Mostra a barra de teste (ver o template com frase curta/longa)
   * - Troca a galeria de templates pelo painel de campos
   */
  templateMode?: boolean;
  initialTitle?: string;
}

export function CanvasStudio({
  initialPreset = 'linkedin-portrait',
  initialFabricJson,
  onBack,
  onSave,
  onChange,
  embedded = false,
  templateMode = false,
  initialTitle,
}: CanvasStudioProps) {
  const [preset, setPreset] = useState(initialPreset);
  const size = CANVAS_PRESETS[preset] ?? CANVAS_PRESETS['linkedin-portrait'];
  const [title, setTitle] = useState(initialTitle ?? 'Sem título');
  // Em embedded, comeca sem painel aberto pra economizar largura.
  const [activePanel, setActivePanel] = useState<PanelKey>(
    embedded ? null : templateMode ? 'slots' : 'templates',
  );
  const [saving, setSaving] = useState(false);
  const [lastState, setLastState] = useState<CanvasStudioChangeState | null>(null);
  // Modo template: enquanto o preview esta ligado o canvas mostra o texto de
  // exemplo hidratado, mas o desenho de verdade fica aqui — e e ele que salva.
  const [previewing, setPreviewing] = useState(false);
  const designSnapshotRef = useRef<object | null>(null);

  const api = useEditor({
    width: size.width,
    height: size.height,
    onChange: (s) => {
      setLastState(s);
      onChange?.(s);
    },
  });

  // Carrega initialFabricJson uma vez POR CANVAS — nao por instancia do
  // componente. Em StrictMode o React monta, descarta e remonta: a trava
  // "ja carreguei" presa ao componente fazia o conteudo ir pro canvas
  // descartado e o visivel ficar vazio (so nao aparecia quando a prop chegava
  // async, depois da remontagem — por isso o PostEditor escapava e o editor de
  // template, que espera tudo antes de montar, caia direto na corrida).
  // canvasEpoch muda a cada canvas novo, entao a carga acompanha.
  const loadedEpochRef = useRef<number>(-1);
  useEffect(() => {
    if (!initialFabricJson) return;
    if (!api.fabric.current) return;
    if (loadedEpochRef.current === api.canvasEpoch) return;
    loadedEpochRef.current = api.canvasEpoch;
    void api.loadFromJson(initialFabricJson);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFabricJson, api.canvasEpoch]);

  async function handleSave() {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave({
        // designSnapshotRef so tem valor durante o preview — nesse caso o canvas
        // esta exibindo a frase de exemplo, e salvar isso apagaria os slots.
        fabricJson: designSnapshotRef.current ?? lastState?.fabricJson ?? api.toJson(),
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

      {templateMode && (
        <TemplatePreviewBar
          api={api}
          width={size.width}
          height={size.height}
          previewing={previewing}
          setPreviewing={setPreviewing}
          designSnapshotRef={designSnapshotRef}
        />
      )}

      <div className="flex flex-1 overflow-hidden">
        <SidebarLeft active={activePanel} onChange={setActivePanel} templateMode={templateMode} />

        {/* Painel ativo (slide-in) */}
        {activePanel && (
          <div className="w-72 shrink-0 border-r border-border bg-card/40 overflow-y-auto">
            {activePanel === 'templates' && <TemplatesPanel api={api} />}
            {activePanel === 'slots' && <SlotsPanel api={api} />}
            {activePanel === 'text' && <TextPanel api={api} />}
            {activePanel === 'elements' && <ElementsPanel api={api} />}
            {activePanel === 'uploads' && <UploadsPanel api={api} />}
            {activePanel === 'brand' && <BrandPanel api={api} />}
          </div>
        )}

        <CanvasArea api={api} width={size.width} height={size.height} />

        <PropertiesPanel api={api} templateMode={templateMode} />
      </div>
    </div>
  );
}
