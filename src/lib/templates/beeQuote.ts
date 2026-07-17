// Template "Bee Quote" — fundo branco + frase navy serif + espiral honey.
// Padrao das publicacoes da Bee Consulting (formato 4:5, 1:1 e 1.91:1).
//
// Este arquivo NAO tem mais motor de layout: ele so DESCREVE o template.
// A matematica (quebra balanceada, auto-fit da fonte, centralizacao) mora em
// layout.ts, e a aplicacao em hydrate.ts — genericos, usados por qualquer
// template criado no editor.
//
// Aqui ficam so os parametros que fazem este template ser o Bee Quote:
// as proporcoes de cada formato, a fonte, as cores e a espiral.
//
// buildBeeQuoteTemplateConfig() e a fonte da verdade do seed em post_templates
// (vide scripts/dump-template.ts). O que a geracao usa em runtime e o config do
// BANCO — este builder existe pra semear e pra manter o template versionado.

import type { TemplateConfig, TemplateTextRules } from '@/types';
import { ensureTemplateFontsLoaded, hydrateTemplate } from './hydrate';

export type BeeQuoteSize = 'square' | 'landscape' | 'portrait';

export interface BeeQuoteVariables {
  quote: string;
  sizeId: BeeQuoteSize;
}

interface LayoutSpec {
  width: number;
  height: number;
  // textbox
  textTopRatio: number;       // posicao Y (centroide) da textbox em % da altura
  textWidthRatio: number;     // largura da textbox em % da largura
  initialFontSize: number;
  minFontSize: number;
  maxLines: number;
  // logo
  logoTopRatio: number;
  logoSide: number;           // lado em px do sprite final no canvas
}

// Cada tamanho do LinkedIn imagem-unica tem seu layout proprio
const LAYOUTS: Record<BeeQuoteSize, LayoutSpec> = {
  // 4:5 — formato padrao
  portrait: {
    width: 1080,
    height: 1350,
    textTopRatio: 0.50,
    textWidthRatio: 0.86,
    initialFontSize: 60,
    minFontSize: 30,
    maxLines: 4,
    logoTopRatio: 0.83,
    logoSide: 150,
  },
  // 1:1
  square: {
    width: 1200,
    height: 1200,
    textTopRatio: 0.48,
    textWidthRatio: 0.84,
    initialFontSize: 64,
    minFontSize: 32,
    maxLines: 4,
    logoTopRatio: 0.83,
    logoSide: 170,
  },
  // 1.91:1
  landscape: {
    width: 1200,
    height: 628,
    textTopRatio: 0.46,
    textWidthRatio: 0.78,
    initialFontSize: 56,
    minFontSize: 28,
    maxLines: 3,
    logoTopRatio: 0.86,
    logoSide: 110,
  },
};

const NAVY = '#2D4A5C';
const WHITE = '#FFFFFF';
const FONT = 'Playfair Display';
const FONT_WEIGHT = 'bold';
const LINE_HEIGHT = 1.2;
const QUOTE_CONTENT_KEY = 'bee-quote';
const PLACEHOLDER = 'Sua frase aqui';

// PNG oficial da espiral Bee — fica em public/bee-spiral.png.
// Sprite quadrado 1080x1080.
export const BEE_SPIRAL_URL = '/bee-spiral.png';
const BEE_SPIRAL_NATIVE = 1080;

// Constante exportada pra outros modulos identificarem o textbox da frase
export const BEE_QUOTE_NAME = QUOTE_CONTENT_KEY;

export function getLayoutDimensions(sizeId: BeeQuoteSize): { width: number; height: number } {
  const l = LAYOUTS[sizeId];
  return { width: l.width, height: l.height };
}

// ---------------------------------------------------------------------------
// TEMPLATE_CONFIG — formato salvo em post_templates.template_config.
// Palco (slides_json) + slot dinamico da frase (slides.slide1.fields).
// ---------------------------------------------------------------------------
export function buildBeeQuoteTemplateConfig(sizeId: BeeQuoteSize = 'portrait'): TemplateConfig {
  const l = LAYOUTS[sizeId];
  const { width, height } = l;

  const rules: TemplateTextRules = {
    anchor_y_ratio: l.textTopRatio,
    width_ratio: l.textWidthRatio,
    max_font_size: l.initialFontSize,
    min_font_size: l.minFontSize,
    font_size_step: 2,
    max_lines: l.maxLines,
    balance: true,
    line_height: LINE_HEIGHT,
    font_family: FONT,
    font_weight: FONT_WEIGHT,
    fill: NAVY,
    text_align: 'center',
    placeholder: PLACEHOLDER,
  };

  // A espiral e estatica: nao depende da frase, entao ja vai posicionada.
  const logoSide = l.logoSide;
  const logoScale = logoSide / BEE_SPIRAL_NATIVE;

  // Valores de design-time da textbox. hydrateTemplate() recalcula
  // text/left/top/width/fontSize a cada geracao — aqui e so o que o editor
  // mostra quando abre o template.
  const textWidth = Math.round(width * l.textWidthRatio);

  return {
    width,
    height,
    background: WHITE,
    slides_json: [
      {
        version: '6.0.0',
        background: WHITE,
        objects: [
          {
            type: 'Textbox',
            version: '6.0.0',
            text: PLACEHOLDER,
            left: Math.round((width - textWidth) / 2),
            top: Math.round(height * l.textTopRatio - (l.initialFontSize * LINE_HEIGHT) / 2),
            width: textWidth,
            fontSize: l.initialFontSize,
            fontFamily: FONT,
            fontWeight: FONT_WEIGHT,
            fill: NAVY,
            textAlign: 'center',
            lineHeight: LINE_HEIGHT,
            editable: true,
            name: QUOTE_CONTENT_KEY,
          },
          {
            type: 'Image',
            version: '6.0.0',
            src: BEE_SPIRAL_URL,
            crossOrigin: 'anonymous',
            left: Math.round((width - logoSide) / 2),
            top: Math.round(height * l.logoTopRatio - logoSide / 2),
            scaleX: logoScale,
            scaleY: logoScale,
            name: 'bee-spiral',
          },
        ],
      },
    ],
    slides: {
      slide1: {
        name: 'Slide 1',
        fields: [
          {
            content_key: QUOTE_CONTENT_KEY,
            type: 'text',
            display_name: 'Frase',
            max_chars: 200,
            text_rules: rules,
          },
        ],
      },
    },
  };
}

// ---------------------------------------------------------------------------
// COMPAT — atalhos que embrulham o caminho generico.
// Runtime le o template do BANCO; isto serve pro editor e pro fallback.
// ---------------------------------------------------------------------------
export function hydrateBeeQuote({ quote, sizeId }: BeeQuoteVariables): object {
  return hydrateTemplate(buildBeeQuoteTemplateConfig(sizeId), { [QUOTE_CONTENT_KEY]: quote });
}

export async function ensureQuoteFontLoaded(): Promise<void> {
  await ensureTemplateFontsLoaded(buildBeeQuoteTemplateConfig('portrait'));
}
