// Portão de aprovação da IMAGEM DE IA: M01-D (Campo) e M01-E (Matéria) usam
// fundo de IA; TODO M02 (Rosto + Pensamento) usa uma CENA gerada por IA. Regra:
// o humano precisa APROVAR (ou regenerar) essa imagem ANTES de mandar o post pra
// Stand-by/Publicar. É separado da aprovação geral (image_approved), que hoje é
// auto-satisfeita ao exportar — este aqui NÃO é auto: exige um ato explícito.
//
// Estado: metadata.bg_approved === true. Ausência = pendente (default seguro).

export function variantUsesAiBg(variant?: string | null): boolean {
  if (!variant) return false;
  return variant === 'M01-D' || variant === 'M01-E' || variant.startsWith('M02-');
}

// true quando o post usa fundo de IA e esse fundo ainda NÃO foi aprovado.
export function bgGatePending(post: {
  visual_decision?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
} | null | undefined): boolean {
  if (!post) return false;
  const variant = (post.visual_decision as { variant?: string } | null | undefined)?.variant;
  if (!variantUsesAiBg(variant)) return false;
  return (post.metadata as { bg_approved?: boolean } | null | undefined)?.bg_approved !== true;
}
