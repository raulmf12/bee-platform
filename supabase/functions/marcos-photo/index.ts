// Edge function: marcos-photo — MOTOR FOTOGRÁFICO DA HIVE para posts com a
// imagem do Marcos (docs/fotografia/01–06).
//
// Ações:
//   plan     { text }                       → leitura semântica + seleção (sem gerar)
//   generate { text, post_id?, purpose?, force_variant?, plan?, adjust_note?,
//              previous_failure?, parent_id? } → gera 1 imagem (Nano Banana Pro com
//              as referências por nível), passa pelos portões G0–G5 + do estilo e
//              registra em photo_generations (metadados da Constituição §12)
//   review   { generation_id, decision: approve|adjust|reject, note? }
//              → aprovação humana; aprovada entra na biblioteca válida (design_assets)
//
// Toda imagem gerada exige aprovação humana antes da publicação (Constituição §11).
import { errorResponse, getUserGeminiKey, jsonResponse, logUsage, preflight, userIdFromAuth, checkRateLimit } from '../_shared/security.ts';
import { svcHeaders } from '../_shared/gemini.ts';
import { acjVisualContext, loadPostAcj } from '../_shared/acj.ts';
import { PROFILE_VERSION, PRODUCER_ID, type RefPriority } from '../_shared/photo-profile.ts';
import { STYLES, VARIANTS, type StyleId } from '../_shared/photo-styles.ts';
import {
  buildGatePrompt, buildPhotoPrompt, normalizeSemantics, pickReferences, planPhoto, readGates,
  type AvailableRef, type PhotoPlan, type RecentUse, type TextReading,
} from '../_shared/photo-select.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const IMAGE_CHAIN = ['gemini-3-pro-image', 'gemini-3-pro-image-preview', 'gemini-3.1-flash-image', 'gemini-2.5-flash-image'];
const TEXT_CHAIN = ['gemini-3.5-flash', 'gemini-3-flash-preview', 'gemini-2.5-flash'];
const VISION_CHAIN = ['gemini-3.1-pro-preview', 'gemini-2.5-pro', 'gemini-3.5-flash'];
// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, { ...init, headers: { ...svcHeaders(), ...(init.headers ?? {}) } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path.split('?')[0]} ${res.status}: ${text.slice(0, 200)}`);
  return (text ? JSON.parse(text) : null) as T;
}

async function gemini(apiKey: string, chain: string[], parts: unknown[], config: Row): Promise<{ json: Row; model: string }> {
  let last = '';
  for (const model of chain) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts }], generationConfig: config }),
    });
    if (res.ok) return { json: await res.json(), model };
    last = `[${model}] HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`;
    if (![400, 404, 429, 500, 503].includes(res.status)) break;
  }
  throw new Error(last || 'modelo indisponível');
}

const textOf = (j: Row) => (j.candidates?.[0]?.content?.parts ?? []).map((p: Row) => p.text ?? '').join('');
const parseJson = (s: string) => JSON.parse(s.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, ''));

async function b64(url: string): Promise<{ data: string; mime: string }> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`referência indisponível (${r.status}): ${url.split('/').pop()}`);
  const buf = new Uint8Array(await r.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { data: btoa(s), mime: r.headers.get('content-type') ?? 'image/jpeg' };
}

