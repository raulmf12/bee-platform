// _shared/bee-context.ts — O CÉREBRO COMPARTILHADO DA BEE.
//
// Dá aos agentes de CORREÇÃO (post-chat, edit-text, regenerate-snippet) o MESMO
// acesso e a MESMA capacidade do agente de GERAÇÃO: metodologia (Genesis),
// persona, avatares, editorial, arsenal, exemplos, diretrizes, aprendizados E a
// biblioteca real do usuário (RAG sobre knowledge_chunks).
//
// Antes, os agentes de correção enxergavam só o texto na tela — por isso pareciam
// "burros". Agora carregam o mesmo contexto e pensam com o cérebro inteiro.
//
// NOTA: a generate-content mantém a própria cópia (intocada, por segurança). A
// intenção é, num segundo passo, fundir a geração aqui também. Se mudar a regra
// de contexto, atualize os DOIS lugares até a unificação.

import { embedText } from './embed.ts';

// Cadeia de modelos — a mesma capacidade da geração (flash forte → pro).
export const BEE_MODEL_CHAIN = [
  Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.5-flash',
  'gemini-3.1-pro-preview',
  'gemini-2.5-pro',
];

const RAG_TOP_K = Number(Deno.env.get('RAG_TOP_K') ?? '8');
const RAG_THRESHOLD = Number(Deno.env.get('RAG_THRESHOLD') ?? '0.25');

// ---- Fetch helpers (service role) ----
function svcHeaders(): HeadersInit {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  return { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
}

async function fetchRest<T>(path: string): Promise<T> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const res = await fetch(`${supabaseUrl}/rest/v1${path}`, { headers: svcHeaders() });
  if (!res.ok) { console.warn('[bee-context fetchRest fail]', path, res.status); return [] as unknown as T; }
  return await res.json();
}

async function rpcRest<T>(fn: string, args: object): Promise<T> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: svcHeaders(), body: JSON.stringify(args),
  });
  if (!res.ok) { console.warn('[bee-context rpcRest fail]', fn, res.status); return [] as unknown as T; }
  return await res.json();
}

// ---- Types ----
interface BeeAudience { quem?: string; dor?: string; desejo?: string; objecoes?: string[]; gatilhos?: string[]; linguagem?: string }
interface BeeEditorial { slug: string; name: string; description: string; frequency_hint: string; structure_template: string; emotional_sequence: string[]; objetivo?: string; tom?: string; fazer?: string[]; evitar?: string[]; temas?: string[]; audience?: BeeAudience }
interface BeeArsenal { id?: string; title: string; summary: string; details: string | null; type: string }
interface BeeExamplePost { id?: string; editorial_slug: string; image_quote: string; caption: string; why_good: string; headline_type: string; analogy: string }
interface BeeGlossaryTerm { term: string; meaning: string; usage_note: string; must_appear: boolean }
interface BeeStyleRule { rule: string; rationale: string }
interface GenesisCore { persona_nome?: string; persona_postura?: string; missao?: string; frase_organizadora?: string; pergunta_silenciosa?: string; produto_real?: string; voz_como_escreve?: string; voz_verbos?: string[]; voz_nunca?: string[] }
interface GenesisPrincipio { camada: string; codigo: string; titulo: string | null; principio: string; aplicacao: string | null; inviolavel: boolean }
interface GenesisAvatar { slug: string; nome: string; eixo_percepcao: number; eixo_identificacao: number; pergunta_central: string | null; sofrimento: string | null; relacao_autoridade: string | null; linguagem: string | null; frase_silenciosa: string | null; o_que_teme: string | null; o_que_busca: string | null; frases_tipicas: string[] | null; como_conversar: string | null; erros_comuns: string | null; movimento_seguinte: string | null }
interface GenesisTensao { nome: string; arquetipo: string; logica: string; sofrimento_tipico: string }
interface GenesisLente { nome: string; oitava: number; frase_sistemica: string; natureza: string }
interface GenesisFluxo { ordem: number; pergunta: string; nota: string | null }
interface BeeDirective { scope: string; scope_ref: string | null; tipo: string; inviolavel: boolean; titulo: string | null; instrucao: string; ordem: number }

