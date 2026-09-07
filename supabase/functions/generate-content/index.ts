// Edge function: generate-content (versao Bee Editorial v3 — governada pelo GENESIS)
// Recebe { editorial_slug, arsenal_item_id?, target_avatar?, briefing? }.
// Constroi prompt em camadas:
//   0. CAMADA 0 — CONSTITUICAO COGNITIVA (GENESIS): missao, principios
//      invioláveis (15 artigos + epistemologia + diagnostico + etica da
//      linguagem), paradigmas, Fluxo Cognitivo (7 perguntas), persona.
//   1. Uma lente: as 6 Dimensoes Sistemicas
//   2. Leitura do interlocutor (avatar/estado da Matriz Cognitiva)
//   3. Editorial + estrutura
//   4. Arsenal selecionado
//   5. Few-shot: 1-2 example_posts do mesmo editorial
//   6. Style rules (DO/DONT/GENERAL)
//   7. Glossario proprietario
//   8. Hashtags obrigatorias
//   9. RAG: top-K chunks relevantes
//  10. Autochecagem (Regra de Ouro / régua da comunicacao)
// Devolve { quote, caption, headline_type_used, analogy_used }

import {
  errorResponse,
  getUserGeminiKey,
  jsonResponse,
  logUsage,
  preflight,
  userIdFromAuth,
  internalUserId,
  checkRateLimit,
} from '../_shared/security.ts';
import { embedText } from '../_shared/embed.ts';

// Cadeia: Flash primeiro (sem thinking tokens que cortam saida), Pro como fallback.
// Mesmo padrao da generate-caption-from-video — comprovadamente mais estavel pra JSON.
const MODEL_CHAIN = [
  Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-3.1-pro-preview',
  'gemini-2.5-pro',
];
const MAX_RETRIES = 2;
const RAG_TOP_K = Number(Deno.env.get('RAG_TOP_K') ?? '8');
const RAG_THRESHOLD = Number(Deno.env.get('RAG_THRESHOLD') ?? '0.25');

interface GenerateInput {
  editorial_slug: string;
  arsenal_item_id?: string;
  target_avatar?: 'identificado' | 'incomodado' | 'ambos';
  briefing?: string;
  quote_max_chars?: number;
  // Adaptar de post existente — IA usa quote+caption do referenciado como base
  reference_post_id?: string;
  target_platform?: 'linkedin' | 'instagram';
  // Quantas variacoes gerar (1..5). Default 1 pra nao quebrar quem ja chamava
  // (o editorial-line-tick).
  //
  // As 5 saem numa UNICA chamada de proposito: este prompt e enorme (persona +
  // arsenal + exemplos few-shot + RAG + Camada 0 da Alma) e a saida e curta.
  // 5 variacoes no mesmo JSON custam ~8% a mais; 5 chamadas separadas
  // custariam ~5x, porque cada uma reenviaria o prompt inteiro.
  variations?: number;
}

// SEED da Hive: a decisao de FORMA que o modelo toma JUNTO com o conteudo (so
// Instagram). O hive-decide recebe isso e executa sem re-pensar (sem 2a IA).
interface HiveSeed {
  variant: string;
  manifestation: string;
  highlight: { target?: string; reason?: string } | null;
  subtitle: string | null;
  poles: { a?: string; b?: string } | null;
  image_scene_hint: string;
  human_presence_adds_meaning: boolean;
  mode_reason: string;
  variant_reason: string;
}

interface GenerateVariation {
  quote: string;
  caption: string;
  headline_type_used?: string;
  analogy_used?: string;
  // Nota de potencial de viralizacao (0-100) + 1 linha de razao.
  virality_score?: number;
  virality_reason?: string;
  // So Instagram: a forma escolhida junto com o conteudo (template + destaque…).
  hive_seed?: HiveSeed;
}

interface GenerateOutput {
  variations: GenerateVariation[];
}

// --- Catalogo de templates visuais (Instagram): o modelo pensa forma+conteudo. ---
interface HiveManifest { id: string; nome: string; operacao: string; auto_select?: boolean; quando_usar: unknown; quando_nao: unknown }
interface HiveVariant {
  id: string; manifestacao_id: string; nome: string; operacao: string;
  quando_usar: unknown; quando_nao: unknown; selection_rule: Record<string, unknown>; limites: Record<string, unknown>;
}
interface TemplateCatalog {
  manifests: HiveManifest[];
  variants: HiveVariant[];
  realMarcosCount: number;
  recentVariants: string[];
}

// So Instagram: carrega o catalogo congelado + fotos reais do Marcos + historico
// recente de variantes (pressao de diversidade). LinkedIn e travado no M01-A,
// entao nao precisa — retorna null e o prompt segue o fluxo classico.
async function loadTemplateCatalog(userId: string, platform: string | undefined): Promise<TemplateCatalog | null> {
  if (platform !== 'instagram') return null;
  const [manis, vars, photoAssets, recent] = await Promise.all([
    fetchRest<HiveManifest[]>(`/design_manifestacoes?ativo=eq.true&select=id,nome,operacao,auto_select,quando_usar,quando_nao&order=ordem.asc`),
    fetchRest<HiveVariant[]>(`/design_variacoes?status=eq.frozen&ativo=eq.true&select=id,manifestacao_id,nome,operacao,quando_usar,quando_nao,selection_rule,limites&order=manifestacao_id.asc,ordem.asc`),
    fetchRest<Array<{ origin: string; semantic: Record<string, unknown> }>>(`/design_assets?is_active=eq.true&kind=eq.photo&select=origin,semantic`),
    fetchRest<Array<{ visual_decision: { variant?: string } | null }>>(`/user_posts?user_id=eq.${userId}&visual_decision=not.is.null&select=visual_decision&order=created_at.desc&limit=8`),
  ]);
  // So manifestacoes auto-selecionaveis (M04 depende de dados de evento -> fora).
  const autoIds = new Set(manis.filter((m) => m.auto_select !== false).map((m) => m.id));
  const variants = vars.filter((v) => autoIds.has(v.manifestacao_id));
  if (variants.length === 0) return null; // base sem template congelado: fluxo classico
  const realMarcosCount = photoAssets.filter(
    (a) => ['real', 'real_adapted'].includes(a.origin) && String((a.semantic ?? {}).marcos_presente ?? '').toLowerCase() === 'sim',
  ).length;
  const recentVariants = recent.map((r) => r.visual_decision?.variant ?? '').filter(Boolean);
  return { manifests: manis.filter((m) => autoIds.has(m.id)), variants, realMarcosCount, recentVariants };
}

function svcHeaders(): HeadersInit {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };
}

async function fetchRest<T>(path: string): Promise<T> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const res = await fetch(`${supabaseUrl}/rest/v1${path}`, { headers: svcHeaders() });
  if (!res.ok) {
    console.warn('[fetchRest fail]', path, res.status);
    return [] as unknown as T;
  }
  return await res.json();
}

// POST /rest/v1/rpc/<fn> — pra funcoes do banco (ai_prompt_learnings).
async function rpcRest<T>(fn: string, args: object): Promise<T> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { ...svcHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    console.warn('[rpcRest fail]', fn, res.status);
    return [] as unknown as T;
  }
  return await res.json();
}

interface BeeAudience { quem?: string; dor?: string; desejo?: string; objecoes?: string[]; gatilhos?: string[]; linguagem?: string }
interface BeeEditorial { slug: string; name: string; description: string; frequency_hint: string; structure_template: string; emotional_sequence: string[]; objetivo?: string; tom?: string; fazer?: string[]; evitar?: string[]; temas?: string[]; audience?: BeeAudience }
interface BeeArsenal { id?: string; title: string; summary: string; details: string | null; type: string }
interface BeeExamplePost { id?: string; editorial_slug: string; image_quote: string; caption: string; why_good: string; headline_type: string; analogy: string }
interface BeeGlossaryTerm { term: string; meaning: string; usage_note: string; must_appear: boolean }
interface BeeStyleRule { rule: string; rationale: string }
interface BeeHeadlineType { name: string; description: string; examples: string[] }
interface BeeAnalogy { name: string; description: string; best_for: string }
interface BeeHashtag { tag: string; required: boolean; topic: string | null }

