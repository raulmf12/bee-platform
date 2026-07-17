// Slots — a ponte entre o canvas do editor e o template_config do banco.
//
// No editor, um objeto do canvas vira slot dinamico quando ganha a prop custom
// `beeSlot`. Ela guarda SO o que nao da pra deduzir do desenho (nome do campo,
// limites tipograficos). Geometria, fonte e cor sao derivadas do proprio objeto
// na hora de salvar — voce posiciona a caixa, as regras saem dali.
//
// ATENCAO: o Fabric NAO serializa props custom no toJSON(). Sem passar
// FABRIC_CUSTOM_PROPS pro toObject(), `name` e `beeSlot` somem no salvamento e
// o template perde os slots. Use serializeCanvas() em vez de canvas.toJSON().

import type { TemplateConfig, TemplateField, TemplateTextRules } from '@/types';

// Props custom que o Fabric precisa serializar EXPLICITAMENTE.
export const FABRIC_CUSTOM_PROPS = ['name', 'beeSlot'];

// O que fica guardado no objeto do canvas. O resto e derivado.
export interface BeeSlotMeta {
  content_key: string;
  display_name: string;
  // Briefing do campo, escrito pra IA. Ver TemplateField.description.
  description?: string;
  // NAO renomear pra `type`: o fabric, ao carregar, enlivena qualquer valor
  // aninhado que tenha uma chave `type` — ele tentaria construir um objeto de
  // texto a partir DESTES metadados e quebraria o loadFromJSON inteiro.
  kind: 'text' | 'image';
  max_chars?: number;
  // limites tipograficos (so pra type: 'text')
  max_font_size?: number;
  min_font_size?: number;
  max_lines?: number;
  balance?: boolean;
  placeholder?: string;
}

interface CanvasObjectLike {
  name?: string;
  type?: string;
  beeSlot?: BeeSlotMeta;
  width?: number;
  height?: number;
  scaleX?: number;
  scaleY?: number;
  top?: number;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string;
  fill?: unknown;
  textAlign?: string;
  lineHeight?: number;
  [key: string]: unknown;
}

export interface CanvasJsonLike {
  objects?: CanvasObjectLike[];
  background?: string;
  [key: string]: unknown;
}

export function isTextType(t?: string): boolean {
  const k = (t ?? '').toLowerCase();
  return k === 'textbox' || k === 'i-text' || k === 'text';
}

// Deriva o TemplateField completo a partir do objeto desenhado.
// A geometria vira RAZAO (% do canvas) pra o template funcionar em qualquer
// dimensao, e pra o hidratador reposicionar o bloco conforme o texto real.
function fieldFromObject(
  obj: CanvasObjectLike,
  canvasWidth: number,
  canvasHeight: number,
): TemplateField | null {
  const meta = obj.beeSlot;
  if (!meta?.content_key) return null;

  if (meta.kind === 'image') {
    return {
      content_key: meta.content_key,
      type: 'image',
      display_name: meta.display_name || meta.content_key,
      description: meta.description,
      // O src atual do objeto E a imagem de exemplo: e o que voce subiu.
      sample_src: typeof obj.src === 'string' ? obj.src : undefined,
    };
  }

  const scaleX = obj.scaleX ?? 1;
  const scaleY = obj.scaleY ?? 1;
  // Largura/altura VISUAIS (o usuario pode ter escalado a caixa).
  const visualW = (obj.width ?? 0) * scaleX;
  const visualH = (obj.height ?? 0) * scaleY;
  const fontSize = (obj.fontSize ?? 48) * scaleY;

  const rules: TemplateTextRules = {
    // ancora = centro vertical do bloco como desenhado
    anchor_y_ratio: canvasHeight > 0 ? ((obj.top ?? 0) + visualH / 2) / canvasHeight : 0.5,
    width_ratio: canvasWidth > 0 ? visualW / canvasWidth : 0.8,
    // o corpo desenhado e o teto; o motor so diminui a partir dele
    max_font_size: Math.round(meta.max_font_size ?? fontSize),
    min_font_size: Math.round(meta.min_font_size ?? Math.max(12, fontSize * 0.5)),
    font_size_step: 2,
    max_lines: meta.max_lines ?? 4,
    balance: meta.balance ?? true,
    line_height: obj.lineHeight ?? 1.2,
    font_family: obj.fontFamily ?? 'Inter',
    font_weight: String(obj.fontWeight ?? 'normal'),
    fill: typeof obj.fill === 'string' ? obj.fill : '#000000',
    text_align: obj.textAlign ?? 'center',
    placeholder: meta.placeholder || 'Sua frase aqui',
  };

  return {
    content_key: meta.content_key,
    type: 'text',
    display_name: meta.display_name || meta.content_key,
    description: meta.description,
    max_chars: meta.max_chars,
    text_rules: rules,
  };
}

// Converte o canvas serializado em { slides_json, fields } prontos pro
// template_config. Limpa o beeSlot do palco: a verdade fica em `fields`, e
// duplicar convidaria as duas copias a divergir.
// Recebe `object` porque o JSON vem do Fabric, que nao e tipado — a fronteira
// entre o canvas e os nossos tipos e exatamente aqui.
export function buildTemplateParts(
  rawCanvasJson: object,
  canvasWidth: number,
  canvasHeight: number,
): { slideJson: object; fields: TemplateField[] } {
  const canvasJson = rawCanvasJson as CanvasJsonLike;
  const fields: TemplateField[] = [];
  const objects = (canvasJson.objects ?? []).map((o) => {
    const field = fieldFromObject(o, canvasWidth, canvasHeight);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { beeSlot, ...rest } = o;
    if (!field) return rest;
    fields.push(field);
    if (field.type !== 'text') return { ...rest, name: field.content_key };
    // O hidratador define left/top/width/fontSize do zero. Se sobrasse escala
    // aqui, ela multiplicaria por cima e o texto sairia do lugar.
    return { ...rest, name: field.content_key, scaleX: 1, scaleY: 1 };
  });

  return {
    slideJson: { ...canvasJson, objects },
    fields,
  };
}

// Reabre um template no editor: casa cada field com o objeto do palco pelo name
// e devolve o beeSlot, pra o objeto voltar a ser um slot editavel.
// E o inverso exato de buildTemplateParts.
export function configToCanvasJson(config: TemplateConfig): object {
  const slide = (config.slides_json?.[0] ?? {}) as CanvasJsonLike;
  const fields = Object.values(config.slides ?? {}).flatMap((s) => s.fields ?? []);
  const byKey = new Map(fields.map((f) => [f.content_key, f]));

  const objects = (slide.objects ?? []).map((o) => {
    const field = o.name ? byKey.get(o.name) : undefined;
    if (!field) return { ...o };
    return { ...o, beeSlot: metaFromField(field) };
  });

  return { ...slide, objects };
}

export function metaFromField(field: TemplateField): BeeSlotMeta {
  const r = field.text_rules;
  return {
    content_key: field.content_key,
    display_name: field.display_name,
    description: field.description,
    kind: field.type,
    max_chars: field.max_chars,
    max_font_size: r?.max_font_size,
    min_font_size: r?.min_font_size,
    max_lines: r?.max_lines,
    balance: r?.balance,
    placeholder: r?.placeholder,
  };
}

// Sugere um content_key livre a partir do nome que a pessoa deu.
export function slugifyKey(label: string, taken: string[]): string {
  const base =
    label
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'campo';
  if (!taken.includes(base)) return base;
  for (let i = 2; i < 100; i++) {
    if (!taken.includes(`${base}-${i}`)) return `${base}-${i}`;
  }
  return `${base}-${Date.now()}`;
}