export interface BeeContextInput {
  editorial_slug: string;
  arsenal_item_id?: string;
  target_avatar?: 'identificado' | 'incomodado' | 'ambos';
  target_platform?: 'linkedin' | 'instagram';
}

// ---- Carrega o MESMO contexto que a geração usa ----
export async function loadBeeContext(input: BeeContextInput, userId: string) {
  const avatarSlugs = !input.target_avatar || input.target_avatar === 'ambos'
    ? ['identificado', 'incomodado']
    : [input.target_avatar];
  const avatarFilter = `&slug=in.(${avatarSlugs.join(',')})`;

  const [
    editorial, arsenalItem, avatars, examples, glossary,
    doRules, dontRules, generalRules,
    genesisCore, genesisPrincipios, genesisLentes, genesisTensoes, genesisFluxo, directives,
  ] = await Promise.all([
    fetchRest<BeeEditorial[]>(`/bee_editorials?slug=eq.${input.editorial_slug}&limit=1`),
    input.arsenal_item_id
      ? fetchRest<BeeArsenal[]>(`/bee_arsenal?id=eq.${input.arsenal_item_id}&limit=1`)
      : fetchRest<BeeArsenal[]>(`/bee_arsenal?editorial_slug=eq.${input.editorial_slug}&is_active=eq.true&order=last_used_at.asc.nullsfirst,usage_count.asc&limit=1`),
    fetchRest<GenesisAvatar[]>(`/genesis_avatares?order=ordem.asc${avatarFilter}`),
    fetchRest<BeeExamplePost[]>(`/bee_example_posts?editorial_slug=eq.${input.editorial_slug}&is_active=eq.true&order=last_used_at.asc.nullsfirst,position.asc&limit=2`),
    fetchRest<BeeGlossaryTerm[]>(`/bee_glossary?select=term,meaning,usage_note,must_appear`),
    fetchRest<BeeStyleRule[]>(`/bee_style_rules?category=eq.do&order=position.asc`),
    fetchRest<BeeStyleRule[]>(`/bee_style_rules?category=eq.dont&order=position.asc`),
    fetchRest<BeeStyleRule[]>(`/bee_style_rules?category=eq.general&order=position.asc`),
    fetchRest<GenesisCore[]>(`/genesis_core?limit=1`),
    fetchRest<GenesisPrincipio[]>(`/genesis_principios?ativo=eq.true&select=camada,codigo,titulo,principio,aplicacao,inviolavel&order=camada.asc,ordem.asc`),
    fetchRest<GenesisLente[]>(`/genesis_lentes?select=nome,oitava,frase_sistemica,natureza&order=ordem.asc`),
    fetchRest<GenesisTensao[]>(`/genesis_tensoes?select=nome,arquetipo,logica,sofrimento_tipico&order=ordem.asc`),
    fetchRest<GenesisFluxo[]>(`/genesis_fluxo?select=ordem,pergunta,nota&order=ordem.asc`),
    fetchRest<BeeDirective[]>(
      `/bee_directives?ativo=eq.true&select=scope,scope_ref,tipo,inviolavel,titulo,instrucao,ordem&or=(scope.eq.universal,and(scope.eq.platform,scope_ref.eq.${input.target_platform ?? 'linkedin'}),and(scope.eq.editorial,scope_ref.eq.${input.editorial_slug}))&order=scope.asc,ordem.asc`,
    ),
  ]);

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
    editorial: editorial[0], arsenalItem: arsenalItem[0], avatars, examples, glossary,
    doRules, dontRules, generalRules,
    genesis: { core: genesisCore[0], principios: genesisPrincipios, lentes: genesisLentes, tensoes: genesisTensoes, fluxo: genesisFluxo },
    directives, learnings,
  };
}
export type BeeContext = Awaited<ReturnType<typeof loadBeeContext>>;