// GENESIS — a Constituicao Cognitiva (Camada 0) vira dado.
interface GenesisCore {
  persona_nome?: string; persona_postura?: string;
  missao?: string; frase_organizadora?: string; pergunta_silenciosa?: string; produto_real?: string;
  voz_como_escreve?: string; voz_verbos?: string[]; voz_nunca?: string[];
}
interface GenesisPrincipio { camada: string; codigo: string; titulo: string | null; principio: string; aplicacao: string | null; inviolavel: boolean }
interface GenesisAvatar {
  slug: string; nome: string; eixo_percepcao: number; eixo_identificacao: number;
  pergunta_central: string | null; sofrimento: string | null; relacao_autoridade: string | null;
  linguagem: string | null; frase_silenciosa: string | null; o_que_teme: string | null; o_que_busca: string | null;
  frases_tipicas: string[] | null; como_conversar: string | null; erros_comuns: string | null; movimento_seguinte: string | null;
}
interface GenesisTensao { nome: string; arquetipo: string; logica: string; sofrimento_tipico: string }
interface GenesisLente { nome: string; oitava: number; frase_sistemica: string; natureza: string }
interface GenesisFluxo { ordem: number; pergunta: string; nota: string | null }

// DIRETRIZES DE CRIAÇÃO — a camada de ofício (como executar), separada do
// Genesis (por que/quem). universal + a plataforma + a linha editorial.
interface BeeDirective { scope: string; scope_ref: string | null; tipo: string; inviolavel: boolean; titulo: string | null; instrucao: string; ordem: number }

interface ReferencePost {
  id: string;
  platform: string;
  format: string;
  title: string | null;
  caption: string | null;
  carousel_text: { quote?: string; caption?: string; headline_type?: string; analogy?: string } | null;
}

async function fetchReferencePost(id: string): Promise<ReferencePost | null> {
  const rows = await fetchRest<ReferencePost[]>(
    `/user_posts?id=eq.${id}&select=id,platform,format,title,caption,carousel_text&limit=1`,
  );
  return rows[0] ?? null;
}

async function loadBeeContext(input: GenerateInput, userId: string) {
  // Mapeia o alvo (identificado/incomodado/ambos) pros slugs do genesis_avatares.
  const avatarSlugs = !input.target_avatar || input.target_avatar === 'ambos'
    ? ['identificado', 'incomodado']
    : [input.target_avatar];
  const avatarFilter = `&slug=in.(${avatarSlugs.join(',')})`;

  const [
    editorial,
    arsenalItem,
    avatars,
    examples,
    glossary,
    doRules,
    dontRules,
    generalRules,
    headlineTypes,
    analogiesNew,
    analogiesUsed,
    hashtags,
    genesisCore,
    genesisPrincipios,
    genesisLentes,
    genesisTensoes,
    genesisFluxo,
    directives,
  ] = await Promise.all([
    fetchRest<BeeEditorial[]>(`/bee_editorials?slug=eq.${input.editorial_slug}&limit=1`),
    input.arsenal_item_id
      ? fetchRest<BeeArsenal[]>(`/bee_arsenal?id=eq.${input.arsenal_item_id}&limit=1`)
      // Sem item escolhido: ROTACIONA — pega o item ativo menos usado / mais antigo
      // (metodologia viva: a cada geracao varia o material e evita repetir).
      : fetchRest<BeeArsenal[]>(`/bee_arsenal?editorial_slug=eq.${input.editorial_slug}&is_active=eq.true&order=last_used_at.asc.nullsfirst,usage_count.asc&limit=1`),
    // AVATARES — agora do genesis_avatares (os 5 estados da Matriz Cognitiva).
    fetchRest<GenesisAvatar[]>(`/genesis_avatares?order=ordem.asc${avatarFilter}`),
    // Few-shot tambem rotaciona por frescor (exemplos ativos menos usados primeiro).
    fetchRest<BeeExamplePost[]>(`/bee_example_posts?editorial_slug=eq.${input.editorial_slug}&is_active=eq.true&order=last_used_at.asc.nullsfirst,position.asc&limit=2`),
    fetchRest<BeeGlossaryTerm[]>(`/bee_glossary?select=term,meaning,usage_note,must_appear`),
    fetchRest<BeeStyleRule[]>(`/bee_style_rules?category=eq.do&order=position.asc`),
    fetchRest<BeeStyleRule[]>(`/bee_style_rules?category=eq.dont&order=position.asc`),
    fetchRest<BeeStyleRule[]>(`/bee_style_rules?category=eq.general&order=position.asc`),
    fetchRest<BeeHeadlineType[]>(`/bee_headline_types?order=position.asc`),
    fetchRest<BeeAnalogy[]>(`/bee_analogies?used=eq.false`),
    fetchRest<BeeAnalogy[]>(`/bee_analogies?used=eq.true`),
    fetchRest<BeeHashtag[]>(`/bee_hashtags?order=position.asc`),
    // CAMADA 0 — GENESIS (a Constituicao Cognitiva que governa tudo abaixo)
    fetchRest<GenesisCore[]>(`/genesis_core?limit=1`),
    fetchRest<GenesisPrincipio[]>(`/genesis_principios?ativo=eq.true&select=camada,codigo,titulo,principio,aplicacao,inviolavel&order=camada.asc,ordem.asc`),
    fetchRest<GenesisLente[]>(`/genesis_lentes?select=nome,oitava,frase_sistemica,natureza&order=ordem.asc`),
    fetchRest<GenesisTensao[]>(`/genesis_tensoes?select=nome,arquetipo,logica,sofrimento_tipico&order=ordem.asc`),
    fetchRest<GenesisFluxo[]>(`/genesis_fluxo?select=ordem,pergunta,nota&order=ordem.asc`),
    // DIRETRIZES DE CRIAÇÃO — universal + a plataforma-alvo + a linha editorial.
    // scope_ref: universal=is.null, platform=<plataforma>, editorial=<slug>.
    fetchRest<BeeDirective[]>(
      `/bee_directives?ativo=eq.true&select=scope,scope_ref,tipo,inviolavel,titulo,instrucao,ordem&or=(scope.eq.universal,and(scope.eq.platform,scope_ref.eq.${input.target_platform ?? 'linkedin'}),and(scope.eq.editorial,scope_ref.eq.${input.editorial_slug}))&order=scope.asc,ordem.asc`,
    ),
  ]);

  // APRENDIZADOS do SEGMENTO desta geracao (correcoes + conversa com o agente).
  // ai_prompt_learnings casa por alcance: lições globais + as que miram este
  // conjunto (editoria×plataforma×alvo), as mais específicas primeiro. So
  // texto+legenda: este prompt gera FRASE e CAPTION; imagem fica pro futuro.
  const learnings = await rpcRest<Array<{ texto: string; categoria: string; facet: string; evidencias: number }>>(
    'ai_prompt_learnings',
    {
      p_user: userId,
      p_editorial: input.editorial_slug,
      p_platform: input.target_platform ?? 'linkedin',
      p_avatar: input.target_avatar ?? 'ambos',
      p_facets: ['texto', 'legenda'],
    },
  );

  return {
    editorial: editorial[0],
    arsenalItem: arsenalItem[0],
    avatars,
    examples,
    glossary,
    doRules, dontRules, generalRules,
    headlineTypes,
    analogiesNew, analogiesUsed,
    hashtags,
    genesis: {
      core: genesisCore[0],
      principios: genesisPrincipios,
      lentes: genesisLentes,
      tensoes: genesisTensoes,
      fluxo: genesisFluxo,
    },
    directives,
    learnings,
  };
}

// Emite um evento pro barramento da Alma (fire-and-forget, service role).
async function emitAlmaEvent(evt: {
  tipo: string; descricao: string; source?: string;
  dimensao_slug?: string | null; delta?: number | null; payload?: object;
}): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  try {
    await fetch(`${supabaseUrl}/rest/v1/alma_eventos`, {
      method: 'POST',
      headers: { ...svcHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify({
        tipo: evt.tipo,
        descricao: evt.descricao,
        source: evt.source ?? 'generate-content',
        dimensao_slug: evt.dimensao_slug ?? null,
        delta: evt.delta ?? null,
        payload: evt.payload ?? {},
      }),
    });
  } catch { /* noop */ }
}

// Incrementa uso do material consumido na geracao (via RPC SQL).
async function bumpUsage(arsenalId: string | undefined, exampleIds: (string | undefined)[]): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const calls: Promise<unknown>[] = [];
  const rpc = (fn: string, body: object) =>
    fetch(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: svcHeaders(),
      body: JSON.stringify(body),
    }).catch(() => undefined);
  if (arsenalId) calls.push(rpc('bump_arsenal_usage', { p_id: arsenalId }));
  for (const id of exampleIds) if (id) calls.push(rpc('bump_example_usage', { p_id: id }));
  try { await Promise.all(calls); } catch { /* noop */ }
}

type RagHit = { content: string; similarity: number; document_title: string };

