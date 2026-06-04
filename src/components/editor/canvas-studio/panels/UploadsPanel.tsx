// Painel de uploads: drag-drop de imagens + galeria local recente.
// Persistencia: localStorage (ultimas 12 imagens, dataURL).
// Pra Chunk 4 evoluimos pra salvar no Supabase Storage por usuario.

import { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { EditorApi } from '../useEditor';

const LS_KEY = 'bee_canvas_uploads_v1';
const MAX_ITEMS = 12;
const MAX_BYTES = 4 * 1024 * 1024; // 4MB por imagem (limite de dataURL no LS)

interface UploadItem {
  id: string;
  dataUrl: string;
  name: string;
  size: number;
  addedAt: number;
}

function loadUploads(): UploadItem[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as UploadItem[];
  } catch {
    return [];
  }
}

function saveUploads(items: UploadItem[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(items));
  } catch (e) {
    console.warn('[uploads] localStorage cheio', e);
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function UploadsPanel({ api }: { api: EditorApi }) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setItems(loadUploads());
  }, []);

  async function handleFiles(files: FileList | File[]) {
    const arr = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (!arr.length) {
      toast.error('Selecione um arquivo de imagem.');
      return;
    }
    for (const file of arr) {
      if (file.size > MAX_BYTES) {
        toast.error(`"${file.name}" > 4MB — comprime antes.`);
        continue;
      }
      try {
        const dataUrl = await fileToDataUrl(file);
        const item: UploadItem = {
          id: `${file.name}-${file.size}-${file.lastModified}`,
          dataUrl,
          name: file.name,
          size: file.size,
          addedAt: Date.now(),
        };
        setItems((prev) => {
          const dedup = prev.filter((p) => p.id !== item.id);
          const next = [item, ...dedup].slice(0, MAX_ITEMS);
          saveUploads(next);
          return next;
        });
        await api.addImageFromUrl(dataUrl);
      } catch (e) {
        console.error('[uploads]', e);
        toast.error(`Falha lendo "${file.name}".`);
      }
    }
  }

  function removeItem(id: string) {
    setItems((prev) => {
      const next = prev.filter((p) => p.id !== id);
      saveUploads(next);
      return next;
    });
  }

  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center gap-2 px-1">
        <Upload className="h-3.5 w-3.5 text-accent" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Uploads</h3>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files?.length) void handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'cursor-pointer rounded-md border-2 border-dashed p-4 text-center transition-colors',
          dragOver ? 'border-accent bg-accent/10' : 'border-border bg-card hover:border-accent/60',
        )}
      >
        <ImageIcon className="mx-auto mb-1.5 h-5 w-5 text-muted-foreground" />
        <p className="text-xs font-medium">Solte aqui ou clique</p>
        <p className="mt-0.5 text-[10px] text-muted-foreground">PNG, JPG, WebP • até 4MB</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {/* Galeria */}
      {items.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <p className="px-1 text-[10px] uppercase tracking-wider text-muted-foreground">Recentes</p>
          <div className="grid grid-cols-3 gap-1.5">
            {items.map((it) => (
              <div key={it.id} className="group relative aspect-square overflow-hidden rounded-md border border-border bg-card">
                <button
                  onClick={() => void api.addImageFromUrl(it.dataUrl)}
                  className="absolute inset-0"
                  title={it.name}
                >
                  <img src={it.dataUrl} alt={it.name} className="h-full w-full object-cover" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeItem(it.id);
                  }}
                  className="absolute right-1 top-1 rounded bg-background/80 p-1 opacity-0 transition-opacity hover:bg-destructive hover:text-destructive-foreground group-hover:opacity-100"
                  title="Remover"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {items.length === 0 && (
        <p className="px-1 text-[10px] text-muted-foreground">
          Imagens enviadas ficam disponíveis aqui pra reusar.
        </p>
      )}
    </div>
  );
}
