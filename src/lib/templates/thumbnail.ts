// Preview de template renderizado no cliente.
//
// O thumbnail nao fica no banco de proposito: um PNG 1080x1350 em base64 pesa
// centenas de KB, e o list() baixaria o de TODOS os templates. Aqui ele e
// derivado do template_config — que ja e a fonte da verdade — e cacheado em
// memoria. Bonus: o preview nunca fica velho em relacao ao template.
//
// Renderiza pelo mesmo caminho da geracao (hydrateTemplate + motor de layout),
// entao o que aparece no card e o que a IA produziria.

import * as fabric from 'fabric';
import type { TemplateConfig } from '@/types';
import { ensureTemplateFontsLoaded, hydrateTemplate, templateFields } from './hydrate';

const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();

const THUMB_WIDTH = 420;

export async function renderTemplateThumb(
  cacheKey: string,
  config: TemplateConfig,
): Promise<string | null> {
  const hit = cache.get(cacheKey);
  if (hit) return hit;
  const pending = inflight.get(cacheKey);
  if (pending) return pending;

  const job = (async (): Promise<string | null> => {
    try {
      if (!config?.slides_json?.length) return null;
      await ensureTemplateFontsLoaded(config);

      const values = Object.fromEntries(
        templateFields(config)
          .filter((f) => f.type === 'text')
          .map((f) => [f.content_key, f.text_rules?.placeholder ?? 'Sua frase aqui']),
      );

      const el = document.createElement('canvas');
      const c = new fabric.StaticCanvas(el, {
        width: config.width,
        height: config.height,
        backgroundColor: config.background ?? '#FFFFFF',
      });
      try {
        // loadFromJSON aguarda as imagens (espiral, samples) carregarem.
        await c.loadFromJSON(hydrateTemplate(config, values));
        c.renderAll();
        const url = c.toDataURL({
          format: 'png',
          quality: 1,
          multiplier: THUMB_WIDTH / config.width,
        });
        cache.set(cacheKey, url);
        return url;
      } finally {
        void c.dispose();
      }
    } catch (e) {
      console.error('[renderTemplateThumb]', cacheKey, e);
      return null;
    } finally {
      inflight.delete(cacheKey);
    }
  })();

  inflight.set(cacheKey, job);
  return job;
}

// Chave que invalida sozinha quando o template muda.
export function thumbKey(t: { id: string; updated_at?: string }): string {
  return `${t.id}:${t.updated_at ?? ''}`;
}