async function matchChunks(apiKey: string, query: string, userId: string, topK: number): Promise<RagHit[]> {
  const q = query?.trim();
  if (!q || q.length < 5) return [];
  try {
    const queryEmbedding = await embedText(apiKey, q, 'RETRIEVAL_QUERY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/match_knowledge`, {
      method: 'POST',
      headers: svcHeaders(),
      body: JSON.stringify({
        query_embedding: queryEmbedding,
        match_count: topK,
        match_threshold: RAG_THRESHOLD,
        filter_user_id: userId,
      }),
    });
    if (!res.ok) {
      console.warn('[rag] match failed', await res.text());
      return [];
    }
    return (await res.json()) as RagHit[];
  } catch (e) {
    console.warn('[rag] error', e);
    return [];
  }
}

// Recupera os FATOS REAIS do autor da base de conhecimento (RAG).
// Ponto crítico: quando há um briefing específico (ex.: "narre minha saída da
// Korn/Ferry"), faz uma busca DEDICADA a ele. Antes o briefing era só 1/6 da
// query temática (editorial + arsenal + avatar + ...), o vetor derivava pra
// longe e a história real NÃO era recuperada — o modelo inventava. Agora o
// pedido explícito é a busca primária; a query temática só complementa. Junta
// as duas, priorizando o briefing, e deduplica por conteúdo.
async function retrieveContext(
  apiKey: string,
  themeQuery: string,
  briefing: string | undefined,
  userId: string,
): Promise<string> {
  const brief = briefing?.trim();
  const focused = brief && brief.length >= 5 ? await matchChunks(apiKey, brief, userId, RAG_TOP_K) : [];
  const theme = await matchChunks(apiKey, themeQuery, userId, focused.length ? 4 : RAG_TOP_K);

  const seen = new Set<string>();
  const merged: RagHit[] = [];
  for (const r of [...focused, ...theme]) {          // briefing primeiro
    const key = r.content.slice(0, 120);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(r);
    if (merged.length >= 10) break;
  }
  if (!merged.length) return '';
  return merged
    .map((r, i) => `[Trecho ${i + 1} | fonte: ${r.document_title} | sim: ${r.similarity.toFixed(2)}]\n${r.content}`)
    .join('\n\n---\n\n');
}

// Renderiza o catalogo de templates + as regras de escolha (so Instagram).
// O modelo pensa a FORMA junto com o conteudo e escreve a frase JA moldada pro
// template escolhido. Significado primeiro; diversidade pressiona; M02 so com
// foto real (honestidade). Retorna [] quando nao ha catalogo (LinkedIn).
function templateSectionLines(templates: TemplateCatalog | null): string[] {
  if (!templates || templates.variants.length === 0) return [];
  const lines: string[] = [];
  const maniName: Record<string, string> = {};
  for (const m of templates.manifests) maniName[m.id] = m.nome;

  lines.push('=== TEMPLATES VISUAIS DO INSTAGRAM (pense a FORMA junto com o conteudo) ===');
  lines.push('Neste post voce NAO escreve no vacuo: primeiro considere TODOS os templates abaixo, ESCOLHA UM, e escreva a frase da imagem JA moldada pra ele (dentro do limite de chars dele). A forma e o conteudo nascem juntos.');
  lines.push('Como escolher (nesta ordem de prioridade):');
  lines.push('  1. SIGNIFICADO PRIMEIRO: escolha o template que a IDEIA pede. Nunca force uma forma que trai o texto.');
  lines.push('  2. M02 (Rosto + Pensamento) so quando a PRESENCA HUMANA acrescenta significado que a frase sozinha nao tem — foto e pensamento viram UMA mensagem (se tirar a foto, algo essencial some). Nao use M02 so pra variar.');
  lines.push(`  3. HONESTIDADE VISUAL: existem ${templates.realMarcosCount} foto(s) REAIS do Marcos na biblioteca. As variacoes que exigem o rosto reconhecivel (ex: M02-A/M02-B) SO podem ser escolhidas se houver foto real. NUNCA se fabrica o rosto do Marcos.`);
  if (templates.recentVariants.length) {
    lines.push(`  4. VARIE O FEED: os posts recentes usaram, do mais novo ao mais antigo: ${templates.recentVariants.join(', ')}. De variedade — evite repetir o mesmo template da vez passada, DESDE QUE o significado permita.`);
  } else {
    lines.push('  4. VARIE O FEED: distribua entre os templates ao longo do tempo — nao caia sempre no mesmo.');
  }
  lines.push('');
  lines.push('MANIFESTACOES:');
  for (const m of templates.manifests) {
    lines.push(`- ${m.id} (${m.nome} · ${m.operacao}) | usar: ${JSON.stringify(m.quando_usar)} | NAO: ${JSON.stringify(m.quando_nao)}`);
  }
  lines.push('');
  lines.push('VARIACOES (escolha 1 — "template_id" e o id EXATO, ex: "M01-C"):');
  for (const v of templates.variants) {
    const lim = v.limites ?? {};
    const max = Number(lim.chars_limit ?? 200);
    const destaque = Boolean(lim.destaque_permitido);
    const img = Boolean(lim.image_required);
    lines.push(
      `- ${v.id} (${v.nome} · ${v.operacao}) | usar: ${JSON.stringify(v.quando_usar)} | evitar: ${JSON.stringify(v.quando_nao)} | max_chars_frase: ${max} | destaque_permitido: ${destaque}${img ? ' | EXIGE foto real do Marcos' : ''}`,
    );
  }
  lines.push('');
  // ANTI-FIXACAO: o motor viciava em M01-B (Tensao). Corrige a tendencia.
  lines.push('ATENCAO CONTRA O VICIO (nao caia sempre no M01-B/Tensao):');
  lines.push('  - NAO rotule o texto como "tensao/paradoxo" por padrao. M01-B (Tensao) SO quando ha um PARADOXO real, uma oposicao conceitual forte ou uma ruptura explicita DENTRO da frase. Uma frase apenas afirmativa/reflexiva NAO e M01-B.');
  lines.push('  - Na duvida entre A e B, escolha A (Essencial). O default e A, nao B.');
  lines.push('  - Distribua DE VERDADE entre A, B, C, D e E ao longo dos posts — cada uma serve a um tipo de frase diferente (ver "usar"). Repetir o mesmo template e falha.');
  lines.push('');
  return lines;
}

// Descreve os campos de FORMA que cada variacao deve devolver (so Instagram).
function formFieldsSpec(): string[] {
  return [
    '  Alem dos campos de texto, cada objeto DEVE trazer os campos da FORMA escolhida:',
    '  - "template_id": id EXATO do template escolhido (ex: "M01-C", "M02-A", "M03-A").',
    '  - "manifestation": "M01" | "M02" | "M03" (o prefixo do template).',
    '  - "highlight": { "target": "<1 a 5 palavras REAIS da frase que marcam a virada>", "reason": "<curto>" } — ou null. So preencha se o template escolhido tiver destaque_permitido=true.',
    '  - "subtitle": SO para M02 — frase secundaria curta (ate 60 chars), um eco aforistico do proprio pensamento, SEM fatos/nomes/datas novos. Senao "".',
    '  - "poles": SO para M03-A — { "a": "<1o polo, ate 14 chars, tirado da frase>", "b": "<2o polo>" }. Senao null.',
    '  - "image_scene_hint": SO se escolher M02 e NAO houver foto real que sirva — 1 frase de cena plausivel e honesta (pessoa parcial/de costas/pequena, luz natural). Senao "".',
    '  - "human_presence_adds_meaning": true|false — a presenca humana acrescenta significado real?',
    '  - "mode_reason": por que ESTA manifestacao. "variant_reason": por que ESTA variacao.',
  ];
}

