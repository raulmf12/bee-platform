// Inspetor de slot — so aparece no modo template.
//
// Marca o objeto selecionado como campo dinamico (o que a IA preenche) e define
// o que nao da pra deduzir do desenho: o que o campo significa e seus limites.
// Geometria, fonte e cor saem do proprio objeto na hora de salvar — voce
// posiciona a caixa, as regras seguem.

import { useRef } from 'react';
import { ImageUp, Zap, ZapOff } from 'lucide-react';
import type * as fabric from 'fabric';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { isTextType, slugifyKey, type BeeSlotMeta } from '@/lib/templates/slots';
import { fileToDataUrl, MAX_UPLOAD_BYTES } from '@/lib/templates/upload';
import { toast } from 'sonner';
import type { EditorApi } from './useEditor';

function slotOf(obj: fabric.Object | null): BeeSlotMeta | undefined {
  return (obj as unknown as { beeSlot?: BeeSlotMeta } | null)?.beeSlot;
}

export function SlotSection({ api }: { api: EditorApi }) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const obj = api.activeObject;
  if (!obj) return null;

  const isText = isTextType(obj.type);
  const isImage = obj.type === 'image' || obj.type === 'Image';
  // Só texto e imagem podem receber conteudo da IA. Formas sao sempre palco.
  if (!isText && !isImage) return null;

  const slot = slotOf(obj);
  const taken = api.listSlots().map((s) => s.meta.content_key).filter((k) => k !== slot?.content_key);

  function patch(changes: Partial<BeeSlotMeta>) {
    if (!slot) return;
    api.setActiveSlot({ ...slot, ...changes });
  }

  function enable() {
    const target = obj;
    if (!target) return;
    const tb = target as fabric.Textbox;
    const drawnFont = (tb.fontSize ?? 48) * (target.scaleY ?? 1);
    const label = isText ? 'Frase' : 'Imagem';
    const meta: BeeSlotMeta = {
      // A chave nasce do nome, mas depois nao muda mais: ela e o contrato com
      // a geracao. Renomear o rotulo nao pode quebrar o post.
      content_key: slugifyKey(label, taken),
      display_name: label,
      description: '',
      kind: isText ? 'text' : 'image',
      ...(isText
        ? {
            // O corpo que voce desenhou vira o teto; o motor so diminui dali.
            max_font_size: Math.round(drawnFont),
            min_font_size: Math.round(Math.max(12, drawnFont * 0.5)),
            max_lines: 4,
            balance: true,
            max_chars: 200,
            placeholder: tb.text || 'Sua frase aqui',
          }
        : {}),
    };
    api.setActiveSlot(meta);
  }

  async function pickSample(file: File | undefined) {
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
      await api.replaceActiveImage(await fileToDataUrl(file));
      toast.success('Imagem de exemplo trocada');
    } catch (e) {
      console.error(e);
      toast.error('Falha ao ler a imagem');
    }
  }

  if (!slot) {
    return (
      <>
        <div className="space-y-2 rounded-md border border-dashed border-border bg-secondary/30 p-2.5">
          <div className="flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[11px] font-semibold">Campo fixo</span>
          </div>
          <p className="text-[10px] leading-snug text-muted-foreground">
            Sai igual em todo post. Vire campo dinâmico pra a IA preencher.
          </p>
          <Button variant="outline" size="sm" className="w-full" onClick={enable}>
            <Zap className="h-3.5 w-3.5" /> Tornar campo dinâmico
          </Button>
        </div>
        <Separator />
      </>
    );
  }

  return (
    <>
      <div className="space-y-2.5 rounded-md border border-accent/50 bg-accent/10 p-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-accent" />
            <span className="text-[11px] font-semibold">Campo dinâmico</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            title="Voltar a ser campo fixo"
            onClick={() => api.setActiveSlot(null)}
          >
            <ZapOff className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="space-y-1">
          <Label className="text-[10px]">Nome do campo</Label>
          <Input
            value={slot.display_name}
            onChange={(e) => patch({ display_name: e.target.value })}
            className="h-8 text-xs"
            placeholder={slot.kind === 'text' ? 'Frase' : 'Imagem'}
          />
          <p className="font-mono text-[9px] text-muted-foreground">chave: {slot.content_key}</p>
        </div>

        {/* --------- DESCRICAO: o briefing do campo, escrito pra IA --------- */}
        <div className="space-y-1">
          <Label className="text-[10px]">
            {slot.kind === 'image' ? 'Objetivo da imagem' : 'O que vai aqui'}
          </Label>
          <Textarea
            rows={3}
            value={slot.description ?? ''}
            onChange={(e) => patch({ description: e.target.value })}
            className="text-xs"
            placeholder={
              slot.kind === 'image'
                ? 'Ex: foto do Marcos olhando pra câmera, fundo neutro, ar de quem acabou de entender algo.'
                : 'Ex: a frase de impacto do post, no olhar sistêmico, sem jargão corporativo.'
            }
          />
          <p className="text-[9px] leading-snug text-muted-foreground">
            Escreva pra IA, não pra tela. É isto que diz <em>o que</em> entra aqui — sem isso ela sabe
            onde pôr, mas não o quê.
          </p>
        </div>

        {/* --------- IMAGEM --------- */}
        {slot.kind === 'image' && (
          <div className="space-y-1.5">
            <Label className="text-[10px]">Imagem de exemplo</Label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                void pickSample(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => fileRef.current?.click()}
            >
              <ImageUp className="h-3.5 w-3.5" /> Trocar imagem
            </Button>
            <p className="text-[9px] leading-snug text-muted-foreground">
              Serve de referência no desenho. A IA troca por uma de verdade, respeitando o
              enquadramento que você deu.
            </p>
          </div>
        )}

        {/* --------- TEXTO --------- */}
        {slot.kind === 'text' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px]">Máx. linhas</Label>
                <Input
                  type="number"
                  min={1}
                  max={12}
                  value={slot.max_lines ?? 4}
                  onChange={(e) => patch({ max_lines: Math.max(1, Number(e.target.value) || 1) })}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Máx. caracteres</Label>
                <Input
                  type="number"
                  min={0}
                  value={slot.max_chars ?? 200}
                  onChange={(e) => patch({ max_chars: Math.max(0, Number(e.target.value) || 0) })}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-[10px]">
                Fonte: de {slot.min_font_size ?? 30} a {slot.max_font_size ?? 60} px
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="number"
                  min={8}
                  value={slot.min_font_size ?? 30}
                  onChange={(e) => patch({ min_font_size: Math.max(8, Number(e.target.value) || 8) })}
                  className="h-8 text-xs"
                  title="Menor corpo aceitável"
                />
                <Input
                  type="number"
                  min={8}
                  value={slot.max_font_size ?? 60}
                  onChange={(e) => patch({ max_font_size: Math.max(8, Number(e.target.value) || 8) })}
                  className="h-8 text-xs"
                  title="Maior corpo aceitável"
                />
              </div>
              <p className="text-[9px] leading-snug text-muted-foreground">
                O motor usa o maior corpo que couber nas linhas. Frase longa encolhe até o mínimo.
              </p>
            </div>

            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={slot.balance ?? true}
                onChange={(e) => patch({ balance: e.target.checked })}
                className="mt-0.5 accent-accent"
              />
              <span className="text-[10px] leading-snug">
                <span className="font-medium">Equilibrar linhas</span>
                <br />
                <span className="text-muted-foreground">
                  Distribui as palavras pra as linhas ficarem com larguras parecidas.
                </span>
              </span>
            </label>

            <div className="space-y-1">
              <Label className="text-[10px]">Texto de exemplo</Label>
              <Input
                value={slot.placeholder ?? ''}
                onChange={(e) => patch({ placeholder: e.target.value })}
                className="h-8 text-xs"
                placeholder="Sua frase aqui"
              />
            </div>
          </>
        )}
      </div>
      <Separator />
    </>
  );
}
