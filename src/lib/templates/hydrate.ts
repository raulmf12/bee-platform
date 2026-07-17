// Hidratador generico de templates.
//
// hydrateTemplate(config, valores) -> JSON pronto pro canvas.loadFromJSON().
//
// Le o template_config vindo do banco (post_templates), acha os objetos do palco
// que sao slots dinamicos (obj.name == field.content_key) e aplica os valores.
// Pra slots de texto roda o motor de layout: o corpo da fonte e as quebras sao
// recalculados pro texto que a IA gerou, e o bloco e recentralizado pelo numero
// REAL de linhas. Por isso um template aguenta frase curta e frase longa.
//
// Tudo que nao e slot passa reto — e o palco, sai literal.

import type { TemplateConfig, TemplateField } from '@/types';
import { ensureFontsLoaded, layoutText } from './layout';

export type TemplateValues = Record<string, string | undefined>;

interface FabricObject {
  name?: string;
  type?: string;
  [key: string]: unknown;
}

interface SlideJson {
  version?: string;
  background?: string;
  objects?: FabricObject[];
  [key: string]: unknown;
}

// Todos os slots declarados no config (achata os slides).
export function templateFields(config: TemplateConfig): TemplateField[] {
  return Object.values(config.slides ?? {}).flatMap((s) => s.fields ?? []);
}

// Fontes que o template precisa — carregue antes de hidratar, senao a medicao
// usa a fonte errada e o layout sai torto.
export async function ensureTemplateFontsLoaded(config: TemplateConfig): Promise<void> {
  const fonts = templateFields(config)
    .map((f) => f.text_rules)
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map((r) => ({ family: r.font_family, weight: r.font_weight }));
  if (!fonts.length) return;
  await ensureFontsLoaded(fonts);
}

// Aplica o motor de layout num slot de texto.
function applyTextSlot(
  obj: FabricObject,
  field: TemplateField,
  value: string | undefined,
  canvasWidth: number,
  canvasHeight: number,
): FabricObject {
  const r = field.text_rules;
  if (!r) return obj;

  const textWidth = Math.round(canvasWidth * r.width_ratio);
  const { fontSize, lines } = layoutText(value || r.placeholder || '', {
    textWidth,
    maxLines: r.max_lines,
    maxFontSize: r.max_font_size,
    minFontSize: r.min_font_size,
    fontFamily: r.font_family,
    fontWeight: r.font_weight,
    balance: r.balance,
    step: r.font_size_step ?? 2,
  });

  // Centraliza vertical pelo numero REAL de linhas (nao pelo max_lines):
  // 2 linhas e 4 linhas ficam ambas centradas na mesma ancora.
  const blockHeight = fontSize * r.line_height * lines.length;
  const top = Math.round(canvasHeight * r.anchor_y_ratio - blockHeight / 2);

  return {
    ...obj,
    text: lines.join('\n'),
    left: Math.round((canvasWidth - textWidth) / 2),
    top,
    width: textWidth,
    fontSize,
    fontFamily: r.font_family,
    fontWeight: r.font_weight,
    fill: r.fill,
    textAlign: r.text_align,
    lineHeight: r.line_height,
  };
}

export function hydrateTemplate(
  config: TemplateConfig,
  values: TemplateValues,
  slideIndex = 0,
): object {
  const slide = (config.slides_json?.[slideIndex] ?? {}) as SlideJson;
  const objects: FabricObject[] = (slide.objects ?? []).map((o) => ({ ...o }));
  const fields = templateFields(config);

  for (const field of fields) {
    const idx = objects.findIndex((o) => o.name === field.content_key);
    if (idx < 0) continue;
    const value = values[field.content_key];

    if (field.type === 'text') {
      objects[idx] = applyTextSlot(objects[idx], field, value, config.width, config.height);
    } else if (field.type === 'image' && value) {
      objects[idx] = { ...objects[idx], src: value };
    }
  }

  return {
    version: slide.version ?? '6.0.0',
    background: slide.background ?? config.background ?? '#FFFFFF',
    objects,
  };
}