function buildSystemPrompt(
  ctx: Awaited<ReturnType<typeof loadBeeContext>>,
  ragContext: string,
  input: GenerateInput,
  referencePost: ReferencePost | null,
  pastArsenalPosts: any[] = [],
  templates: TemplateCatalog | null = null,
): string {
  const ed = ctx.editorial;
  const ai = ctx.arsenalItem;
  const lines: string[] = [];

  // CAMADA 0 — CONSTITUICAO COGNITIVA (GENESIS): governa TUDO abaixo.
  const g = ctx.genesis;
  const core = g?.core;
  lines.push('=== CAMADA 0 — CONSTITUICAO COGNITIVA (GENESIS) ===');
  lines.push('Esta camada GOVERNA tudo abaixo. Se qualquer instrucao posterior conflitar com ela, esta prevalece.');
  if (core?.missao) lines.push(`Missao: ${core.missao}`);
  if (core?.frase_organizadora) lines.push(`Frase que organiza tudo: ${core.frase_organizadora}`);
  if (core?.pergunta_silenciosa) lines.push(`Pergunta silenciosa (carregue sempre): ${core.pergunta_silenciosa}`);
  lines.push('');

  if (g?.principios?.length) {
    const byCamada = (c: string) => g.principios.filter((p) => p.camada === c);
    const art = byCamada('constituicao_agente');
    const epi = byCamada('epistemologia');
    const diag = byCamada('diagnostico');
    const ling = byCamada('linguagem');
    const para = byCamada('paradigma');

    if (art.length) {
      lines.push('REGRAS INVIOLÁVEIS (o que o agente sempre/nunca faz):');
      art.forEach((p) => lines.push(`  • ${p.principio}${p.aplicacao ? ` — ${p.aplicacao}` : ''}`));
    }
    if (epi.length) {
      lines.push('COMO PENSA (postura diante do que sabe):');
      epi.forEach((p) => lines.push(`  • ${p.principio}`));
    }
    if (diag.length) {
      lines.push('COMO OBSERVA (antes de escrever):');
      diag.forEach((p) => lines.push(`  • ${p.principio}`));
    }
    if (ling.length) {
      lines.push('COMO FALA:');
      ling.filter((p) => p.codigo !== 'ling-regua').forEach((p) => lines.push(`  • ${p.principio}`));
    }
    para.forEach((p) => lines.push(`Ao navegar tensoes: ${p.principio}${p.aplicacao ? ` (${p.aplicacao})` : ''}`));
    lines.push('');
  }

  // TENSOES — as grandes polaridades que o conteúdo navega (localizar de onde o leitor percebe)
  if (g?.tensoes?.length) {
    lines.push('AS TENSOES (polaridades que o conteudo navega) — localize de que polo o leitor percebe a realidade:');
    g.tensoes.forEach((pp) => lines.push(`  • ${pp.nome}${pp.arquetipo ? ` (${pp.arquetipo})` : ''}: ${pp.logica} Sofrimento tipico: ${pp.sofrimento_tipico}`));
    lines.push('A maturidade INTEGRA os polos — nunca escolhe um lado nem humilha quem esta no outro.');
    lines.push('');
  }

  // FLUXO COGNITIVO — raciocine ANTES de escrever
  if (g?.fluxo?.length) {
    lines.push('FLUXO COGNITIVO — responda em silencio, nesta ordem, ANTES de escrever (nao imprima as respostas):');
    g.fluxo.forEach((f) => lines.push(`  ${f.ordem}. ${f.pergunta}${f.nota ? ` (${f.nota})` : ''}`));
    lines.push('');
  }

  // PERSONA (do genesis_core — Marcos Piccini)
  lines.push(`Voce e ${core?.persona_nome ?? 'Marcos Piccini'}, escrevendo para a Bee Academy.`);
  if (core?.persona_postura) lines.push(`Postura: ${core.persona_postura}`);
  lines.push('Autoridade que vem de 20 anos de cases reais e dois livros. Nao tem respostas prontas — tem perguntas que ninguem esta fazendo.');
  if (core?.voz_como_escreve) lines.push(`Como escreve: ${core.voz_como_escreve}`);
  if (core?.voz_verbos?.length) lines.push(`Verbos de percepcao a preferir: ${core.voz_verbos.join(', ')}.`);
  if (core?.voz_nunca?.length) lines.push(`Nunca: ${core.voz_nunca.join(', ')}.`);
  lines.push('');

  // LENTES — formas de enxergar o tema (nao o centro; instrumentos de percepcao)
  if (g?.lentes?.length) {
    lines.push('=== LENTES (formas de enxergar o tema · 0=mecanico, 100=sistemico) ===');
    lines.push('Sao instrumentos de percepcao, nao o centro. Escreva do olhar sistemico, com atencao redobrada onde a oitava esta mais baixa:');
    g.lentes.forEach((d) => lines.push(`  • ${d.nome} (${d.oitava}): "${d.frase_sistemica}"`));
    lines.push('');
  }

  // LEITURA DO INTERLOCUTOR — avatar/estado da Matriz Cognitiva
  if (ctx.avatars.length) {
    lines.push('=== LEITURA DO INTERLOCUTOR (estado de consciencia) ===');
    lines.push('Escreva do estado onde a pessoa esta, mirando o PROXIMO movimento possivel — nunca dois adiante. Os avatares sao ESTADOS, nunca identidades: jamais rotule a pessoa.');
    if (ctx.avatars.length > 1) {
      lines.push('O post deve ressoar nos dois estados abaixo sem tratar nenhum como superior.');
    }
    ctx.avatars.forEach((av) => {
      lines.push(`\n--- ${av.nome} (percepcao ${av.eixo_percepcao}/100 · identificacao ${av.eixo_identificacao}/100) ---`);
      if (av.pergunta_central) lines.push(`Pergunta central dele: "${av.pergunta_central}"`);
      if (av.sofrimento) lines.push(`Sofrimento: ${av.sofrimento}`);
      if (av.linguagem) lines.push(`Linguagem que reconhece: ${av.linguagem}`);
      if (av.frase_silenciosa) lines.push(`Frase silenciosa: "${av.frase_silenciosa}"`);
      if (av.frases_tipicas?.length) lines.push(`Frases tipicas: ${av.frases_tipicas.map((f) => `"${f}"`).join(' · ')}`);
      if (av.como_conversar) lines.push(`COMO CONVERSAR: ${av.como_conversar}`);
      if (av.erros_comuns) lines.push(`Erro a evitar: ${av.erros_comuns}`);
      if (av.movimento_seguinte) lines.push(`Proximo movimento a convidar (sutil, sem empurrar): ${av.movimento_seguinte}`);
    });
    lines.push('');
  }

  // EDITORIAL
  if (ed) {
    lines.push(`=== EDITORIAL ESCOLHIDO: ${ed.name} ===`);
    lines.push(ed.description);
    if (ed.objetivo) lines.push(`Objetivo deste pilar: ${ed.objetivo}`);
    if (ed.tom) lines.push(`Tom deste editorial: ${ed.tom}`);
    lines.push(`Estrutura obrigatoria: ${ed.structure_template}`);
    if (ed.emotional_sequence?.length) lines.push(`Sequencia emocional: ${ed.emotional_sequence.join(' → ')}`);
    if (ed.temas?.length) lines.push(`Temas recorrentes: ${ed.temas.join('; ')}`);
    if (ed.fazer?.length) lines.push(`SEMPRE faz: ${ed.fazer.map((x) => `• ${x}`).join(' ')}`);
    if (ed.evitar?.length) lines.push(`NUNCA faz: ${ed.evitar.map((x) => `• ${x}`).join(' ')}`);

    // Publico-alvo PROPRIO deste editorial (aditivo ao avatar identificado/incomodado)
    const a = ed.audience;
    if (a && (a.quem || a.dor || a.desejo)) {
      lines.push('--- PUBLICO-ALVO DESTE EDITORIAL ---');
      if (a.quem) lines.push(`Quem: ${a.quem}`);
      if (a.dor) lines.push(`Dor: ${a.dor}`);
      if (a.desejo) lines.push(`Desejo: ${a.desejo}`);
      if (a.objecoes?.length) lines.push(`Objecoes a vencer: ${a.objecoes.join('; ')}`);
      if (a.gatilhos?.length) lines.push(`Gatilhos que param o scroll: ${a.gatilhos.join('; ')}`);
      if (a.linguagem) lines.push(`Linguagem dela: ${a.linguagem}`);
    }
    lines.push('');
  }

  // POST DE REFERENCIA (adaptacao cross-platform)
  if (referencePost) {
    const origPlatform = referencePost.platform === 'instagram' ? 'Instagram' : 'LinkedIn';
    const destPlatform = input.target_platform === 'instagram' ? 'Instagram' : 'LinkedIn';
    lines.push(`=== POST DE REFERENCIA — ADAPTAR ===`);
    lines.push(`Este e um post ja publicado em ${origPlatform}. Voce esta adaptando pra ${destPlatform}.`);
    lines.push(`Mantenha a ESSENCIA (a mesma virada sistemica, a mesma analogia se couber), mas:`);
    lines.push(`- Adapte o tom e ritmo pra o feed do ${destPlatform}`);
    lines.push(`- NAO copie literalmente. Reescreva.`);
    lines.push(`- Considere o avatar e editorial que o user escolheu pra esta nova versao.`);
    lines.push('');
    lines.push(`Quote original: "${referencePost.carousel_text?.quote ?? '(sem quote)'}"`);
    if (referencePost.carousel_text?.headline_type) {
      lines.push(`Tipo de titulo original: ${referencePost.carousel_text.headline_type}`);
    }
    if (referencePost.carousel_text?.analogy) {
      lines.push(`Analogia usada: ${referencePost.carousel_text.analogy}`);
    }
    lines.push('');
    lines.push(`Caption original:\n${referencePost.caption ?? '(sem caption)'}`);
    lines.push('=== FIM REFERENCIA ===');
    lines.push('');
  }

  // ARSENAL — é ÂNGULO/TEMA, não fonte de fato. Os fatos verdadeiros vêm sempre
  // dos FATOS REAIS (RAG/documentos do autor). Sem esse enquadramento, o modelo
  // narrava a semente do arsenal como se fosse uma história real que aconteceu.
  if (ai) {
    lines.push(`=== ARSENAL: ÂNGULO / TEMA SUGERIDO (direção temática — NÃO é fonte de fatos) ===`);
    lines.push('Isto é uma SUGESTÃO de tema/ângulo pra explorar — por si só NÃO é um fato verdadeiro nem uma história que aconteceu. Os fatos reais da narrativa vêm SEMPRE dos FATOS REAIS DO AUTOR (base de conhecimento). Se o ângulo abaixo não tiver respaldo nesses fatos reais, use-o apenas como direção de tema e NÃO narre os detalhes como se tivessem acontecido de verdade.');
    lines.push(`Tipo: ${ai.type}`);
    lines.push(`Titulo: ${ai.title}`);
    if (ai.summary) lines.push(`Resumo: ${ai.summary}`);
    if (ai.details) lines.push(`Detalhes:\n${ai.details}`);
    
    if (pastArsenalPosts && pastArsenalPosts.length > 0) {
      lines.push('');
      lines.push(`ATENCAO: POSTS ANTERIORES SOBRE ESTE MESMO ESTUDO DE CASO`);
      lines.push(`Abaixo estao posts que ja criamos usando este mesmo case. OBRIGATORIO: Mude o angulo. Se ja falamos do aspecto X, fale do aspecto Y. Traga um insight diferente e ignorado nesses posts anteriores:`);
      pastArsenalPosts.forEach((p, idx) => {
        const q = p.carousel_text?.quote ?? '';
        const c = p.caption ? p.caption.slice(0, 150).replace(/\n/g, ' ') + '...' : '';
        lines.push(`[Post ${idx+1}] Quote: "${q}" | Caption: ${c}`);
      });
    }
    lines.push('');
  }

  // FEW-SHOT EXAMPLES (poderosissimo)
  if (ctx.examples.length) {
    lines.push(`=== EXEMPLOS DE POSTS REAIS BEE NESTE EDITORIAL (siga o estilo, NAO copie) ===`);
    ctx.examples.forEach((ex, i) => {
      lines.push(`\n--- Exemplo ${i + 1} ---`);
      lines.push(`Frase da imagem: "${ex.image_quote}"`);
      lines.push(`Caption:`);
      lines.push(ex.caption);
      if (ex.why_good) lines.push(`Por que funciona: ${ex.why_good}`);
    });
    lines.push('');
  }

  // ESTILO DO / DONT / GENERAL
  if (ctx.doRules.length) {
    lines.push('=== O QUE A VOZ FAZ ===');
    ctx.doRules.forEach((r) => lines.push(`• ${r.rule}`));
    lines.push('');
  }
  if (ctx.dontRules.length) {
    lines.push('=== O QUE A VOZ NAO FAZ (REGRAS DURAS) ===');
    ctx.dontRules.forEach((r) => lines.push(`• ${r.rule}`));
    lines.push('');
  }
  if (ctx.generalRules.length) {
    lines.push('=== REGRAS GERAIS ===');
    ctx.generalRules.forEach((r) => lines.push(`• ${r.rule}`));
    lines.push('');
  }

  // APRENDIZADOS — o que ele te corrigiu antes.
  // Vem DEPOIS das regras de estilo de proposito: sao a camada mais recente e
  // mais especifica da voz, destilada do que ele mudou com a propria mao.
  if (ctx.learnings?.length) {
    lines.push('=== APRENDIZADOS (destilados das correcoes DELE) ===');
    lines.push('Ele ja te corrigiu nestes pontos. Nao repita o erro:');
    ctx.learnings.forEach((l) => {
      const peso = l.evidencias > 1 ? ` [reforcado ${l.evidencias}x]` : '';
      lines.push(`• ${l.texto}${peso}`);
    });
    lines.push('');
  }

  // HEADLINE TYPES
  if (ctx.headlineTypes.length) {
    lines.push('=== 4 TIPOS DE TITULO (escolha 1 para a frase da imagem) ===');
    ctx.headlineTypes.forEach((h) => {
      lines.push(`• ${h.name}: ${h.description}`);
      if (h.examples?.[0]) lines.push(`  Ex: "${h.examples[0]}"`);
    });
    lines.push('');
  }

  // GLOSSARIO
  const mustTerms = ctx.glossary.filter((g) => g.must_appear);
  if (mustTerms.length) {
    lines.push('=== TERMOS QUE DEVEM APARECER NO POST ===');
    mustTerms.forEach((t) => lines.push(`• ${t.term} — ${t.usage_note ?? t.meaning}`));
    lines.push('');
  }
  if (ctx.glossary.length) {
    lines.push('=== VOCABULARIO PROPRIETARIO (use quando fizer sentido) ===');
    ctx.glossary.forEach((g) => lines.push(`• ${g.term}: ${g.meaning}`));
    lines.push('');
  }

  // ANALOGIAS
  if (ctx.analogiesNew.length || ctx.analogiesUsed.length) {
    lines.push('=== BANCO DE ANALOGIAS (SO NATUREZA/BIOLOGIA — NUNCA TECNOLOGIA/FINANCAS) ===');
    if (ctx.analogiesNew.length) {
      lines.push('Ainda nao usadas (prefira estas se couber):');
      ctx.analogiesNew.forEach((a) => lines.push(`• ${a.name} — ${a.description}${a.best_for ? ` [bom pra: ${a.best_for}]` : ''}`));
    }
    if (ctx.analogiesUsed.length) {
      lines.push('Ja usadas (so se for muito apropriado):');
      ctx.analogiesUsed.forEach((a) => lines.push(`• ${a.name} — ${a.description}`));
    }
    lines.push('');
  }

  // HASHTAGS — assinatura (identidade da marca) + variedade por tema (alcance).
  // O problema antigo: as "obrigatórias" saíam SEMPRE iguais. Agora elas viram
  // assinatura (só as coerentes com o tema) e a IA compõe 2-4 de maior alcance,
  // variando conforme o assunto.
  const requiredHashtags = ctx.hashtags.filter((h) => h.required).map((h) => h.tag);
  if (requiredHashtags.length) {
    lines.push('=== HASHTAGS DE ASSINATURA (identidade da marca) ===');
    lines.push(requiredHashtags.join(' '));
    lines.push('Inclua as que forem COERENTES com o tema deste post (não precisa despejar todas se alguma não encaixar).');
    lines.push('');
  }
  const optionalHashtags = ctx.hashtags.filter((h) => !h.required).slice(0, 8);
  if (optionalHashtags.length) {
    lines.push('=== HASHTAGS ADICIONAIS DA BASE (escolha as relevantes ao tema) ===');
    optionalHashtags.forEach((h) => lines.push(`• ${h.tag}${h.topic ? ` [${h.topic}]` : ''}`));
    lines.push('');
  }
  lines.push('=== HASHTAGS DE ALCANCE (você compõe) ===');
  lines.push('Além das de assinatura, ADICIONE 2 a 4 hashtags de MAIOR ALCANCE específicas do TEMA deste post (ex: liderança, gestão de pessoas, cultura organizacional, mudança) — as que um público mais amplo realmente busca. Na voz da Bee: sem termo genérico/vazio, sem hashtag em excesso.');
  lines.push('VARIE conforme o assunto: dois posts de temas diferentes NÃO podem terminar com o mesmo conjunto de hashtags. Total final: 5 a 8 hashtags, TODAS no fim, depois de uma linha em branco, numa única linha separada por espaço.');
  lines.push('');

  // RAG — os FATOS REAIS do autor. Não é pano de fundo: é a MATÉRIA-PRIMA da
  // narrativa. Enquadrar assim (em vez de "trechos relevantes") faz o modelo
  // ancorar a história nos fatos reais em vez de inventar.
  if (ragContext) {
    lines.push('=== FATOS REAIS DO AUTOR (base de conhecimento) — NARRE A PARTIR DAQUI ===');
    lines.push('Estes trechos são a história e as vivências REAIS do autor, recuperadas da base dele. Quando o pedido for sobre uma história ou experiência específica, RECONSTRUA-A a partir DESTES fatos: pessoas, empresas, decisões, a sequência dos eventos e os sentimentos vêm daqui — não de invenção sua.');
    lines.push(ragContext);
    lines.push('=== FIM DOS FATOS REAIS ===');
    lines.push('');
  }

  // DIRETRIZES DE CRIAÇÃO — o OFÍCIO. Vem por último, colado nas REGRAS DE
  // SAÍDA, porque é o "como escrever de fato" que precisa estar mais fresco na
  // hora de produzir. Universal → plataforma → linha editorial.
  const dirs = ctx.directives ?? [];
  if (dirs.length) {
    const platLabel = input.target_platform === 'instagram' ? 'INSTAGRAM' : 'LINKEDIN';
    const fmt = (d: BeeDirective) => `${d.titulo ? `${d.titulo}: ` : ''}${d.instrucao}`;

    // Dentro de cada escopo, as diretrizes são agrupadas por TIPO — cada tipo
    // com enquadramento próprio (regra dura, proibição, preferência, estrutura).
    // 'criterio' também vira a autochecagem (QA), mas aqui entra como garantia.
    const renderScope = (label: string, items: BeeDirective[]) => {
      if (!items.length) return;
      const of = (t: string) => items.filter((d) => d.tipo === t);
      lines.push(`\n— ${label}:`);
      const regras = of('regra');
      if (regras.length) {
        regras.forEach((d) => lines.push(`  ${d.inviolavel ? '⛔ INVIOLÁVEL' : '•'} ${fmt(d)}`));
      }
      const fluxo = of('fluxo');
      if (fluxo.length) {
        lines.push('  Estrutura / fluxo (respeite a ordem):');
        fluxo.forEach((d, i) => lines.push(`    ${i + 1}. ${fmt(d)}`));
      }
      const fort = of('fortalecer');
      if (fort.length) {
        lines.push('  FORTALEÇA (priorize):');
        fort.forEach((d) => lines.push(`    ✓ ${fmt(d)}`));
      }
      const evi = of('evitar');
      if (evi.length) {
        lines.push('  NÃO FAÇA (proibido):');
        evi.forEach((d) => lines.push(`    ✗ ${fmt(d)}`));
      }
      const params = of('parametro');
      if (params.length) {
        lines.push('  Parâmetros:');
        params.forEach((d) => lines.push(`    • ${fmt(d)}`));
      }
      const crit = of('criterio');
      if (crit.length) {
        lines.push('  Garanta antes de entregar:');
        crit.forEach((d) => lines.push(`    ▸ ${fmt(d)}`));
      }
    };

    lines.push('=== DIRETRIZES DE CRIAÇÃO (o ofício — COMO escrever de fato) ===');
    lines.push('Regras concretas de execução. Obedeça-as ao construir título/frase e legenda. Sob a Constituição (Camada 0), mas acima das preferências de estilo. ⛔ = inviolável.');
    renderScope('UNIVERSAIS (todo post)', dirs.filter((d) => d.scope === 'universal'));
    renderScope(`DESTA PLATAFORMA (${platLabel})`, dirs.filter((d) => d.scope === 'platform'));
    renderScope('DESTA LINHA EDITORIAL', dirs.filter((d) => d.scope === 'editorial'));
    lines.push('');
  }

  // TEMPLATES VISUAIS (so Instagram) — a FORMA pensada junto com o conteudo.
  // Vem colado nas REGRAS DE SAIDA de proposito: e a ultima decisao antes de escrever.
  for (const l of templateSectionLines(templates)) lines.push(l);

  // REGRAS DE SAIDA
  lines.push('=== REGRAS DE SAIDA ===');
  // Anti-invenção: a espinha dorsal da confiança na Bee. O modelo NÃO fabrica
  // biografia. Ou usa os FATOS REAIS recuperados, ou fica no geral e honesto.
  lines.push('- CRÍTICO (Veracidade — regra máxima): NUNCA invente fatos biográficos: eventos, datas, números, cargos, empresas, lugares, diálogos ou cenas. Se o pedido for sobre uma história/experiência específica e ela estiver nos FATOS REAIS acima, narre SÓ a partir deles. Se um detalhe não estiver no material, NÃO preencha por conta própria — trabalhe apenas com o que é real. Sem fato real disponível, prefira falar de forma mais geral, conceitual e honesta a inventar uma cena. Inventar uma história que não aconteceu é o pior erro possível aqui.');
  lines.push('- CRÍTICO (Tom): a Bee tensiona a IDEIA, jamais a PESSOA. NADA de tom agressivo, ameaçador, acusatório, arrogante, cínico ou de "palestrinha"/lição de moral. Não humilhe, não julgue, não provoque medo, não aponte o dedo. A firmeza vem da clareza e da verdade, com calor humano: convida a perceber, nunca intimida. Se um trecho soar duro ou como ataque, suavize antes de devolver.');
  lines.push('- CRÍTICO (Exposição): nunca exponha pessoas ou empresas reais — nem no título, nem na legenda. Troque todo nome próprio por arquétipo (ver Anonimização). Nunca escreva um post que humilhe, ridicularize ou coloque alguém (real ou identificável) numa posição ruim. Na dúvida, generalize.');
  if (templates) {
    lines.push(`- "quote": frase da imagem. O LIMITE de chars e o "max_chars_frase" do TEMPLATE que voce escolher (ver TEMPLATES VISUAIS) — respeite-o. Nunca ultrapasse ${input.quote_max_chars ?? 200} chars em hipotese alguma. Use 1 dos 4 tipos de titulo.`);
  } else {
    lines.push(`- "quote": frase da imagem. MAXIMO ${input.quote_max_chars ?? 200} chars. Use 1 dos 4 tipos de titulo.`);
  }
  lines.push(`  CRÍTICO (Casing): Apenas a primeira letra da frase (e apos pontuacoes) deve ser maiuscula. NUNCA escreva a frase inteira em MAIUSCULAS (ALL CAPS).`);
  lines.push(`  CRÍTICO (Sentido): A frase deve carregar um sentido completo e encapsulado. Nao divida o mesmo raciocinio. A frase precisa ser auto-explicativa.`);
  lines.push(`  Sem emojis, sem hashtags nas frases.`);
  
  // Legenda em BLOCOS CURTOS por ideia (frases quase soltas, com respiro entre
  // elas) — leitura leve. O arco continua o mesmo, só que distribuído em vários
  // blocos curtos em vez de 3-4 parágrafos densos.
  lines.push('- "caption": escreva em BLOCOS CURTOS, UM POR IDEIA. Cada bloco tem 1 ou 2 frases (às vezes uma frase solta, quando ela tem peso). SEPARE cada bloco com UMA LINHA EM BRANCO (use \\n\\n no texto) pra dar respiro. Densidade > extensão: não encha linguiça, corte o que não for essencial.');
  lines.push('  NUNCA cole 3 ou mais frases no mesmo bloco. Alterne blocos de 1 e de 2 frases pra criar ritmo e leveza na leitura.');
  lines.push('  CRÍTICO (Anonimizacao): mantenha os EVENTOS reais (eles vêm dos FATOS REAIS), mas troque nomes próprios de pessoas e empresas por arquétipos (ex: "uma grande multinacional", "um diretor", "uma consultoria global de executivos"). Anonimizar é trocar só o RÓTULO — jamais inventar ou alterar o que aconteceu.');
  lines.push('  CRÍTICO (Formatacao): PROIBIDO travessões (— ou -) na legenda. Sem bullets/listas.');
  lines.push('  Arco (espalhado nos blocos, NÃO em 4 parágrafos): abre com GANCHO (os primeiros ~49 chars têm que prender, cabem no "ver mais") → tensão/aprofundamento → virada sistêmica com a analogia → fechamento que reverbera.');
  lines.push('  CRÍTICO (Fechamento): VARIE o fecho entre posts. NÃO use "Vê?" como padrão (está repetitivo) — alterne entre uma pergunta de implicação, uma afirmação curta que assenta a ideia, ou um convite à reflexão. No máximo raríssimas vezes um "Vê?"; por padrão, NÃO use.');
  // TAMANHO POR PLATAFORMA — no Instagram a legenda é CURTA (a profundidade mora
  // na imagem); no LinkedIn ela pode respirar mais e desenvolver o raciocínio.
  if (input.target_platform === 'instagram') {
    lines.push('  CRÍTICO (Tamanho — INSTAGRAM): legenda CURTA, estilo Instagram. NO MÁXIMO 3 a 4 blocos curtos (idealmente ~350–600 caracteres no total, nunca passe de ~700). A imagem já carrega a ideia — a legenda é o gancho + a virada + um respiro final, NÃO um ensaio. Corte tudo que for repetição do que a imagem já diz. Se estiver ficando longa, encurte: menos é mais aqui.');
  } else {
    lines.push('  Tamanho (LINKEDIN): a legenda pode se desenvolver mais (várias camadas), mas ainda em blocos curtos com respiro — profundidade sem encher linguiça.');
  }
  lines.push('- Frases curtas. Cada uma com peso. Sem rodeios.');
  lines.push('- "headline_type_used": slug (contradicao-direta, diagnostico-imperativo, pergunta-que-implica, metafora-que-nomeia).');
  lines.push('- "analogy_used": nome da analogia (ou null).');
  // NOTA DE VIRALIZACAO — a IA se auto-avalia. Nao ha dado real de engajamento
  // ainda; e uma estimativa honesta baseada na forca do gancho e da tensao.
  lines.push('- "virality_score": inteiro de 0 a 100 estimando o potencial de viralizacao DESTE post.');
  lines.push('  Avalie: forca do gancho (primeiros 49 chars), tensao/contra-intuicao da virada, clareza do CTA, ressonancia com a dor do avatar. Seja honesto e calibrado — reserve 85+ so pra ganchos realmente fortes.');
  lines.push('- "virality_reason": UMA frase curta (max 90 chars) justificando a nota.');

  const baseKeys = '"quote", "caption", "headline_type_used", "analogy_used", "virality_score", "virality_reason"';
  const objKeys = templates
    ? `{ ${baseKeys}, "template_id", "manifestation", "highlight", "subtitle", "poles", "image_scene_hint", "human_presence_adds_meaning", "mode_reason", "variant_reason" }`
    : `{ ${baseKeys} }`;

  const n = variationCount(input);
  if (n > 1) {
    lines.push('');
    lines.push(`=== FORMATO: ${n} VARIACOES ===`);
    lines.push(`- Devolva um JSON com a chave "variations": um array de EXATAMENTE ${n} objetos.`);
    lines.push(`- Cada objeto: ${objKeys}.`);
    if (templates) for (const l of formFieldsSpec()) lines.push(l);
    // O ponto das variacoes e dar ESCOLHA. Cinco textos parecidos nao ensinam
    // nada sobre a preferencia do usuario — cada uma tem que atacar por um lado.
    lines.push(`- Cada variacao ataca por um ANGULO DIFERENTE. Varie o "headline_type_used" entre elas:`);
    lines.push('  nao repita o mesmo tipo de titulo em duas variacoes enquanto houver tipo nao usado.');
    lines.push('- Nao sao versoes da mesma frase com sinonimos trocados: sao entradas diferentes no mesmo tema.');
    lines.push('- Cada variacao recebe sua PROPRIA virality_score (elas devem diferir — reflita a forca real de cada uma).');
    lines.push('- Todas obedecem as mesmas REGRAS DE SAIDA acima.');
  } else {
    lines.push(`- Devolva um JSON com a chave "variations": um array de 1 objeto ${objKeys}.`);
    if (templates) for (const l of formFieldsSpec()) lines.push(l);
  }

  // AUTOCHECAGEM — Regra de Ouro / régua da comunicacao (Genesis)
  lines.push('');
  lines.push('=== AUTOCHECAGEM ANTES DE DEVOLVER (Regra de Ouro) ===');
  const regua = ctx.genesis?.principios?.find((p) => p.codigo === 'ling-regua');
  if (regua) lines.push(`- ${regua.principio}`);
  lines.push('- Se esta pessoa nunca mais conversar com voce, este texto continua produzindo vida (percepcao/liberdade)? Se nao, reescreva antes de devolver.');
  lines.push('');
  lines.push('- Saida em JSON puro, SEM markdown.');

  return lines.join('\n');
}

