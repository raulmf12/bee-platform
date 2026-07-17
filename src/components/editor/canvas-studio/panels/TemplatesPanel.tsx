// Galeria de templates dentro do editor de post. Click aplica no canvas.
//
// Le do BANCO (post_templates), nao de uma lista hardcoded: um template criado
// no editor de templates aparece aqui na hora. Duas listas divergiriam.

import { useEffect } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { useTemplateStore } from '@/store/templateStore';
import { ensureTemplateFontsLoaded, hydrateTemplate, templateFields } from '@/lib/templates/hydrate';
import { toast } from 'sonner';
import type { PostTemplate } from '@/types';
import { TemplateThumb } from '@/components/templates/TemplateThumb';
import type { EditorApi } from '../useEditor';

export function TemplatesPanel({ api }: { api: EditorApi }) {
  const { templates, loading, loaded, load } = useTemplateStore();

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  // Aplica o template com os textos de exemplo — o motor de layout roda igual
  // ao da geracao, entao o que aparece aqui e o que a IA produziria.
  async function apply(t: PostTemplate) {
    const cfg = t.template_config;
    if (!cfg?.slides_json?.length) {
      toast.error('Template sem conteúdo');
      return;
    }
    try {
      await ensureTemplateFontsLoaded(cfg);
      const values = Object.fromEntries(
        templateFields(cfg)
          .filter((f) => f.type === 'text')
          .map((f) => [f.content_key, f.text_rules?.placeholder ?? 'Sua frase aqui']),
      );
      await api.loadFromJson(hydrateTemplate(cfg, values));
    } catch (e) {
      console.error(e);
      toast.error('Falha ao aplicar o template');
    }
  }

  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center gap-2 px-1">
        <Sparkles className="h-3.5 w-3.5 text-accent" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Templates
        </h3>
      </div>

      {loading && templates.length === 0 ? (
        <div className="py-6 text-center">
          <Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : templates.length === 0 ? (
        <p className="px-1 text-[11px] text-muted-foreground">
          Nenhum template ainda. Crie um em Produção de conteúdo → Templates.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {templates.map((t) => {
            const cfg = t.template_config;
            return (
              <button
                key={t.id}
                onClick={() => void apply(t)}
                className="group flex flex-col gap-1.5 rounded-lg border border-border bg-card p-2 text-left transition-all hover:border-accent hover:shadow-md"
              >
                <TemplateThumb t={t} className="w-full rounded border border-border" />
                <div>
                  <p className="truncate text-xs font-semibold leading-tight">{t.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {cfg ? `${cfg.width}×${cfg.height}` : '—'}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <p className="px-1 text-[10px] text-muted-foreground">
        Aplicar substitui o conteúdo do canvas pelo template com texto de exemplo.
      </p>
    </div>
  );
}
