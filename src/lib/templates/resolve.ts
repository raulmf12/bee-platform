// Ponte entre a geracao e os templates do banco.
//
// A geracao NAO monta mais o Fabric JSON na mao: ela pede o template (dado),
// entrega os valores dos slots e recebe o JSON pronto. Trocar o template no
// editor passa a mudar o post gerado, sem tocar em codigo.
//
// Fallback: se o template nao estiver no banco (seed nao rodou), cai no builder
// versionado — que produz o config IDENTICO — e avisa no console. E um fallback
// honesto, nao uma divergencia silenciosa.

import type { TemplateConfig } from '@/types';
import { templateApi } from '@/lib/api';
import { BEE_QUOTE_NAME, buildBeeQuoteTemplateConfig, type BeeQuoteSize } from './beeQuote';
import { ensureTemplateFontsLoaded, hydrateTemplate } from './hydrate';

export interface ResolvedTemplate {
  id?: string;
  config: TemplateConfig;
  fromDb: boolean;
}

export async function resolveTemplateBySlug(
  slug: string,
  fallback: () => TemplateConfig,
): Promise<ResolvedTemplate> {
  try {
    const tpl = await templateApi.getBySlug(slug);
    if (tpl?.template_config) {
      return { id: tpl.id, config: tpl.template_config, fromDb: true };
    }
  } catch (e) {
    console.error('[resolveTemplateBySlug]', slug, e);
  }
  console.warn(
    `[templates] "${slug}" nao encontrado no banco — usando o builder versionado. ` +
      'Rode a migration 20260716000001_templates_as_data.sql.',
  );
  return { config: fallback(), fromDb: false };
}

// Renderiza o template Bee Quote com a frase que a IA gerou.
// Devolve tambem o template_id pra o post saber de onde veio.
export async function renderBeeQuote(
  sizeId: BeeQuoteSize,
  quote: string,
): Promise<{ fabricJson: object; templateId?: string }> {
  const t = await resolveTemplateBySlug(`bee-quote-${sizeId}`, () =>
    buildBeeQuoteTemplateConfig(sizeId),
  );
  // Medir com fallback e renderizar com a fonte real = layout torto.
  await ensureTemplateFontsLoaded(t.config);
  return {
    fabricJson: hydrateTemplate(t.config, { [BEE_QUOTE_NAME]: quote }),
    templateId: t.id,
  };
}
