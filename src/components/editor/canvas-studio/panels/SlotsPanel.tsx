// Painel de slots — so no modo template.
// Lista o que a IA preenche vs o que e palco fixo, e leva ao objeto no canvas.

import { useRef } from 'react';
import { ImagePlus, Type, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { slugifyKey, type BeeSlotMeta } from '@/lib/templates/slots';
import { fileToDataUrl, MAX_UPLOAD_BYTES } from '@/lib/templates/upload';
import { toast } from 'sonner';
import type { EditorApi } from '../useEditor';

export function SlotsPanel({ api }: { api: EditorApi }) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const slots = api.listSlots();
  const active = api.activeObject as unknown as { beeSlot?: BeeSlotMeta } | null;
  const taken = slots.map((s) => s.meta.content_key);

  // Sobe a imagem de exemplo E ja cria o campo: e o mesmo gesto.
  async function addImageSlot(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Selecione um arquivo de imagem.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error(`"${file.name}" passa de 4MB — comprime antes.`);
      return;
    }
    try {
      await api.addImageFromUrl(await fileToDataUrl(file));
      // addImageFromUrl ja deixa a nova imagem selecionada.
      api.setActiveSlot({
        content_key: slugifyKey('Imagem', taken),
        display_name: 'Imagem',
        description: '',
        kind: 'image',
      });
      toast.success('Campo de imagem criado — descreva o objetivo dela ao lado');
    } catch (e) {
      console.error(e);
      toast.error('Falha ao ler a imagem');
    }
  }

  function addTextSlot() {
    api.addText('Sua frase aqui', { fontSize: 60, fontFamily: 'Playfair Display' });
    api.setActiveSlot({
      content_key: slugifyKey('Frase', taken),
      display_name: 'Frase',
      description: '',
      kind: 'text',
      max_font_size: 60,
      min_font_size: 30,
      max_lines: 4,
      balance: true,
      max_chars: 200,
      placeholder: 'Sua frase aqui',
    });
  }

  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center gap-2 px-1">
        <Zap className="h-3.5 w-3.5 text-accent" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Campos dinâmicos
        </h3>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <Button variant="outline" size="sm" onClick={addTextSlot}>
          <Type className="h-3.5 w-3.5" /> Texto
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            void addImageSlot(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
          <ImagePlus className="h-3.5 w-3.5" /> Imagem
        </Button>
      </div>

      {slots.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-3">
          <p className="text-[11px] leading-snug text-muted-foreground">
            Nenhum campo ainda. Crie um acima, ou selecione um texto/imagem que já está no canvas e
            marque como <span className="font-medium text-foreground">campo dinâmico</span> — é o que a
            IA vai preencher em cada post.
          </p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {slots.map(({ meta, obj }) => {
            const isActive = active?.beeSlot?.content_key === meta.content_key;
            const semDescricao = !meta.description?.trim();
            return (
              <li key={meta.content_key}>
                <button
                  onClick={() => api.selectObject(obj)}
                  className={cn(
                    'w-full rounded-md border p-2 text-left transition-colors',
                    isActive
                      ? 'border-accent bg-accent/15'
                      : 'border-border hover:border-accent/50 hover:bg-secondary',
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <Zap className="h-3 w-3 shrink-0 text-accent" />
                    <span className="truncate text-xs font-medium">{meta.display_name}</span>
                    <span className="ml-auto shrink-0 text-[9px] uppercase text-muted-foreground">
                      {meta.kind === 'image' ? 'imagem' : 'texto'}
                    </span>
                  </div>
                  {meta.description?.trim() ? (
                    <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-muted-foreground">
                      {meta.description}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-[10px] italic text-amber-600 dark:text-amber-500">
                      Sem descrição — a IA não sabe o que pôr aqui
                    </p>
                  )}
                  <p className="mt-0.5 font-mono text-[9px] text-muted-foreground">
                    {meta.content_key}
                    {meta.kind === 'text' && ` · até ${meta.max_lines ?? 4} linhas`}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {slots.length > 0 && semDescricaoCount(slots) > 0 && (
        <p className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-[10px] leading-snug">
          {semDescricaoCount(slots)} campo(s) sem descrição. A descrição é o briefing que a IA lê pra
          saber o que gerar.
        </p>
      )}

      <p className="px-1 text-[10px] leading-snug text-muted-foreground">
        O resto do desenho é palco: sai igual em todo post.
      </p>
    </div>
  );
}

function semDescricaoCount(slots: Array<{ meta: BeeSlotMeta }>): number {
  return slots.filter((s) => !s.meta.description?.trim()).length;
}