// 1..5. Fora disso e erro de chamada, nao pedido valido.
function variationCount(input: GenerateInput): number {
  const n = Math.round(input.variations ?? 1);
  return Math.max(1, Math.min(5, Number.isFinite(n) ? n : 1));
}

function buildUserPrompt(input: GenerateInput, arsenalItem?: { title: string; summary: string }): string {
  const parts: string[] = [];
  if (arsenalItem) {
    parts.push(`Gere um post a partir do material do arsenal: "${arsenalItem.title}" — ${arsenalItem.summary}`);
  }
  if (input.briefing) {
    parts.push(`Contexto adicional / briefing:\n${input.briefing}`);
  }
  if (parts.length === 0) {
    parts.push('Gere um post seguindo a estrutura do editorial escolhido, usando o material do RAG e os exemplos few-shot como fonte primaria.');
  }
  parts.push('\nDevolva o JSON conforme as regras de saida.');
  return parts.join('\n\n');
}

async function callGeminiOnce(apiKey: string, sys: string, usr: string, model: string, maxOutputTokens: number) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  return await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: sys }] },
      contents: [{ role: 'user', parts: [{ text: usr }] }],
      generationConfig: {
        temperature: 0.9,
        maxOutputTokens,
        responseMimeType: 'application/json',
      },
    }),
  });
}

