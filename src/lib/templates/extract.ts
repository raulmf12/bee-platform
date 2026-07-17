// Le de volta o texto que o usuario deixou no canvas.
//
// Isso e necessario porque a frase editada NAO vive em carousel_text: o
// PostEditor so persiste carousel_fabric_json quando o canvas muda. A verdade
// do texto final esta no objeto do canvas, e e ela que a medicao compara com o
// original pristino da IA.
//
// Detalhe que importa: o texto no canvas vem com as quebras de linha do motor
// de layout embutidas ("frase\nquebrada\nassim"), enquanto o original da IA e
// uma linha so. Quem compara precisa normalizar espacos — vide
// normalizeForCompare em api.ts, que colapsa \s+ e faz os dois baterem.

import { BEE_QUOTE_NAME } from './beeQuote';

interface FabricObj {
  name?: string;
  type?: string;
  text?: string;
  [k: string]: unknown;
}

function isText(o: FabricObj): boolean {
  const t = String(o.type ?? '').toLowerCase();
  return t === 'textbox' || t === 'i-text' || t === 'text';
}

// Devolve o texto do slot pedido. Cai pro primeiro texto do canvas quando o
// slot nao e achado (templates antigos, sem `name`).
export function extractSlotText(
  fabricJson: object | undefined,
  contentKey: string = BEE_QUOTE_NAME,
): string | null {
  const objs = ((fabricJson as { objects?: FabricObj[] } | undefined)?.objects ?? []);
  const byName = objs.find((o) => o.name === contentKey && typeof o.text === 'string');
  if (byName?.text) return byName.text;
  const firstText = objs.find((o) => isText(o) && typeof o.text === 'string');
  return firstText?.text ?? null;
}