// Leitura semântica do texto-mãe (Constituição §7.1; F01 §3; F02–F04 §1/§4; F03 §1).
async function readText(apiKey: string, text: string, acjCtx = ''): Promise<TextReading> {
  const variantGuide = VARIANTS.map((v) => `${v.id} ${v.name}: ${v.operation}`).join('; ');
  const prompt = [
    'Você é o leitor editorial do motor fotográfico da Hive. Leia o TEXTO-MÃE de um post do Marcos Piccini (consultor de liderança sistêmica) e devolva SOMENTE JSON.',
    'Dimensões (0.0–1.0): autoria (quanto expressa posição pessoal), densidade_conceitual (quanto exige elaboração e reflexão), relacionalidade (quanto trata de pessoas, times ou sistemas de relação), orientacao_futuro (direção, transição, possibilidade), energia_acao (movimento ou decisão), intimidade (aproxima o produtor do público), necessidade_evidencia (quanto depende de prova REAL de algo que aconteceu), valor_atmosfera (quanto a imagem pode ampliar sensação e contexto), forca_posicionamento (afirmação clara de ponto de vista).',
    'factual_claim = true SOMENTE se o texto afirma um acontecimento real específico: "hoje estivemos com…", "nesta reunião…", "com a equipe da empresa…", "na turma…", "no evento…", "este projeto…", cliente/organização/local/ocasião identificável. Reflexão conceitual sobre equipes, escuta ou cultura NÃO é factual_claim.',
    'variant_intent: para CADA estilo, a variação que a árvore de decisão dele indica para este texto. F01: encontro direto/afirmação clara → F01-A; reflexão/elaboração conceitual → F01-B; calor/reconhecimento/aproximação → F01-C; senão F01-D. F02: formular/registrar → F02-A; estudar/confrontar referência → F02-B; construir/revisar materiais → F02-C; assimilar/maturar pergunta aberta → F02-D. F03: receber/compreender o outro → F03-A; trocar perspectivas → F03-B; criar junto → F03-C; sustentar grupo → F03-D; conduzir com quadro → F03-E; apresentar mantendo relação → F03-F. F04: continuidade/próximo passo → F04-A; passagem antes/depois → F04-B; mudança de perspectiva → F04-C; futuro em construção → F04-D.',
    `Variações: ${variantGuide}.`,
    '{ "semantics": { "autoria":0, "densidade_conceitual":0, "relacionalidade":0, "orientacao_futuro":0, "energia_acao":0, "intimidade":0, "necessidade_evidencia":0, "valor_atmosfera":0, "forca_posicionamento":0 }, "factual_claim": false, "factual_reason": "", "central_verb": "", "variant_intent": { "F01": "F01-?", "F02": "F02-?", "F03": "F03-?", "F04": "F04-?" } }',
    ...(acjCtx ? [`${acjCtx}\n(Para o motor fotográfico a ACJ é só sinal de compatibilidade: as regras da Constituição e dos estilos F01–F04 prevalecem.)`] : []),
    `TEXTO-MÃE:\n${text.slice(0, 3000)}`,
  ].join('\n');
  const { json } = await gemini(apiKey, TEXT_CHAIN, [{ text: prompt }], { responseMimeType: 'application/json', temperature: 0.2 });
  const r = parseJson(textOf(json));
  return { semantics: normalizeSemantics(r.semantics), factual_claim: !!r.factual_claim, factual_reason: r.factual_reason || undefined, central_verb: r.central_verb || undefined, variant_intent: r.variant_intent ?? {} };
}

async function loadContext(userId: string) {
  const [refRows, recentRows, approvals] = await Promise.all([
    rest<Row[]>(`/photo_references?producer_id=eq.${PRODUCER_ID}&is_active=eq.true&select=id,ref_key,priority,roles,url`),
    rest<Row[]>(`/photo_generations?user_id=eq.${userId}&purpose=eq.post&review_status=neq.rejected&auto_status=neq.rejected&select=style_id,variant_id,expression_id,wardrobe_id,environment_id,text_space,gaze&order=created_at.desc&limit=6`),
    rest<Row[]>(`/photo_style_approvals?user_id=eq.${userId}&select=style_id,status`),
  ]);
  const refs: AvailableRef[] = refRows.map((r) => ({ id: r.id, key: r.ref_key, priority: r.priority as RefPriority, roles: r.roles ?? [], url: r.url }));
  const recent: RecentUse[] = recentRows.map((r) => ({ style: r.style_id, variant: r.variant_id, expression: r.expression_id, wardrobe: r.wardrobe_id, environment: r.environment_id, text_space: r.text_space, gaze: r.gaze }));
  const approvedStyles = approvals.filter((a) => a.status === 'approved').map((a) => a.style_id as StyleId);
  return { refs, recent, approvedStyles };
}