// O orcamento de saida cresce com o numero de variacoes. Piso ALTO (7000) de
// proposito: o gemini-3.x-flash "pensa" antes de responder e o pensamento conta
// no maxOutputTokens; com 4000 o pensamento comia o orcamento e a legenda
// truncava no meio de uma palavra (ex: "...descomprom"). ~1600 por variacao
// extra pras 5 captions de blocos curtos caberem sem quebrar o JSON.
function outputBudget(variations: number): number {
  return Math.min(7000 + Math.max(0, variations - 1) * 1600, 20000);
}

async function callGemini(
  apiKey: string,
  sys: string,
  usr: string,
  maxOutputTokens: number,
): Promise<{ text: string; usage: { input?: number; output?: number }; model_used: string }> {
  let lastErr = '';
  for (const model of MODEL_CHAIN) {
    console.log(`[generate-content] tentando modelo: ${model}`);
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const res = await callGeminiOnce(apiKey, sys, usr, model, maxOutputTokens);
        if (!res.ok) {
          const errText = (await res.text()).slice(0, 400);
          lastErr = `[${model}] HTTP ${res.status}: ${errText}`;
          console.warn(`[generate-content] ${lastErr}`);
          if (res.status === 503 || res.status === 429) {
            await new Promise((r) => setTimeout(r, (attempt + 1) * 2000));
            continue;
          }
          break;
        }
        const json = await res.json();
        const candidate = json.candidates?.[0];
        const finishReason = candidate?.finishReason;
        const text = candidate?.content?.parts?.[0]?.text ?? '';
        console.log(
          `[generate-content] ${model} attempt ${attempt + 1} → finishReason=${finishReason} text_len=${text.length}`,
        );
        if (!text || text.trim().length < 20) {
          lastErr = `[${model}] resposta vazia/curta. finishReason=${finishReason}`;
          if (finishReason === 'MAX_TOKENS') break;
          await new Promise((r) => setTimeout(r, (attempt + 1) * 1500));
          continue;
        }
        return {
          text,
          usage: {
            input: json.usageMetadata?.promptTokenCount,
            output: json.usageMetadata?.candidatesTokenCount,
          },
          model_used: model,
        };
      } catch (e) {
        lastErr = `[${model}] ${(e as Error).message}`;
        console.warn(`[generate-content] excecao: ${lastErr}`);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }
  throw new Error(`Gemini falhou em toda cadeia. Ultimo: ${lastErr}`);
}

