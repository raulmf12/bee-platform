// Barra de teste do editor de templates.
//
// Roda o motor de layout no desenho atual com uma frase de exemplo — voce ve o
// template se defender de um texto grande ANTES de salvar. Sem isso, so daria
// pra descobrir que a frase vaza depois que a IA gerou o post.
//
// O desenho fica guardado em designSnapshotRef enquanto o preview esta ligado:
// o canvas mostra o texto hidratado, mas quem salva le o snapshot. Assim clicar
// em salvar durante o teste nao grava a frase de exemplo por cima do template.

import type { MutableRefObject } from 'react';
import { Eye, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { buildTemplateParts } from '@/lib/templates/slots';
import { ensureTemplateFontsLoaded, hydrateTemplate } from '@/lib/templates/hydrate';
import type { TemplateConfig } from '@/types';
import { cn } from '@/lib/utils';
import type { EditorApi } from './useEditor';

const SAMPLES: Array<{ label: string; text: string }> = [
  { label: 'Curta', text: 'Lidere uma oitava acima.' },
  { label: 'Média', text: 'Nao existe pessoa dificil. Existe sistema que produz o comportamento dificil.' },
  {
    label: 'Longa',
    text: 'Voce nao gerencia pessoas, voce gerencia as condicoes em que as pessoas decidem. Mude as condicoes e o comportamento muda junto, sem precisar de discurso nem de heroismo.',
  },
];

interface Props {
  api: EditorApi;
  width: number;
  height: number;
  previewing: boolean;
  setPreviewing: (v: boolean) => void;
  designSnapshotRef: MutableRefObject<object | null>;
}

export function TemplatePreviewBar({
  api,
  width,
  height,
  previewing,
  setPreviewing,
  designSnapshotRef,
}: Props) {
  const slotCount = api.listSlots().length;

  async function runPreview(sample: string) {
    // Só tira o snapshot na ENTRADA: reentrar sobrescreveria o desenho pelo
    // preview anterior.
    if (!previewing) designSnapshotRef.current = api.toJson();
    const design = designSnapshotRef.current;
    if (!design) return;

    const { slideJson, fields } = buildTemplateParts(design, width, height);
    const config: TemplateConfig = {
      width,
      height,
      slides_json: [slideJson],
      slides: { slide1: { name: 'Slide 1', fields } },
    };
    await ensureTemplateFontsLoaded(config);

    const values = Object.fromEntries(
      fields.filter((f) => f.type === 'text').map((f) => [f.content_key, sample]),
    );
    await api.loadFromJson(hydrateTemplate(config, values));
    setPreviewing(true);
  }

  async function backToDesign() {
    const design = designSnapshotRef.current;
    if (design) await api.loadFromJson(design);
    designSnapshotRef.current = null;
    setPreviewing(false);
  }

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 border-b px-4 py-2',
        previewing ? 'border-accent/40 bg-accent/10' : 'border-border bg-card/40',
      )}
    >
      <div className="flex items-center gap-1.5">
        <Eye className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">Testar com</span>
      </div>

      {SAMPLES.map((s) => (
        <Button
          key={s.label}
          variant="outline"
          size="sm"
          disabled={slotCount === 0}
          onClick={() => void runPreview(s.text)}
          title={s.text}
        >
          {s.label}
        </Button>
      ))}

      {previewing && (
        <Button variant="accent" size="sm" onClick={() => void backToDesign()}>
          <Pencil className="h-3.5 w-3.5" /> Voltar ao desenho
        </Button>
      )}

      <span className="ml-auto text-[10px] text-muted-foreground">
        {slotCount === 0
          ? 'Marque um campo dinâmico pra poder testar'
          : previewing
            ? 'Pré-visualização — o que você salvar é o desenho, não este texto'
            : `${slotCount} campo${slotCount > 1 ? 's' : ''} dinâmico${slotCount > 1 ? 's' : ''}`}
      </span>
    </div>
  );
}
