// Galeria de templates Bee. Click aplica template no canvas.

import { Sparkles } from 'lucide-react';
import { hydrateBeeQuote, BEE_SPIRAL_URL } from '@/lib/templates/beeQuote';
import { cn } from '@/lib/utils';
import type { EditorApi } from '../useEditor';

interface TemplateItem {
  id: string;
  name: string;
  description: string;
  aspect: '4/5' | '1/1' | '9/16';
  sizeId: 'portrait' | 'square' | 'landscape';
  buildJson: () => object;
}

const TEMPLATES: TemplateItem[] = [
  {
    id: 'bee-quote-portrait',
    name: 'Bee Quote 4:5',
    description: 'LinkedIn / IG retrato',
    aspect: '4/5',
    sizeId: 'portrait',
    buildJson: () => hydrateBeeQuote({ quote: 'Sua frase aqui', sizeId: 'portrait' }),
  },
  {
    id: 'bee-quote-square',
    name: 'Bee Quote 1:1',
    description: 'IG / LinkedIn quadrado',
    aspect: '1/1',
    sizeId: 'square',
    buildJson: () => hydrateBeeQuote({ quote: 'Sua frase aqui', sizeId: 'square' }),
  },
  {
    id: 'bee-blank-portrait',
    name: 'Em branco 4:5',
    description: 'Começo do zero',
    aspect: '4/5',
    sizeId: 'portrait',
    buildJson: () => ({ version: '6.0.0', background: '#FFFFFF', objects: [] }),
  },
  {
    id: 'bee-blank-square',
    name: 'Em branco 1:1',
    description: 'Quadrado do zero',
    aspect: '1/1',
    sizeId: 'square',
    buildJson: () => ({ version: '6.0.0', background: '#FFFFFF', objects: [] }),
  },
];

export function TemplatesPanel({ api }: { api: EditorApi }) {
  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center gap-2 px-1">
        <Sparkles className="h-3.5 w-3.5 text-accent" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Templates Bee
        </h3>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {TEMPLATES.map((t) => (
          <button
            key={t.id}
            onClick={() => void api.loadFromJson(t.buildJson())}
            className="group flex flex-col gap-1.5 rounded-lg border border-border bg-card p-2 text-left transition-all hover:border-accent hover:shadow-md"
          >
            <div
              className={cn(
                'w-full overflow-hidden rounded border border-border bg-white relative',
                t.aspect === '4/5' && 'aspect-[4/5]',
                t.aspect === '1/1' && 'aspect-square',
                t.aspect === '9/16' && 'aspect-[9/16]',
              )}
            >
              {/* mini-preview do template (frase + espiral) */}
              {t.id.startsWith('bee-quote') && (
                <div className="flex h-full flex-col items-center justify-center gap-2 p-2">
                  <div className="text-center font-serif text-[7px] font-bold leading-tight text-[#2D4A5C]">
                    "Sua frase<br />aqui"
                  </div>
                  <img src={BEE_SPIRAL_URL} alt="Espiral" className="h-4 w-4 object-contain" />
                </div>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold leading-tight">{t.name}</p>
              <p className="text-[10px] text-muted-foreground">{t.description}</p>
            </div>
          </button>
        ))}
      </div>

      <p className="px-1 text-[10px] text-muted-foreground">
        Clica em um template pra aplicar ao canvas. Substitui o conteúdo atual.
      </p>
    </div>
  );
}
