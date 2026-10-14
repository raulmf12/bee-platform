// Edge function: identity-setup — percurso "Minha identidade" (Guia de implementação §4–§7).
// A IA conduz a descoberta e PROPÕE; a pessoa corrige, revisa e decide o que ativar.
// Nada aqui grava na configuração ativa: só na sessão (setup_sessions). A ativação é a RPC
// activate_setup_session (atômica, com versão-base e alcance da adoção).
//
// Ações:
//   next_question { session_id }          → { question: {id,text,why,blocks} | null, done }
//   propose       { session_id, block }   → { proposal }  (bloco: brand|emitters|fronts|audiences|profiles|editorials)
import { checkRateLimit, errorResponse, getUserGeminiKey, internalUserId, jsonResponse, logUsage, preflight, userIdFromAuth } from '../_shared/security.ts';
import { callGeminiJson, fetchRest, svcHeaders } from '../_shared/gemini.ts';
import { brandOfUser, resolveContext, speakerLine, userBrandScope } from '../_shared/context.ts';
import { loadIdentity, overlay, type Identity } from '../_shared/identity-draft.ts';

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;
type Block = 'brand' | 'emitters' | 'fronts' | 'audiences' | 'profiles' | 'editorials';
const BLOCKS: Block[] = ['brand', 'emitters', 'fronts', 'audiences', 'profiles', 'editorials'];
const ORIGINS = new Set(['declared', 'evidence', 'hypothesis', 'legacy']);
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

interface Question { id: string; text: string; why: string; targets?: string[]; blocks?: string[] }