async function generate(userId: string, apiKey: string, input: Row) {
  const started = Date.now();
  const ctx = await loadContext(userId);
  const purpose = input.purpose === 'validation_board' ? 'validation_board' : 'post';
  const text: string = String(input.text ?? '').trim();
  let plan: PhotoPlan = input.plan;
  let reading: TextReading | null = null;
  if (!plan) {
    reading = await readText(apiKey, text || 'Retrato autoral do Marcos Piccini.', acjVisualContext(await loadPostAcj(input.post_id, userId)));
    plan = planPhoto({
      text, reading, recent: ctx.recent, refs: ctx.refs, forceVariant: input.force_variant,
      approvedStyles: purpose === 'validation_board' || input.force_variant ? null : ctx.approvedStyles, aspect: input.aspect,
    });
  }
  if (plan.status === 'needs_real_photo') return { status: 'needs_real_photo', plan };

  const { refs, comparison } = pickReferences(plan, ctx.refs);  // plan inclui wardrobe
  if (refs.length < 2) throw new Error('Referências insuficientes para preservar a identidade (Constituição §4.4).');
  const prompt = buildPhotoPrompt(plan, refs, { adjustNote: input.adjust_note, previousFailure: input.previous_failure });
  const images = await Promise.all(refs.map((r) => b64(r.url)));
  // Cada referência vem rotulada (ajuda o modelo a amarrar a identidade a ESTE homem).
  const parts: unknown[] = [{ text: prompt }];
  refs.forEach((r, i) => {
    parts.push({ text: `Reference photo ${i + 1} of Marcos Piccini — ${r.key}, level ${r.priority} (${r.roles.join(', ')}). Same man in every reference.` });
    parts.push({ inline_data: { mime_type: images[i].mime, data: images[i].data } });
  });
  parts.push({ text: 'Now create the new photograph described above with THIS exact man from the reference photos — same face, same age, same hair and beard.' });
  let out: { json: Row; model: string };
  try {
    out = await gemini(apiKey, IMAGE_CHAIN, parts, { responseModalities: ['IMAGE'], temperature: 0.35, imageConfig: { aspectRatio: plan.aspect } });
  } catch {
    out = await gemini(apiKey, IMAGE_CHAIN, parts, { responseModalities: ['IMAGE'], temperature: 0.35 });
  }
  const inl = (out.json.candidates?.[0]?.content?.parts ?? []).map((p: Row) => p.inlineData ?? p.inline_data).find((x: Row) => x?.data);
  if (!inl) throw new Error(`O modelo não devolveu imagem (${out.model}).`);
  const mime = inl.mimeType ?? inl.mime_type ?? 'image/png';

  // Registro + upload (design bucket: mesma origem do render, sem CORS).
  const [row] = await rest<Row[]>(`/photo_generations`, { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({
    user_id: userId, producer_profile_version: PROFILE_VERSION, post_id: input.post_id ?? null, parent_id: input.parent_id ?? null, purpose,
    origin: 'gerada', source_ref_keys: refs.map((r) => r.key), style_id: plan.style, variant_id: plan.variant, expression_id: plan.expression,
    wardrobe_id: plan.wardrobe, environment_id: plan.environment, gaze: plan.gaze, crop: plan.crop, text_space: plan.text_space, aspect: plan.aspect,
    mother_text: text || null, content_semantics: plan.semantics, plan: { ...plan, comparison: Object.fromEntries(Object.entries(comparison).map(([k, v]) => [k, v ? { key: v.key, url: v.url } : null])) },
    prompt, model: out.model, attempt: Number(input.attempt ?? 1), generated_at: new Date().toISOString(),
  }) });
  const ext = mime.includes('jpeg') ? 'jpg' : 'png';
  const path = `hive/marcos-photo/${row.id}.${ext}`;
  const bytes = Uint8Array.from(atob(inl.data), (c) => c.charCodeAt(0));
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const up = await fetch(`${SUPABASE_URL}/storage/v1/object/design/${path}`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': mime, 'x-upsert': 'true' }, body: bytes });
  if (!up.ok) throw new Error(`upload falhou: ${up.status}`);
  const imageUrl = `${SUPABASE_URL}/storage/v1/object/public/design/${path}`;

  // Portões de qualidade (leitura visual contra as referências de comparação).
  let gates: ReturnType<typeof readGates> | null = null;
  let gateError: string | null = null;
  try {
    const compRefs = [comparison.front, comparison.three_quarter, comparison.expression, comparison.body].filter((x, i, a) => x && a.indexOf(x) === i) as AvailableRef[];
    const compImgs = await Promise.all(compRefs.map((r) => b64(r.url)));
    const gp = [{ text: buildGatePrompt(plan, compRefs.map((r) => r.key)) }, { inline_data: { mime_type: mime, data: inl.data } }, ...compImgs.map((i) => ({ inline_data: { mime_type: i.mime, data: i.data } }))];
    const g = await gemini(apiKey, VISION_CHAIN, gp, { responseMimeType: 'application/json', temperature: 0 });
    gates = readGates(parseJson(textOf(g.json)), plan, ctx.recent);
  } catch (e) {
    gateError = (e as Error).message.slice(0, 200);
  }
  const [saved] = await rest<Row[]>(`/photo_generations?id=eq.${row.id}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({
    image_url: imageUrl, storage_path: path,
    gates: gates ? { ...gates.raw, failures: gates.failures } : { error: gateError },
    auto_status: gates?.status ?? 'revisar', hard_fail: gates?.hard_fail ?? null,
    identity_status: gates?.identity_status ?? 'revisar', realism_status: gates?.realism_status ?? 'revisar', updated_at: new Date().toISOString(),
  }) });
  logUsage({ userId, provider: 'gemini', product: 'image', model: out.model, metadata: { fn: 'marcos-photo', variant: plan.variant, refs: refs.length, ms: Date.now() - started } });
  return { status: 'generated', plan, generation: saved, reading };
}

async function review(userId: string, input: Row) {
  const [g] = await rest<Row[]>(`/photo_generations?id=eq.${input.generation_id}&user_id=eq.${userId}&select=*&limit=1`);
  if (!g) throw new Error('Geração não encontrada.');
  const decision = input.decision as 'approve' | 'adjust' | 'reject';
  const patch: Row = { reviewer_notes: input.note ?? null, updated_at: new Date().toISOString() };
  if (decision === 'approve') {
    // Biblioteca válida: só imagens aprovadas por humano (Constituição §11).
    const [asset] = await rest<Row[]>(`/design_assets`, { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({
      kind: 'photo', title: `Marcos · ${g.variant_id} ${STYLES[g.style_id as StyleId]?.name ?? ''} — gerada`, url: g.image_url, storage_path: g.storage_path,
      mime_type: g.storage_path?.endsWith('.jpg') ? 'image/jpeg' : 'image/png', origin: 'generated', person_slug: 'marcos',
      tags: ['motor-fotografico', g.style_id, g.variant_id, g.expression_id].filter(Boolean),
      semantic: { photo_generation_id: g.id, origin: 'gerada', style_id: g.style_id, variant_id: g.variant_id, expression_id: g.expression_id, wardrobe_id: g.wardrobe_id,
        environment_id: g.environment_id, text_space: g.text_space, crop: g.crop, gaze: g.gaze, producer_profile_version: g.producer_profile_version, espaco_texto: g.text_space },
    }) });
    Object.assign(patch, { review_status: 'approved', approved_by: userId, approved_at: new Date().toISOString(), library_asset_id: asset?.id ?? null });
  } else {
    // Rejeitada alimenta o registro de erros — nunca a biblioteca válida.
    patch.review_status = decision === 'adjust' ? 'adjust' : 'rejected';
  }
  const [saved] = await rest<Row[]>(`/photo_generations?id=eq.${g.id}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch) });
  return { generation: saved };
}