// ---- RAG: a biblioteca real do usuário (mesma lógica da geração) ----
type RagHit = { content: string; similarity: number; document_title: string };

async function matchChunks(apiKey: string, query: string, userId: string, topK: number): Promise<RagHit[]> {
  const q = query?.trim();
  if (!q || q.length < 5) return [];
  try {
    const queryEmbedding = await embedText(apiKey, q, 'RETRIEVAL_QUERY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/match_knowledge`, {
      method: 'POST', headers: svcHeaders(),
      body: JSON.stringify({ query_embedding: queryEmbedding, match_count: topK, match_threshold: RAG_THRESHOLD, filter_user_id: userId }),
    });
    if (!res.ok) { console.warn('[bee-context rag] match failed', await res.text()); return []; }
    return (await res.json()) as RagHit[];
  } catch (e) { console.warn('[bee-context rag] error', e); return []; }
}

// Busca focada no PEDIDO (focusQuery) + tema (themeQuery), dedupe, prioriza o pedido.
export async function retrieveContext(apiKey: string, themeQuery: string, focusQuery: string | undefined, userId: string): Promise<string> {
  const focus = focusQuery?.trim();
  const focused = focus && focus.length >= 5 ? await matchChunks(apiKey, focus, userId, RAG_TOP_K) : [];
  const theme = await matchChunks(apiKey, themeQuery, userId, focused.length ? 4 : RAG_TOP_K);
  const seen = new Set<string>();
  const merged: RagHit[] = [];
  for (const r of [...focused, ...theme]) {
    const key = r.content.slice(0, 120);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(r);
    if (merged.length >= 10) break;
  }
  if (!merged.length) return '';
  return merged.map((r, i) => `[Trecho ${i + 1} | fonte: ${r.document_title} | sim: ${r.similarity.toFixed(2)}]\n${r.content}`).join('\n\n---\n\n');
}