// Perguntas genéricas por alvo (sem identidade implícita de nenhum cliente).
const BANK: Question[] = [
  { id: 'g-essence', text: 'O que a sua marca faz pelas pessoas? Qual é, em suas palavras, a natureza da contribuição?', why: 'É o núcleo que todas as frentes compartilham.', targets: ['identidade', 'posicionamento'], blocks: ['brand'] },
  { id: 'g-speaker', text: 'Quem fala nos conteúdos: você, a marca, ou os dois? Em que situações cada um?', why: 'Define os emissores e o lugar de fala de cada um.', targets: ['identidade', 'voz_visual'], blocks: ['emitters'] },
  { id: 'g-fronts', text: 'Quais frentes de atuação existem hoje (linhas duradouras de trabalho) e o que diferencia cada uma?', why: 'Uma frente não é canal nem campanha; separa o que muda de uma para outra.', targets: ['frente'], blocks: ['fronts'] },
  { id: 'g-audience', text: 'Quem você quer alcançar primeiro e que situação essas pessoas vivem?', why: 'Público é gente em situação concreta — não só cargo.', targets: ['publico'], blocks: ['audiences'] },
  { id: 'g-pains', text: 'Que dificuldades recorrentes essas pessoas enfrentam, e como elas falam disso?', why: 'Dá à Hive a linguagem do público, sem inventar dores.', targets: ['publico'], blocks: ['audiences'] },
  { id: 'g-position', text: 'Como você quer ser percebido nessa frente, e o que te diferencia?', why: 'Orienta o posicionamento do perfil.', targets: ['posicionamento'], blocks: ['profiles'] },
  { id: 'g-offer', text: 'Que ofertas existem para essa frente e em que momentos elas devem aparecer no conteúdo?', why: 'Evita CTA comercial em toda peça.', targets: ['oferta'], blocks: ['fronts', 'profiles'] },
  { id: 'g-voice', text: 'O que mudou no seu jeito de escrever ou na expressão que você quer nos conteúdos?', why: 'Ajusta a expressão sem reescrever a identidade inteira.', targets: ['voz_visual'], blocks: ['emitters', 'profiles'] },
  { id: 'g-refs', text: 'Quais textos ou casos atuais representam bem o que você quer daqui pra frente?', why: 'Referências atuais calibram a voz sem misturar com o histórico.', targets: ['identidade', 'voz_visual', 'publico', 'frente', 'posicionamento', 'oferta'], blocks: ['profiles', 'editorials'] },
];
const ADD_FRONT: Question[] = [
  { id: 'af-what', text: 'Que nova frente você quer adicionar, o que ela faz e para quem?', why: 'É a base da nova frente; o núcleo da marca é reaproveitado.', blocks: ['fronts', 'audiences'] },
  { id: 'af-diff', text: 'O que essa frente compartilha com o núcleo da marca, e o que muda (temas, ofertas, quem fala)?', why: 'Mostra o que herdar e o que configurar à parte.', blocks: ['fronts', 'profiles'] },
];

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, { ...init, headers: { ...svcHeaders(), ...(init.headers ?? {}) } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path.split('?')[0]} ${res.status}: ${text.slice(0, 200)}`);
  return (text ? JSON.parse(text) : null) as T;
}

function seedQuestions(s: Row, id: Identity): Question[] {
  if (s.mode === 'add_front') return ADD_FRONT;
  const targets: string[] = s.targets?.length ? s.targets : ['identidade', 'frente', 'publico', 'posicionamento'];
  const brandSeeds = (id.brand.metadata?.setup_seed_questions ?? []) as Question[];
  const pool = s.mode === 'review' && brandSeeds.length ? brandSeeds : BANK;
  return pool.filter((q) => !q.targets || q.targets.some((t) => targets.includes(t)));
}

// Resumo compacto da identidade atual para os prompts (ids explícitos para as refs).
function identityDigest(d: Identity, s: Row): string {
  const g = d.genesis;
  const p = (r: Row) => JSON.stringify(r);
  return [
    `MARCA: ${d.brand.name} — natureza da contribuição: ${d.brand.essence ?? '(não definida)'}`,
    g ? `GENESIS (legado, não reescrever automaticamente): pergunta fundadora: ${g.pergunta_fundadora ?? '-'} | produto real: ${g.produto_real ?? '-'} | frase organizadora: ${g.frase_organizadora ?? '-'} | missão: ${g.missao ?? '-'} | voz: ${(g.voz_como_escreve ?? '').slice(0, 500)}` : 'GENESIS: (não configurado)',
    'EMISSORES:', ...d.emitters.map((e) => `- ${p({ ref: e.id, kind: e.kind, name: e.name, voice: (e.voice ?? '').slice(0, 300), authority: e.authority, first_person: e.first_person, speaking_rules: e.speaking_rules, facts_status: e.facts_status })}`),
    'FRENTES:', ...d.fronts.map((f) => `- ${p({ ref: f.id, name: f.name, description: f.description, territories: f.territories, offers: d.products.filter((o) => (f.offer_ids ?? []).includes(o.id)).map((o) => o.slug) })}`),
    'PÚBLICOS:', ...d.audiences.map((a) => `- ${p({ ref: a.id, front_ref: a.front_id, name: a.name, definition: a.definition, situations: a.situations, needs: a.needs, status: a.status, notes: a.notes })}`),
    'PERFIS:', ...d.profiles.map((x) => `- ${p({ ref: x.id, name: x.name, emitter_ref: x.emitter_id, front_ref: x.front_id, primary_audience_ref: x.primary_audience_id, secondary_audience_refs: x.secondary_audience_ids, positioning: x.positioning, expression: x.expression, cta_policy: x.cta_policy, status: x.status, needs_recalibration: x.needs_recalibration, target: (s.target_profile_ids ?? []).includes(x.id) || undefined })}`),
    `OFERTAS CADASTRADAS (slugs): ${d.products.map((o) => `${o.slug} (${o.name})`).join(', ') || 'nenhuma'}`,
    'EDITORIAS ATIVAS:', ...d.editorials.map((e) => `- ${p({ ref: e.id, slug: e.slug, name: e.name, objetivo: e.objetivo ?? e.description, front_ref: e.front_id, curation_status: e.curation_status })}`),
  ].join('\n');
}

function conversation(s: Row): string {
  const ans = (s.answers ?? []) as Row[];
  const src = (s.sources ?? []) as Row[];
  return [
    `MODO: ${s.mode}. ALVOS DA MUDANÇA: ${(s.targets ?? []).join(', ') || '(configuração inicial)'}.`,
    ans.length ? 'RESPOSTAS (declaradas pela pessoa):\n' + ans.map((a) => `P: ${a.question}\nR: ${a.answer}`).join('\n\n') : 'RESPOSTAS: nenhuma ainda.',
    src.length ? 'MATERIAIS (referência atual ≠ histórico):\n' + src.map((m) => `- [${m.role === 'historical' ? 'HISTÓRICO' : 'REFERÊNCIA ATUAL'}] ${m.title ?? ''} ${m.url ?? ''}\n${String(m.content ?? '').slice(0, 1500)}`).join('\n') : '',
  ].filter(Boolean).join('\n\n');
}

const SCHEMAS: Record<Block, string> = {
  brand: '{ "essence": "<natureza da contribuição revisada (ou a atual, se não mudou)>", "origin": "declared|evidence|hypothesis|legacy", "genesis_notes": [{ "text": "<o que do Genesis continua / o que ficou preso ao foco anterior>", "origin": "..." }], "summary": "<1–2 frases do que mudou>", "hypotheses": ["<o que ainda é hipótese>"] }',
  emitters: '{ "items": [{ "ref": "<uuid existente ou new:<chave>>", "action": "keep|update|create", "kind": "person|institutional", "name": "...", "voice": "...", "authority": "<SÓ fatos declarados/confirmados>", "first_person": true, "speaking_rules": "<lugar de fala>", "facts_status": "confirmed|to_confirm", "origin": "...", "why": "...", "changes": ["<campo: antes → depois>"] }], "summary": "...", "hypotheses": [] }',
  fronts: '{ "items": [{ "ref": "...", "action": "keep|update|create|archive", "name": "...", "description": "...", "territories": ["..."], "offers": ["<slug de oferta cadastrada>"], "origin": "...", "why": "...", "changes": [] }], "summary": "...", "hypotheses": [] }',
  audiences: '{ "items": [{ "ref": "...", "action": "keep|update|create|archive", "front_ref": "<ref da frente>", "name": "...", "definition": "<pessoas/papéis/situação — NÃO o estado do interlocutor>", "situations": ["..."], "needs": ["..."], "language_notes": "...", "status": "hypothesis|active", "origin": "...", "why": "...", "changes": [] }], "summary": "...", "hypotheses": [] }',
  profiles: '{ "items": [{ "ref": "...", "action": "keep|update|create|archive", "name": "<Frente · Emissor · Público>", "emitter_ref": "...", "front_ref": "...", "primary_audience_ref": "...", "secondary_audience_refs": [], "positioning": "...", "expression": "...", "cta_policy": "by_intent|never|soft", "offers": ["<slug>"], "status": "active|draft", "needs_recalibration": "<o que ainda falta decidir, ou vazio>", "origin": "...", "why": "...", "changes": [] }], "summary": "...", "hypotheses": [] }',
  editorials: '{ "items": [{ "ref": "<uuid de editoria existente ou new:<chave>>", "action": "keep|update|create|archive", "name": "...", "objetivo": "<propósito>", "territorio": "...", "front_ref": "<ref da frente ou vazio = todas>", "audience": "<público principal>", "perguntas": ["<perguntas que a editoria responde>"], "material": "<material-fonte>", "exemplo": "<um exemplo curto de pauta>", "origin": "...", "why": "..." }], "summary": "...", "hypotheses": [] }',
};

function sanitize(block: Block, raw: Row, d: Identity, s: Row): Row {
  if (block === 'brand') {
    return { essence: String(raw.essence ?? d.brand.essence ?? '').trim(), origin: ORIGINS.has(raw.origin) ? raw.origin : 'hypothesis',
      genesis_notes: (raw.genesis_notes ?? []).slice(0, 8).map((n: Row) => ({ text: String(n.text ?? ''), origin: ORIGINS.has(n.origin) ? n.origin : 'hypothesis' })),
      summary: String(raw.summary ?? ''), hypotheses: (raw.hypotheses ?? []).map(String).slice(0, 8) };
  }
  const existing: Record<string, Set<string>> = {
    emitters: new Set(d.emitters.map((x) => x.id)), fronts: new Set(d.fronts.map((x) => x.id)), audiences: new Set(d.audiences.map((x) => x.id)),
    profiles: new Set(d.profiles.map((x) => x.id)), editorials: new Set(d.editorials.map((x) => x.id)),
  };
  const recal = s.mode === 'recalibrate';
  const targets = new Set<string>(s.target_profile_ids ?? []);
  const seen = new Set<string>();
  const items = ((raw.items ?? []) as Row[]).map((it) => {
    let ref = String(it.ref ?? '').trim();
    let action = ['keep', 'update', 'create', 'archive'].includes(it.action) ? it.action : 'keep';
    if (action === 'create' && !ref.startsWith('new:')) ref = `new:${block}-${crypto.randomUUID().slice(0, 8)}`;
    if (action !== 'create' && !existing[block].has(ref)) return null;     // ref inventada → descarta
    if (recal && block === 'profiles' && action !== 'keep' && !targets.has(ref) && action !== 'create') action = 'keep';
    if (recal && action === 'archive') action = 'keep';
    if (seen.has(ref)) return null;
    seen.add(ref);
    const out: Row = { ...it, ref, action, origin: ORIGINS.has(it.origin) ? it.origin : (action === 'keep' ? 'legacy' : 'hypothesis') };
    for (const k of ['territories', 'situations', 'needs', 'offers', 'secondary_audience_refs', 'perguntas', 'changes']) if (k in out && !Array.isArray(out[k])) out[k] = out[k] ? [String(out[k])] : [];
    if (Array.isArray(out.offers)) out.offers = out.offers.filter((o: string) => d.products.some((p) => p.slug === o));
    return out;
  }).filter(Boolean) as Row[];
  return { items, summary: String(raw.summary ?? ''), hypotheses: (raw.hypotheses ?? []).map(String).slice(0, 8) };
}

Deno.serve(async (req: Request) => {
  const cors = preflight(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Use POST', 405);
  try {
    const userId = userIdFromAuth(req) ?? internalUserId(req);
    if (!userId) return errorResponse('Nao autenticado', 401);
    const rl = checkRateLimit(userId, 60_000, 30);
    if (!rl.ok) return errorResponse(`Rate limit. Tente em ${Math.ceil(rl.resetIn / 1000)}s`, 429);
    const input = (await req.json().catch(() => ({}))) as { action?: string; session_id?: string; block?: Block };
    // Sonda de contexto (isolamento): o que a Hive carregaria para este usuário — marca, perfil e bases.
    if (input.action === 'context_probe') {
      const rctx = await resolveContext(userId).catch(() => null);
      const S = await userBrandScope(userId);
      const count = async (path: string) => (await fetchRest<Row[]>(`${path}${S}`).catch(() => [])).length;
      const [genesis, principles, editorials, directives, examples, glossary, variations, photos] = await Promise.all([
        count('/genesis_core?select=brand_id'), count('/genesis_principios?select=id'), count('/bee_editorials?select=id&is_active=eq.true'),
        count('/bee_directives?select=id&ativo=eq.true'), count('/bee_example_posts?select=id'), count('/bee_glossary?select=id'),
        count('/design_variacoes?select=id'), count('/design_assets?select=id&kind=eq.photo'),
      ]);
      return jsonResponse({ success: true, brand: rctx ? { id: rctx.brand.id, name: rctx.brand.name } : null, profile: rctx?.profile.name ?? null,
        speaker: speakerLine(rctx), counts: { genesis, principles, editorials, directives, examples, glossary, variations, photos } });
    }
    if (!input.session_id) return errorResponse('session_id obrigatório', 400);
    const [s] = await fetchRest<Row[]>(`/setup_sessions?id=eq.${input.session_id}&user_id=eq.${userId}&select=*`);
    if (!s) return errorResponse('Sessão não encontrada', 404);
    if (!(await brandOfUser(userId, s.brand_id))) return errorResponse('Sem acesso a esta marca', 403);
    const base = await loadIdentity(s.brand_id);
    if (!base) return errorResponse('Marca não encontrada', 404);
    const [brandFull] = await fetchRest<Row[]>(`/brands?id=eq.${s.brand_id}&select=metadata`);
    base.brand.metadata = brandFull?.metadata ?? {};
    const draft = overlay(base, s.proposals ?? {});

    if (input.action === 'next_question') {
      const answered = new Set(((s.answers ?? []) as Row[]).map((a) => a.question_id));
      const next = seedQuestions(s, base).find((q) => !answered.has(q.id));
      if (next) return jsonResponse({ success: true, question: next, done: false });
      // Perguntas de abertura respondidas: a Hive decide se ainda falta algo (no máx. 3 complementares).
      const followups = ((s.answers ?? []) as Row[]).filter((a) => String(a.question_id).startsWith('f-')).length;
      if (followups >= 3) return jsonResponse({ success: true, question: null, done: true });
      const apiKey = await getUserGeminiKey(userId);
      if (!apiKey) return jsonResponse({ success: true, question: null, done: true });
      const sys = [
        'Você é a Hive conduzindo a configuração de identidade de comunicação de uma marca. Uma pergunta por vez.',
        'Só pergunte o que falta para propor os blocos dos ALVOS escolhidos. Não repita o que já foi respondido nem o que a configuração atual já sabe. Não peça listas extensas de cargos nem um manifesto.',
        'Se já há informação suficiente para propor (lacunas podem ficar explícitas como hipótese), responda done=true.',
        'Responda em português do Brasil. JSON puro: { "done": boolean, "question": "<pergunta>", "why": "<por que essa informação é necessária, 1 frase>" }',
      ].join('\n');
      const usr = `${identityDigest(draft, s)}\n\n${conversation(s)}`;
      const { data, model_used, usage } = await callGeminiJson<{ done?: boolean; question?: string; why?: string }>(apiKey, sys, usr, { temperature: 0.3, maxOutputTokens: 600 });
      logUsage({ userId, provider: 'gemini', product: 'text', model: model_used, tokens_input: usage.input, tokens_output: usage.output, metadata: { fn: 'identity-setup', action: 'next_question' } });
      if (data.done || !data.question) return jsonResponse({ success: true, question: null, done: true });
      return jsonResponse({ success: true, done: false, question: { id: `f-${followups + 1}`, text: String(data.question), why: String(data.why ?? '') } });
    }

    if (input.action === 'propose') {
      const block = input.block;
      if (!block || !BLOCKS.includes(block)) return errorResponse('Bloco inválido', 400);
      if (s.mode === 'recalibrate' && (block === 'emitters' || block === 'brand')) return errorResponse('Recalibração não altera a identidade da marca nem os emissores; use Revisar identidade.', 400);
      const apiKey = await getUserGeminiKey(userId);
      if (!apiKey) return errorResponse('Chave Gemini nao configurada', 400);
      const sys = [
        `Você é a Hive. Proponha o bloco "${block}" da configuração de comunicação da marca a partir da configuração ATUAL, das respostas e dos materiais.`,
        'REGRAS:',
        '- Aproveite o que existe: itens que não mudam vêm com action "keep" (não reescreva o que não foi pedido).',
        '- Mude SÓ o que os alvos da mudança e as respostas justificam; recalibração toca apenas os perfis marcados target.',
        '- Classifique a origem de cada item: declared (dito pela pessoa), evidence (visto nos materiais), hypothesis (inferência sua, a validar), legacy (configuração atual mantida).',
        '- Nunca invente biografia, números, cases, cargos ou autoridade: o que não foi declarado/confirmado fica como hipótese explícita.',
        '- Público é pessoas/papéis/situação; o estado do interlocutor (identificado/incomodado) é lente opcional, NÃO público.',
        '- Canal não define frente. Ofertas: use só slugs cadastrados; CTA comercial só por intenção.',
        '- Para criar, use ref "new:<chave-curta>" e referencie-a nos outros campos (ex.: front_ref "new:consulting").',
        `- Em "changes", descreva a diferença em relação ao atual ("campo: antes → depois").`,
        'Português do Brasil. JSON puro no formato:',
        SCHEMAS[block],
      ].join('\n');
      const other = BLOCKS.filter((b) => b !== block && s.proposals?.[b]).map((b) => `${b}: ${JSON.stringify(s.proposals[b]).slice(0, 2500)}`).join('\n');
      const usr = [identityDigest(draft, s), conversation(s), other ? `OUTROS BLOCOS JÁ PROPOSTOS NESTA SESSÃO:\n${other}` : '',
        s.proposals?.[block]?.adjust_request ? `A PESSOA PEDIU AJUSTE NESTE BLOCO: ${s.proposals[block].adjust_request}` : ''].filter(Boolean).join('\n\n');
      const { data, model_used, usage } = await callGeminiJson<Row>(apiKey, sys, usr, { temperature: 0.35, maxOutputTokens: 6000 });
      logUsage({ userId, provider: 'gemini', product: 'text', model: model_used, tokens_input: usage.input, tokens_output: usage.output, metadata: { fn: 'identity-setup', action: 'propose', block } });
      const proposal = { ...sanitize(block, data, draft, s), status: 'proposed', generated_at: new Date().toISOString() };
      const proposals = { ...(s.proposals ?? {}), [block]: proposal };
      await rest(`/setup_sessions?id=eq.${s.id}&user_id=eq.${userId}`, { method: 'PATCH', body: JSON.stringify({ proposals, status: 'ready_for_review' }) });
      return jsonResponse({ success: true, proposal });
    }

    return errorResponse('Ação desconhecida', 400);
  } catch (e) {
    console.error('[identity-setup]', e);
    return errorResponse('Erro no percurso de identidade', 500, String(e));
  }
});

export {};