Deno.serve(async (req: Request) => {
  const cors = preflight(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Use POST', 405);
  try {
    const userId = userIdFromAuth(req);
    if (!userId) return errorResponse('Nao autenticado', 401);
    const input = (await req.json().catch(() => ({}))) as Row;
    if (input.action === 'review') return jsonResponse({ success: true, ...(await review(userId, input)) });
    const rl = checkRateLimit(`marcos-photo:${userId}`, 60_000, 12);
    if (!rl.ok) return errorResponse(`Rate limit. Tente em ${Math.ceil(rl.resetIn / 1000)}s`, 429);
    const apiKey = await getUserGeminiKey(userId);
    if (!apiKey) return errorResponse('Chave Gemini nao configurada', 400);
    if (input.action === 'plan') {
      const ctx = await loadContext(userId);
      const reading = await readText(apiKey, String(input.text ?? ''));
      try {
        const plan = planPhoto({ text: String(input.text ?? ''), reading, recent: ctx.recent, refs: ctx.refs, approvedStyles: ctx.approvedStyles, forceVariant: input.force_variant });
        return jsonResponse({ success: true, plan, reading, references: pickReferences(plan, ctx.refs) });
      } catch (e) {
        return jsonResponse({ success: true, plan: null, reading, error: (e as Error).message });
      }
    }
    if (input.action === 'generate') {
      try {
        return jsonResponse({ success: true, ...(await generate(userId, apiKey, input)) });
      } catch (e) {
        const msg = (e as Error).message;
        if (msg.startsWith('Nenhuma variação disponível')) return jsonResponse({ success: true, status: 'no_approved_style', error: msg });
        throw e;
      }
    }
    return errorResponse('action inválida (plan | generate | review)', 400);
  } catch (e) {
    console.error('[marcos-photo]', e);
    return errorResponse((e as Error).message.slice(0, 300), 500);
  }
});
