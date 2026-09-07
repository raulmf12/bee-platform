// Portão de aprovação do FUNDO DE IA (M01-D Campo / M01-E Matéria).
// Esses templates usam uma imagem de fundo gerada por IA. Regra: o humano precisa
// APROVAR (ou regenerar) esse fundo ANTES de mandar o post pra Stand-by/Publicar.
// O portão é separado da aprovação geral da imagem (image_approved), que hoje é
// auto-satisfeita ao exportar — este aqui NÃO é auto: exige um ato explícito.
//
// Estado: metadata.bg_approved === true. Ausência = pendente (default seguro).

const AI_BG_VARIANTS = new Set(['M01-D', 'M01-E']);

export function variantUsesAiBg(variant?: string | null): boolean {
  return !!variant && AI_BG_VARIANTS.has(variant);
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