// Recupera JSON cortado no meio (geralmente caption longa que estourou tokens).
// Estrategia: fecha string aberta + objeto aberto.
// Fecha um JSON truncado respeitando a ESTRUTURA que ficou aberta.
//
// A versao anterior so acrescentava '}' — nasceu quando a saida era um objeto
// solto. Com { "variations": [ ... ] } isso produz JSON invalido: faltava
// fechar o objeto corrente, o array E o envelope, nessa ordem.
//
// Percorre fora de string, empilha { e [, e fecha na ordem inversa. Se parou
// dentro de uma string, fecha a string antes. O ultimo elemento pode sair
// incompleto — quem chama descarta variacao sem quote+caption.
function tryRecoverTruncatedJson(raw: string): string {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (escaped) { escaped = false; continue; }
    if (c === '\\') { escaped = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === '{' || c === '[') stack.push(c);
    else if (c === '}' || c === ']') stack.pop();
  }

  let out = raw;
  if (inString) out += '"';
  // Corta uma vírgula/dois-pontos pendurados: "a": <fim> nao fecha.
  out = out.replace(/[,:]\s*$/, '');
  while (stack.length) {
    const open = stack.pop();
    out += open === '{' ? '}' : ']';
  }
  return out;
}

interface RawVariation {
  quote?: string;
  caption?: string;
  headline_type_used?: string;
  analogy_used?: string;
  virality_score?: number | string;
  virality_reason?: string;
  // Campos da FORMA (so Instagram, quando o catalogo de templates foi enviado).
  template_id?: string;
  manifestation?: string;
  highlight?: { target?: string; reason?: string } | null;
  subtitle?: string | null;
  poles?: { a?: string; b?: string } | null;
  image_scene_hint?: string;
  human_presence_adds_meaning?: boolean;
  mode_reason?: string;
  variant_reason?: string;
}