// ---- Render do CÉREBRO num bloco de system prompt ----
// Mesmo conhecimento que a geração recebe. Não inclui as regras de FORMATO de
// saída (isso é específico de cada agente); inclui os guardrails invioláveis
// (veracidade, tom, exposição) porque valem em qualquer superfície.
export function renderBrain(ctx: BeeContext, ragContext: string): string {
  const L: string[] = [];
  const g = ctx.genesis;
  const core = g?.core;

  L.push('====================== CÉREBRO DA BEE (Camada 0 · Genesis) ======================');
  if (core?.missao) L.push(`Missão: ${core.missao}`);
  if (core?.frase_organizadora) L.push(`Frase organizadora: ${core.frase_organizadora}`);
  if (core?.produto_real) L.push(`O produto real: ${core.produto_real}`);

  const prin = g?.principios ?? [];
  const inviol = prin.filter((p) => p.inviolavel);
  const camada = (c: string) => prin.filter((p) => (p.camada ?? '').toLowerCase().includes(c));
  if (inviol.length) {
    L.push('\nREGRAS INVIOLÁVEIS (sempre/nunca):');
    inviol.forEach((p) => L.push(`  • ${p.principio}${p.aplicacao ? ` — ${p.aplicacao}` : ''}`));
  }
  const epi = camada('epist'); const diag = camada('diag'); const ling = camada('ling');
  if (epi.length) { L.push('COMO PENSA:'); epi.forEach((p) => L.push(`  • ${p.principio}`)); }
  if (diag.length) { L.push('COMO OBSERVA:'); diag.forEach((p) => L.push(`  • ${p.principio}`)); }
  if (ling.length) { L.push('COMO FALA:'); ling.filter((p) => p.codigo !== 'ling-regua').forEach((p) => L.push(`  • ${p.principio}`)); }

  if (g?.tensoes?.length) {
    L.push('\nAS TENSÕES (polaridades que o conteúdo navega):');
    g.tensoes.forEach((t) => L.push(`  • ${t.nome}${t.arquetipo ? ` (${t.arquetipo})` : ''}: ${t.logica} Sofrimento típico: ${t.sofrimento_tipico}`));
    L.push('A maturidade INTEGRA os polos — nunca escolhe um lado nem humilha quem está no outro.');
  }
  if (g?.lentes?.length) {
    L.push('\nLENTES (0=mecânico, 100=sistêmico) — escreva do olhar sistêmico:');
    g.lentes.forEach((d) => L.push(`  • ${d.nome} (${d.oitava}): "${d.frase_sistemica}"`));
  }

  // PERSONA
  L.push(`\nVocê é ${core?.persona_nome ?? 'Marcos Piccini'}, escrevendo para a Bee.`);
  if (core?.persona_postura) L.push(`Postura: ${core.persona_postura}`);
  if (core?.voz_como_escreve) L.push(`Como escreve: ${core.voz_como_escreve}`);
  if (core?.voz_verbos?.length) L.push(`Verbos de percepção a preferir: ${core.voz_verbos.join(', ')}.`);
  if (core?.voz_nunca?.length) L.push(`Nunca: ${core.voz_nunca.join(', ')}.`);

  // AVATARES
  if (ctx.avatars.length) {
    L.push('\n=== LEITURA DO INTERLOCUTOR (estado de consciência) ===');
    L.push('Escreva do estado onde a pessoa está, mirando o PRÓXIMO movimento possível. Os avatares são ESTADOS, nunca identidades: jamais rotule a pessoa.');
    ctx.avatars.forEach((av) => {
      L.push(`\n--- ${av.nome} (percepção ${av.eixo_percepcao}/100 · identificação ${av.eixo_identificacao}/100) ---`);
      if (av.pergunta_central) L.push(`Pergunta central: "${av.pergunta_central}"`);
      if (av.sofrimento) L.push(`Sofrimento: ${av.sofrimento}`);
      if (av.linguagem) L.push(`Linguagem que reconhece: ${av.linguagem}`);
      if (av.como_conversar) L.push(`Como conversar: ${av.como_conversar}`);
      if (av.movimento_seguinte) L.push(`Próximo movimento a convidar (sutil): ${av.movimento_seguinte}`);
    });
  }

  // EDITORIAL
  const ed = ctx.editorial;
  if (ed) {
    L.push(`\n=== EDITORIAL: ${ed.name} ===`);
    if (ed.description) L.push(ed.description);
    if (ed.objetivo) L.push(`Objetivo: ${ed.objetivo}`);
    if (ed.tom) L.push(`Tom: ${ed.tom}`);
    if (ed.structure_template) L.push(`Estrutura: ${ed.structure_template}`);
    if (ed.fazer?.length) L.push(`SEMPRE faz: ${ed.fazer.map((x) => `• ${x}`).join(' ')}`);
    if (ed.evitar?.length) L.push(`NUNCA faz: ${ed.evitar.map((x) => `• ${x}`).join(' ')}`);
    const a = ed.audience;
    if (a && (a.quem || a.dor || a.desejo)) {
      L.push('--- Público-alvo do editorial ---');
      if (a.quem) L.push(`Quem: ${a.quem}`);
      if (a.dor) L.push(`Dor: ${a.dor}`);
      if (a.desejo) L.push(`Desejo: ${a.desejo}`);
    }
  }

  // ARSENAL — ângulo/tema, NÃO fonte de fato (igual à geração).
  const ai = ctx.arsenalItem;
  if (ai) {
    L.push('\n=== ARSENAL: ÂNGULO / TEMA SUGERIDO (direção temática — NÃO é fonte de fatos) ===');
    L.push('Sugestão de tema/ângulo. Por si só NÃO é um fato verdadeiro. Os fatos reais vêm SEMPRE dos FATOS REAIS DO AUTOR (abaixo). Sem respaldo real, use só como direção de tema.');
    L.push(`Título: ${ai.title}`);
    if (ai.summary) L.push(`Resumo: ${ai.summary}`);
    if (ai.details) L.push(`Detalhes:\n${ai.details}`);
  }

  // EXEMPLOS (estilo)
  if (ctx.examples.length) {
    L.push('\n=== EXEMPLOS DE POSTS REAIS BEE (siga o ESTILO, NÃO copie) ===');
    ctx.examples.forEach((ex, i) => {
      L.push(`--- Exemplo ${i + 1} ---`);
      L.push(`Frase: "${ex.image_quote}"`);
      L.push(`Caption:\n${ex.caption}`);
    });
  }

  // ESTILO
  if (ctx.doRules.length) { L.push('\n=== O QUE A VOZ FAZ ==='); ctx.doRules.forEach((r) => L.push(`• ${r.rule}`)); }
  if (ctx.dontRules.length) { L.push('\n=== O QUE A VOZ NÃO FAZ (REGRAS DURAS) ==='); ctx.dontRules.forEach((r) => L.push(`• ${r.rule}`)); }
  if (ctx.generalRules.length) { L.push('\n=== REGRAS GERAIS ==='); ctx.generalRules.forEach((r) => L.push(`• ${r.rule}`)); }

  // GLOSSÁRIO (termos que devem aparecer)
  const must = ctx.glossary.filter((t) => t.must_appear);
  if (must.length) {
    L.push('\n=== GLOSSÁRIO (termos-chave da Bee) ===');
    must.forEach((t) => L.push(`• ${t.term}: ${t.meaning}${t.usage_note ? ` (${t.usage_note})` : ''}`));
  }

  // DIRETRIZES DE CRIAÇÃO (ofício)
  const dirs = ctx.directives ?? [];
  if (dirs.length) {
    L.push('\n=== DIRETRIZES DE CRIAÇÃO (o ofício) ===');
    dirs.forEach((d) => L.push(`• ${d.titulo ? `${d.titulo}: ` : ''}${d.instrucao}`));
  }

  // APRENDIZADOS (correções passadas do usuário)
  if (ctx.learnings?.length) {
    L.push('\n=== APRENDIZADOS COM O USUÁRIO (respeite) ===');
    ctx.learnings.forEach((l) => L.push(`• ${l.texto}`));
  }

  // FATOS REAIS (RAG) — a biblioteca do autor.
  if (ragContext) {
    L.push('\n=== FATOS REAIS DO AUTOR (base de conhecimento) — A VERDADE VEM DAQUI ===');
    L.push('História e vivências REAIS do autor, recuperadas da base dele. Toda referência a fatos, pessoas, empresas, decisões e sentimentos vem DAQUI — nunca de invenção.');
    L.push(ragContext);
    L.push('=== FIM DOS FATOS REAIS ===');
  }

  // GUARDRAILS INVIOLÁVEIS (valem em qualquer superfície)
  L.push('\n=== GUARDRAILS INVIOLÁVEIS ===');
  L.push('- VERACIDADE: nunca invente fatos biográficos (eventos, datas, números, cargos, empresas, lugares, diálogos, cenas). Use só os FATOS REAIS acima. Sem fato real, fique no geral/conceitual e honesto — jamais fabrique uma cena.');
  L.push('- TOM: tensione a IDEIA, nunca a pessoa. Nada de agressivo, ameaçador, acusatório, arrogante ou de lição de moral. Firmeza com calor humano; convida a perceber, não intimida.');
  L.push('- EXPOSIÇÃO: nunca exponha, humilhe ou ridicularize pessoas ou empresas reais. Anonimize nomes próprios em arquétipos (ex: "uma consultoria global"). Anonimizar troca só o rótulo — nunca altera o fato.');
  L.push('- FORMA: sem travessões (— ou -), sem emojis, sem ALL CAPS nos textos.');

  return L.join('\n');
}
