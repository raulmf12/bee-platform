// Editor de templates — /templates/:id (ou /templates/novo).
//
// Mesmo Canvas Studio que conserta post, em modo template: aqui voce desenha o
// palco e marca o que a IA preenche. O que sai daqui vai pra post_templates e
// passa a moldar todo post gerado com este template.

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { CanvasStudio } from '@/components/editor/canvas-studio/CanvasStudio';
import { CANVAS_PRESETS, presetForSize } from '@/components/editor/canvas-studio/useEditor';
import { templateApi } from '@/lib/api';
import { buildTemplateParts, configToCanvasJson } from '@/lib/templates/slots';
import { ensureTemplateFontsLoaded } from '@/lib/templates/hydrate';
import type { PostTemplate, TemplateConfig } from '@/types';
import { toast } from 'sonner';

const NEW = 'novo';

export function TemplateEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !id || id === NEW;

  const [tpl, setTpl] = useState<PostTemplate | null>(null);
  const [loading, setLoading] = useState(!isNew);

  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const t = await templateApi.get(id!);
        if (cancelled) return;
        if (!t) {
          toast.error('Template não encontrado');
          navigate('/templates');
          return;
        }
        // Espera as fontes do template ANTES de montar o canvas. O Fabric mede
        // o texto na hora que carrega; se a Playfair ainda nao chegou, ele mede
        // com a fonte de fallback e o template abre com quebra/largura erradas.
        if (t.template_config) await ensureTemplateFontsLoaded(t.template_config);
        if (cancelled) return;
        setTpl(t);
      } catch (e) {
        console.error(e);
        if (!cancelled) toast.error('Falha ao carregar o template');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, isNew, navigate]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const cfg = tpl?.template_config;
  // Sem preset equivalente o canvas abriria noutro tamanho e o save gravaria
  // dimensoes erradas — por isso presetForSize e nao um default cego.
  const preset =
    (cfg && presetForSize(cfg.width, cfg.height)) ?? 'linkedin-portrait';

  // dataUrl vem do CanvasStudio mas nao e usado: guardar um PNG 1080x1350 em
  // base64 por template incharia o list(). O preview e renderizado do config.
  async function handleSave({ fabricJson, title }: {
    fabricJson: object; dataUrl: string; title: string;
  }) {
    const size = CANVAS_PRESETS[preset];
    const { slideJson, fields } = buildTemplateParts(fabricJson, size.width, size.height);

    if (fields.length === 0) {
      toast.error('Marque ao menos um campo dinâmico — sem isso o template sai igual em todo post.');
      return;
    }

    const config: TemplateConfig = {
      width: size.width,
      height: size.height,
      background: (slideJson as { background?: string }).background,
      slides_json: [slideJson],
      slides: { slide1: { name: 'Slide 1', fields } },
    };

    try {
      if (isNew) {
        const created = await templateApi.createUser({
          name: title || 'Template sem nome',
          platform: preset.startsWith('instagram') ? 'instagram' : 'linkedin',
          format: 'image',
          template_config: config,
        });
        toast.success('Template criado');
        navigate(`/templates/${created.id}`, { replace: true });
      } else {
        await templateApi.updateTemplate(id!, {
          name: title || tpl?.name,
          template_config: config,
        });
        toast.success('Template salvo — os próximos posts já saem assim');
      }
    } catch (e) {
      console.error(e);
      toast.error(`Erro ao salvar: ${(e as Error).message.slice(0, 160)}`);
    }
  }

  return (
    <CanvasStudio
      templateMode
      initialPreset={preset}
      initialTitle={tpl?.name ?? 'Novo template'}
      initialFabricJson={cfg ? configToCanvasJson(cfg) : undefined}
      onBack={() => navigate('/templates')}
      onSave={handleSave}
    />
  );
}
