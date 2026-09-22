// Tabela de preços das APIs (para estimar custo por geração no dashboard).
// Valores em USD. AJUSTE aqui quando os preços mudarem — é o único lugar.
// Texto: preço por 1 MILHÃO de tokens (input/output). Imagem/busca: por chamada.
//
// Fonte: Gemini API pricing (ai.google.dev/gemini-api/docs/pricing), paid tier,
// verificado em ago/2026. Os nomes 3.5-flash / 3.1-flash-lite / 3.1-pro usam a
// mesma faixa (tier) do 2.5 equivalente. Pro >200k tokens sobe p/ 2.50/15.00.

export interface ModelPrice { inPerM?: number; outPerM?: number; perImage?: number; perCall?: number }

export const PRICING: Record<string, ModelPrice> = {
  // Gemini — texto (por 1M tokens) · Flash: 0.30/2.50
  'gemini-2.5-flash': { inPerM: 0.30, outPerM: 2.50 },
  'gemini-3.5-flash': { inPerM: 0.30, outPerM: 2.50 },
  // Flash-Lite: 0.10/0.40
  'gemini-2.5-flash-lite': { inPerM: 0.10, outPerM: 0.40 },
  'gemini-3.1-flash-lite': { inPerM: 0.10, outPerM: 0.40 },
  // Pro: 1.25/10.00 (≤200k tokens; acima: 2.50/15.00)
  'gemini-2.5-pro': { inPerM: 1.25, outPerM: 10.0 },
  'gemini-3.1-pro-preview': { inPerM: 1.25, outPerM: 10.0 },
  // Embeddings (só input): 0.15
  'gemini-embedding-001': { inPerM: 0.15, outPerM: 0 },
  // Imagem — Gemini 2.5 Flash Image (Nano Banana): $0.039/imagem
  'gemini-2.5-flash-image': { perImage: 0.039 },
  // Imagem — OpenAI GPT Image 2.5 (por token: in $5/M, out imagem $30/M). O custo
  // real por imagem vem do usage da API; aqui é referência.
  'gpt-image-2.5-flare': { inPerM: 5, outPerM: 30 },
  'gpt-image-2.5-sunburst': { inPerM: 5, outPerM: 30 },
  // Imagem — Imagen (~$0.04/imagem)
  'imagen-3.0-generate-002': { perImage: 0.04 },
  'imagen-4.0-generate-001': { perImage: 0.04 },
  'imagen-3.0-generate-001': { perImage: 0.04 },
  // Busca de imagem (SerpAPI, por chamada)
  'serpapi': { perCall: 0.01 },
};

// Preço padrão por produto quando o modelo não está mapeado (estimativa conservadora).
const DEFAULT_BY_PRODUCT: Record<string, ModelPrice> = {
  text: { inPerM: 0.30, outPerM: 2.50 },
  image: { perImage: 0.04 },
  'image-search': { perCall: 0.01 },
};

export interface UsageEvent {
  provider?: string | null;
  product?: string | null;
  model?: string | null;
  tokens_input?: number | null;
  tokens_output?: number | null;
  cost_usd?: number | null;
}

// Custo de UM evento. Usa cost_usd se já veio calculado; senão estima do modelo.
export function costOf(ev: UsageEvent): number {
  if (typeof ev.cost_usd === 'number' && ev.cost_usd > 0) return ev.cost_usd;
  const price = (ev.model && PRICING[ev.model]) || DEFAULT_BY_PRODUCT[ev.product ?? 'text'] || {};
  if (ev.product === 'image' || price.perImage != null) return price.perImage ?? 0;
  if (ev.product === 'image-search' || price.perCall != null) return price.perCall ?? 0;
  const ti = ev.tokens_input ?? 0, to = ev.tokens_output ?? 0;
  return (ti / 1_000_000) * (price.inPerM ?? 0) + (to / 1_000_000) * (price.outPerM ?? 0);
}

export const money = (v: number): string =>
  v >= 1 ? `$${v.toFixed(2)}` : v >= 0.01 ? `$${v.toFixed(3)}` : `$${v.toFixed(5)}`;