// Monta o hive_seed a partir dos campos crus de forma. So retorna algo quando o
// modelo escolheu um template (Instagram) — no LinkedIn/fluxo classico fica undefined.
function extractHiveSeed(v: RawVariation): HiveSeed | undefined {
  const variant = typeof v.template_id === 'string' ? v.template_id.trim().toUpperCase() : '';
  if (!variant) return undefined;
  const hl = v.highlight && typeof v.highlight.target === 'string' && v.highlight.target.trim()
    ? { target: v.highlight.target.trim(), reason: String(v.highlight.reason ?? '') }
    : null;
  const poles = v.poles && (v.poles.a || v.poles.b)
    ? { a: String(v.poles.a ?? '').trim(), b: String(v.poles.b ?? '').trim() }
    : null;
  return {
    variant,
    manifestation: String(v.manifestation ?? variant.split('-')[0] ?? '').toUpperCase(),
    highlight: hl,
    subtitle: typeof v.subtitle === 'string' && v.subtitle.trim() ? v.subtitle.trim() : null,
    poles,
    image_scene_hint: typeof v.image_scene_hint === 'string' ? v.image_scene_hint.trim() : '',
    human_presence_adds_meaning: Boolean(v.human_presence_adds_meaning),
    mode_reason: String(v.mode_reason ?? ''),
    variant_reason: String(v.variant_reason ?? ''),
  };
}

// Aceita number ou string ("87"), clampa em 0..100. undefined se ausente/invalido.
function normalizeScore(raw: number | string | undefined): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, Math.min(100, n));
}

function normalizeVariation(v: RawVariation): GenerateVariation | null {
  if (typeof v?.quote !== 'string' || typeof v?.caption !== 'string') return null;
  const quote = v.quote.trim();
  const caption = v.caption.trim();
  if (!quote || !caption) return null;
  return {
    quote,
    caption,
    headline_type_used: v.headline_type_used,
    analogy_used: v.analogy_used,
    virality_score: normalizeScore(v.virality_score),
    virality_reason: typeof v.virality_reason === 'string' ? v.virality_reason.trim() : undefined,
    hive_seed: extractHiveSeed(v),
  };
}

function parseGeminiJson(raw: string, expected: number): GenerateOutput {
  const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/```$/, '').trim();
  let parsed: { variations?: RawVariation[] } & RawVariation;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    console.warn('[generate-content] JSON.parse falhou, tentando recovery:', (e as Error).message);
    const recovered = tryRecoverTruncatedJson(cleaned);
    try {
      parsed = JSON.parse(recovered);
      console.log('[generate-content] JSON recuperado (ultima variacao pode estar parcial)');
    } catch (e2) {
      // Sem isto, um JSON quebrado vira so "SyntaxError na posicao N" e nao da
      // pra saber se truncou, se veio markdown, ou se o modelo inventou formato.
      console.error('[generate-content] recovery falhou. len=%d inicio=%s fim=%s',
        cleaned.length, cleaned.slice(0, 160), cleaned.slice(-160));
      throw e2;
    }
  }

  // Aceita os dois formatos: { variations: [...] } e o objeto solto de antes.
  // O modelo as vezes ignora o envelope, e uma variacao boa num formato
  // inesperado vale mais que um erro.
  const list: RawVariation[] = Array.isArray(parsed?.variations)
    ? parsed.variations
    : [parsed];

  const out = list.map(normalizeVariation).filter((v): v is GenerateVariation => v !== null);
  if (out.length === 0) throw new Error('JSON invalido (nenhuma variacao com quote+caption)');

  // Pediu 5 e vieram 3? Devolve as 3. Falta de variacao nao justifica descartar
  // o que veio bom — quem chamou decide o que fazer com menos.
  if (out.length < expected) {
    console.warn(`[generate-content] pedi ${expected} variacoes, vieram ${out.length}`);
  }
  return { variations: out.slice(0, expected) };
}

Deno.serve(async (req: Request) => {
  const cors = preflight(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Use POST', 405);

  try {
    // Usuario logado, ou o cron agindo por ele (service_role + x-bee-user-id).
    const userId = userIdFromAuth(req) ?? internalUserId(req);
    if (!userId) return errorResponse('Nao autenticado', 401);

    const rl = checkRateLimit(userId, 60_000, 20);
    if (!rl.ok) return errorResponse(`Rate limit. Tente em ${Math.ceil(rl.resetIn / 1000)}s`, 429);

    const input = (await req.json()) as GenerateInput;
    if (!input.editorial_slug) return errorResponse('editorial_slug obrigatorio', 400);

    const apiKey = await getUserGeminiKey(userId);
    if (!apiKey) return errorResponse('Chave Gemini nao configurada', 400);

    const ctx = await loadBeeContext(input, userId);
    if (!ctx.editorial) return errorResponse(`Editorial '${input.editorial_slug}' nao encontrado`, 400);

    // Carrega posts passados que usaram este mesmo item de arsenal para nao repetir angulo
    let pastArsenalPosts: any[] = [];
    if (ctx.arsenalItem?.id) {
      pastArsenalPosts = await fetchRest<any[]>(
        `/user_posts?select=caption,carousel_text&metadata->>arsenal_item_id=eq.${ctx.arsenalItem.id}&order=created_at.desc&limit=3`
      );
    }

    // Carrega post de referencia se vier (adaptacao cross-platform)
    const referencePost = input.reference_post_id ? await fetchReferencePost(input.reference_post_id) : null;

    // Query TEMÁTICA (grounding geral). O briefing NÃO entra aqui — ele tem
    // busca própria e dedicada dentro de retrieveContext, senão fica diluído.
    const themeQuery = [
      ctx.editorial.name,
      ctx.arsenalItem?.title,
      ctx.arsenalItem?.summary,
      ctx.avatars[0]?.sofrimento,
      referencePost?.carousel_text?.quote,
    ].filter(Boolean).join(' . ');
    const ragContext = await retrieveContext(apiKey, themeQuery, input.briefing, userId);

    // Catalogo de templates visuais (so Instagram): faz o modelo pensar FORMA +
    // conteudo juntos e escolher o template com variedade. LinkedIn: null (M01-A fixo).
    const templates = await loadTemplateCatalog(userId, input.target_platform);

    const sys = buildSystemPrompt(ctx, ragContext, input, referencePost, pastArsenalPosts, templates);
    const usr = buildUserPrompt(input, ctx.arsenalItem);

    const wanted = variationCount(input);
    const { text, usage, model_used } = await callGemini(apiKey, sys, usr, outputBudget(wanted));
    const parsed = parseGeminiJson(text, wanted);

    // Metodologia viva: marca o material usado (incrementa uso + last_used_at)
    // pra rotacionar nas proximas geracoes. Fire-and-forget — nao trava a resposta.
    void bumpUsage(ctx.arsenalItem?.id, (ctx.examples as BeeExamplePost[]).map((e) => e.id));

    // Barramento da Alma: a geracao alimenta a psique (fire-and-forget).
    void emitAlmaEvent({
      tipo: 'post_gerado',
      descricao: parsed.variations.length > 1
        ? `A Alma gerou ${parsed.variations.length} caminhos pra um "${ctx.editorial.name}"`
        : `A Alma gerou um "${ctx.editorial.name}"`,
      source: 'generate-content',
    });

    logUsage({
      userId,
      provider: 'gemini',
      product: 'text',
      model: model_used,
      tokens_input: usage?.input,
      tokens_output: usage?.output,
      metadata: {
        editorial: input.editorial_slug,
        arsenal_item_id: input.arsenal_item_id,
        target_avatar: input.target_avatar,
        target_platform: input.target_platform,
        reference_post_id: input.reference_post_id,
        rag_chars: ragContext.length,
        examples_used: ctx.examples.length,
        prompt_chars: sys.length,
      },
    });

    // Campos de topo espelham a 1a variacao: quem ja chamava esperando
    // { quote, caption } continua funcionando sem saber de variacoes.
    const first = parsed.variations[0];
    return jsonResponse({ success: true, ...first, variations: parsed.variations });
  } catch (e) {
    console.error('[generate-content]', e);
    return errorResponse('Erro ao gerar conteudo', 500, String(e));
  }
});

export {};
