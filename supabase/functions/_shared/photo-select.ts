// MOTOR FOTOGRÁFICO DA HIVE — decisão (PURO, testável).
//   semântica do texto (LLM) → origem (real × gerada) → estilo → variação →
//   expressão/roupa/ambiente/espaço de texto (antirrepetição) → referências →
//   prompt (contrato do estilo) → leitura dos portões de qualidade.
// Regras: Constituição §2, §3, §4.4, §7, §9, §10; Perfil §6–§14; F01–F04 §3–§5.
import {
  BODY_CROPS, ENVIRONMENTS, EXPRESSIONS, HARD_AVOID, IDENTITY_CONTRACT, PROFILE_VERSION, REFERENCE_MANIFEST, WARDROBE,
  type Crop, type ExpressionId, type RefPriority, type TextSpace,
} from './photo-profile.ts';
import { STYLES, VARIANTS, variantById, type StyleId, type Variant } from './photo-styles.ts';

export interface Semantics {
  autoria: number; densidade_conceitual: number; relacionalidade: number; orientacao_futuro: number;
  energia_acao: number; intimidade: number; necessidade_evidencia: number; valor_atmosfera: number; forca_posicionamento: number;
}
export interface TextReading {
  semantics: Semantics;
  factual_claim: boolean;            // afirma evento/cliente/reunião/turma/projeto real
  factual_reason?: string;
  central_verb?: string;
  variant_intent: Partial<Record<StyleId, string>>; // variação que a árvore de cada estilo indica (ex.: { F01: 'F01-B' })
}
export interface RecentUse { style: string; variant: string; expression?: string | null; wardrobe?: string | null; environment?: string | null; text_space?: string | null; gaze?: string | null }
export interface AvailableRef { key: string; priority: RefPriority; roles: string[]; url: string; id?: string }

export interface PhotoPlan {
  status: 'generate' | 'needs_real_photo';
  origin: 'gerada' | 'real';
  style: StyleId; variant: string; expression: ExpressionId; wardrobe: string; environment: string;
  crop: Crop; gaze: Variant['gaze']; text_space: TextSpace; aspect: string;
  reasons: string[]; scores: Partial<Record<StyleId, number>>; penalties: string[];
  sufficiency: { a0: number; body_allowed: boolean; note?: string };
  central_verb?: string; semantics: Semantics;
}

const clamp = (n: unknown) => Math.max(0, Math.min(1, Number(n) || 0));
export function normalizeSemantics(s: Partial<Semantics> | undefined): Semantics {
  const k: (keyof Semantics)[] = ['autoria', 'densidade_conceitual', 'relacionalidade', 'orientacao_futuro', 'energia_acao', 'intimidade', 'necessidade_evidencia', 'valor_atmosfera', 'forca_posicionamento'];
  return Object.fromEntries(k.map((x) => [x, clamp(s?.[x])])) as unknown as Semantics;
}

// Palavras-sinal dos estilos (F02–F04 §1/§2): +0.08 por sinal positivo (máx. +0.2), −0.08 por negativo.
export function signalBoost(style: StyleId, text: string): number {
  const t = text.toLowerCase();
  const pos = STYLES[style].positive.filter((w) => t.includes(w.toLowerCase().replace(/_/g, ' '))).length;
  const neg = STYLES[style].negative.filter((w) => t.includes(w.toLowerCase().replace(/_/g, ' '))).length;
  return Math.min(0.2, pos * 0.08) - Math.min(0.2, neg * 0.08);
}

// Pontuação base de cada estilo (regra-base F01 §3 + campos semânticos F02–F04).
export function styleScores(s: Semantics, text: string): Record<StyleId, number> {
  const f01Candidate = s.autoria >= 0.7 && s.necessidade_evidencia < 0.45 && s.energia_acao < 0.6;
  const raw: Record<StyleId, number> = {
    F01: (f01Candidate ? 0.25 : 0) + s.autoria * 0.6 + s.forca_posicionamento * 0.25 + s.intimidade * 0.15 - s.relacionalidade * 0.2,
    F02: s.densidade_conceitual * 0.75 + (1 - s.energia_acao) * 0.1 - s.relacionalidade * 0.2 - s.orientacao_futuro * 0.1,
    F03: s.relacionalidade * 0.85 - s.densidade_conceitual * 0.05,
    F04: Math.max(s.orientacao_futuro, s.energia_acao) * 0.8 - s.relacionalidade * 0.1,
  };
  for (const k of Object.keys(raw) as StyleId[]) raw[k] = Math.round((raw[k] + signalBoost(k, text)) * 1000) / 1000;
  return raw;
}

// Ordem de preferência de variações dentro de cada estilo (desempates §5/§4).
const STYLE_ORDER: Record<StyleId, string[]> = {
  F01: ['F01-A', 'F01-B', 'F01-C', 'F01-D'],
  F02: ['F02-D', 'F02-A', 'F02-B', 'F02-C'],
  F03: ['F03-A', 'F03-B', 'F03-C', 'F03-D', 'F03-E', 'F03-F'],
  F04: ['F04-D', 'F04-A', 'F04-B', 'F04-C'],
};

const pickFresh = <T extends string>(options: T[], recent: (string | null | undefined)[], window = 2): T =>
  options.find((o) => !recent.slice(0, window).includes(o)) ?? options[0];

export function planPhoto(input: {
  text: string; reading: TextReading; recent: RecentUse[]; refs: AvailableRef[];
  approvedStyles?: StyleId[] | null;   // null/undefined = todos (ex.: prancha de validação)
  forceVariant?: string;               // prancha de validação / ajuste mantendo a variação
  aspect?: string;
}): PhotoPlan {
  const s = normalizeSemantics(input.reading.semantics);
  const a0 = input.refs.filter((r) => r.priority === 'A0').length;
  // Corpo: as A0 (23/09/2026) prevalecem; sem elas, por decisão do produtor, valem as
  // fotos de meio corpo da biblioteca. Sem nenhuma das duas → só rosto/busto (§4.4).
  const libraryBody = input.refs.some((r) => r.priority !== 'D' && r.roles.includes('mid_body'));
  const bodyAllowed = a0 > 0 || libraryBody;
  const sufficiency = {
    a0, body_allowed: bodyAllowed,
    note: a0 > 0 ? undefined : libraryBody
      ? 'Sem fotos A0: o corpo vem das fotos de meio corpo da biblioteca.'
      : 'Sem referências de corpo: só enquadramentos de rosto/busto (Constituição §4.4 — menor reconstrução).',
  };
  const reasons: string[] = [];
  const penalties: string[] = [];
  const base = {
    aspect: input.aspect ?? '4:5', sufficiency, central_verb: input.reading.central_verb, semantics: s,
  };

  const allowed = (v: Variant) => (bodyAllowed || !BODY_CROPS.includes(v.crop))
    && (!input.approvedStyles || input.approvedStyles.includes(v.style));

  // Regra de verdade (§2/§3; F03 §1): evidência factual → fotografia real.
  if (!input.forceVariant && (input.reading.factual_claim || s.necessidade_evidencia >= 0.6)) {
    const v = variantById('F01-A')!;
    return {
      ...base, status: 'needs_real_photo', origin: 'real', style: 'F01', variant: v.id, expression: 'E01', wardrobe: v.wardrobe[0],
      environment: v.environments[0], crop: v.crop, gaze: v.gaze, text_space: 'left', scores: {}, penalties,
      reasons: [`O texto depende de prova real${input.reading.factual_reason ? ` (${input.reading.factual_reason})` : ''}: usar fotografia real, não gerar.`],
    };
  }

  let variant: Variant | undefined;
  let scores: Partial<Record<StyleId, number>> = {};
  if (input.forceVariant) {
    variant = variantById(input.forceVariant);
    if (!variant) throw new Error(`Variação desconhecida: ${input.forceVariant}`);
    reasons.push(`Variação definida manualmente: ${variant.id}.`);
  } else {
    const sc = styleScores(s, input.text);
    const last3 = input.recent.slice(0, 3);
    // Penalidades de repetição (F01 §3; F02–F04 desempates).
    if (last3.filter((r) => r.style === 'F01').length >= 2) { sc.F01 -= 0.25; penalties.push('F01 usado em 2 dos 3 últimos'); }
    for (const st of Object.keys(sc) as StyleId[]) {
      if (last3.length === 3 && last3.every((r) => r.style === st)) { sc[st] -= 0.2; penalties.push(`${st} nos 3 últimos`); }
    }
    scores = sc;
    const ranked = (Object.keys(sc) as StyleId[]).sort((a, b) => sc[b] - sc[a]);
    for (const st of ranked) {
      const intent = input.reading.variant_intent?.[st];
      const order = [...(intent && variantById(intent)?.style === st ? [intent] : []), ...STYLE_ORDER[st].filter((x) => x !== intent)];
      const recentVariants = last3.map((r) => r.variant);
      const candidates = order.map((id) => variantById(id)!).filter(allowed);
      const fresh = candidates.find((v) => !recentVariants.includes(v.id)) ?? candidates[0];
      if (fresh) {
        variant = fresh;
        if (intent && fresh.id !== intent) penalties.push(`${intent} indisponível/repetida → ${fresh.id}`);
        break;
      }
    }
    if (!variant) throw new Error('Nenhuma variação disponível (estilos não aprovados ou referências insuficientes).');
    reasons.push(`${STYLES[variant.style].name} (${variant.style}): maior aderência ao texto (${scores[variant.style]?.toFixed(2)}).`);
    reasons.push(`${variant.id} — ${variant.name}: ${variant.operation}.`);
  }
  if (!allowed(variant) && !input.forceVariant) throw new Error('Variação não permitida.');

  const recentExpr = input.recent.map((r) => r.expression);
  const expression = pickFresh(variant.expressions, recentExpr, 1);
  const wardrobe = pickFresh(variant.wardrobe, input.recent.map((r) => r.wardrobe));
  const environment = pickFresh(variant.environments, input.recent.map((r) => r.environment));
  const lastSpace = input.recent[0]?.text_space;
  const text_space: TextSpace = lastSpace === 'left' ? 'right' : 'left';
  return {
    ...base, status: 'generate', origin: 'gerada', style: variant.style, variant: variant.id, expression, wardrobe, environment,
    crop: variant.crop, gaze: variant.gaze, text_space, scores, penalties, reasons,
  };
}

// ---------------- Referências (Perfil §11, §13, §14) ----------------
const has = (r: AvailableRef, role: string) => r.roles.includes(role);

// Até `max` referências humanas, na ordem de prioridade do perfil: A0 (rosto atual
// + corpo do mesmo ângulo quando o corpo aparece), A (rosto + expressão), B/C
// (apoio), D (só fala/anatomia). Devolve também o conjunto da COMPARAÇÃO lado a lado.
export function pickReferences(plan: Pick<PhotoPlan, 'crop' | 'expression' | 'gaze'> & { wardrobe?: string }, refs: AvailableRef[], max = 5) {
  const out: AvailableRef[] = [];
  const add = (r?: AvailableRef) => { if (r && !out.includes(r) && out.length < max) out.push(r); };
  const byKey = (k: string) => refs.find((r) => r.key === k);
  // Roupa da cena → prefere referências com a mesma roupa (consistência de figurino).
  const wardRole = plan.wardrobe === 'camiseta_preta' ? 'black_tshirt' : plan.wardrobe === 'camisa_azul_clara' ? 'light_blue_shirt' : null;
  const pref = (list: AvailableRef[]) => (wardRole ? [...list.filter((r) => has(r, wardRole)), ...list.filter((r) => !has(r, wardRole))] : list);
  const a0 = refs.filter((r) => r.priority === 'A0');
  const body = BODY_CROPS.includes(plan.crop);
  const libraryBody = pref(refs.filter((r) => r.priority !== 'D' && r.priority !== 'A0' && has(r, 'mid_body')));
  add(a0.find((r) => has(r, 'current_face_front')));
  add(a0.find((r) => has(r, 'current_face_three_quarter')));
  if (body) add(a0.find((r) => plan.crop === 'full_body' ? has(r, 'current_full_body_three_quarter_left') || has(r, 'current_full_body_front') : has(r, 'waist_definition') || has(r, 'current_torso')));
  add(byKey('HAR_0472'));                                   // A: rosto frontal neutro (cabelo, barba, pele)
  const exprRefs = EXPRESSIONS[plan.expression].refs.map(byKey).filter(Boolean) as AvailableRef[];
  exprRefs.slice(0, 2).forEach(add);                        // a expressão pedida (até 2)
  add(byKey('HAR_0476'));                                   // A: ¾ / geometria do rosto
  if (body && !a0.length) add(libraryBody[0]);              // corpo pela biblioteca (meio corpo, mesma roupa)
  exprRefs.slice(2).forEach(add);                           // demais da expressão (D só se sobrar)
  // Mínimo de 4 referências de identidade: completa com rostos (A, depois biblioteca com a mesma roupa).
  for (const r of pref(refs.filter((x) => (x.priority === 'A' || x.priority === 'B') && (has(x, 'face_front') || has(x, 'three_quarter') || has(x, 'face_geometry'))))) { if (out.length >= 4) break; add(r); }
  const human = out.filter((r) => r.priority !== 'D' || plan.expression === 'E05' || plan.expression === 'E04');
  const comparison = {
    front: a0.find((r) => has(r, 'current_face_front')) ?? byKey('HAR_0472') ?? null,
    three_quarter: a0.find((r) => has(r, 'current_face_three_quarter')) ?? byKey('HAR_0476') ?? null,
    expression: exprRefs[0] ?? null,
    body: body ? (a0.find((r) => has(r, 'body_proportions')) ?? libraryBody[0] ?? null) : null,
  };
  return { refs: human, comparison };
}

export const manifestRoles = (key: string) => REFERENCE_MANIFEST.find((m) => m.key === key);

// ---------------- Prompt (contrato de cada estilo §8–§9) ----------------
// Corte explícito: o modelo tende a abrir o plano; sem A0 o corpo não pode aparecer.
const CROP_TEXT: Record<Crop, string> = {
  close: 'CROP: head and shoulders only, cut at the upper chest; hands and torso are NOT in the frame',
  bust: 'CROP: bust portrait cut at mid-chest, just below the shoulders; hands, arms below the elbow, waist and legs are NOT in the frame',
  mid_body: 'CROP: half body, cut around the waist or hips',
  environmental: 'CROP: wide half-body inside the environment; Marcos occupies about 30–50% of the frame',
  full_body: 'CROP: full body including the feet, with the environment around',
};

const SPACE_TEXT: Record<TextSpace, string> = {
  left: 'TEXT SPACE LEFT: place Marcos in the RIGHT part of the frame (center of his face at about 65–70% of the width); the LEFT ~45% stays calm and low-complexity — the same real environment softly out of focus (wall, window light, depth), never a flat color; his gaze and body turned into the composition',
  right: 'TEXT SPACE RIGHT: place Marcos in the LEFT part of the frame (center of his face at about 30–35% of the width); the RIGHT ~45% stays calm and low-complexity — the same real environment softly out of focus, never a flat color; his gaze and body turned into the composition',
  top: 'keep the TOP area calm (ceiling, wall, sky or soft depth of the same scene) for later text',
  bottom: 'keep the BOTTOM area calm (table surface, floor or soft foreground of the same scene) for later text',
  none: 'no text area needed; the photograph must stand on its own',
};

export function buildPhotoPrompt(plan: PhotoPlan, refs: AvailableRef[], opts: { adjustNote?: string; previousFailure?: string } = {}): string {
  const v = variantById(plan.variant)!;
  const st = STYLES[v.style];
  const refLines = refs.map((r, i) => `${i + 1}) ${r.key} — level ${r.priority} (${r.roles.join(', ')})`).join('; ');
  return [
    `Use case: ${st.useCase}.`,
    `Style: ${st.id} ${st.name} — "${st.essence}" Variant: ${v.id} ${v.name} (${v.operation}).`,
    `Primary request: ${st.primaryRequest}`,
    `Input images, in order: ${refLines}. All input images show the SAME real man, Marcos Piccini. The person in the output MUST be this exact individual — recognizable by anyone who knows him — not a similar-looking or more handsome man. Use the input images only to preserve his identity and current appearance — never copy their studio backgrounds, lighting or exact poses.`,
    IDENTITY_CONTRACT,
    `Expression: ${EXPRESSIONS[plan.expression].name} — ${EXPRESSIONS[plan.expression].prompt}.`,
    `Scene: ${v.scene} Environment: ${ENVIRONMENTS[plan.environment] ?? plan.environment}.`,
    v.people ? `Other people: ${v.people}. They are editorial, not identifiable, never look at the camera, have coherent gaze and natural bodies; no names, badges or uniforms.` : 'Marcos is the only person in the frame.',
    `Framing: ${v.framing}. ${CROP_TEXT[plan.crop]}. ${SPACE_TEXT[plan.text_space]}. Do not crop joints accidentally; never place text area over eyes, mouth or relevant hands.`,
    plan.sufficiency.body_allowed ? '' : 'IMPORTANT: there are no body references, so his body proportions must not be reconstructed — keep the framing tight (no waist, no hands, no legs).',
    plan.sufficiency.body_allowed && plan.sufficiency.a0 === 0 && BODY_CROPS.includes(plan.crop) ? 'Body: derive his body from the half-body reference photos, keeping today\'s build — average, leaner than older photos, natural waist and abdomen, no athletic definition; legs and full height must stay proportionate to that torso.' : '',
    `Camera: ${st.lens}.`,
    `Light and color: ${st.light}.`,
    `Wardrobe: ${WARDROBE[plan.wardrobe]?.prompt ?? plan.wardrobe}. No invented accessories (no glasses, watch, badge or jewelry unless in the references).`,
    'Hands: anatomically correct with five natural fingers; when hands are not essential to the action keep them relaxed, partially hidden or softly out of focus rather than prominent. Any page, notebook, book, screen or board: its content must be illegible — seen at an angle and out of focus, abstract strokes only, never letter-like glyphs in focus. Background: no signs, plaques, posters or lettering of any kind.',
    'Constraints: exact recognizable identity and current proportions; natural skin texture; anatomically correct hands and fingers; coherent gaze; physically plausible light, perspective, depth of field and contact; homogeneous grain and sharpness; imperfection preferable to sterility; visually indistinguishable from a real photograph; no text, letters, numbers, logos, brands or watermark anywhere in the image.',
    `Avoid: ${[...HARD_AVOID, ...st.avoid, ...v.avoid].join('; ')}.`,
    opts.previousFailure ? `A previous attempt was REJECTED by the quality gate for: ${opts.previousFailure}. Fix exactly these problems.` : '',
    opts.adjustNote ? `Reviewer adjustment request (apply without breaking any rule above): ${opts.adjustNote}` : '',
    `Output: one single photograph, aspect ratio ${plan.aspect}, no borders, no collage, no text. Identity profile ${PROFILE_VERSION}.`,
  ].filter(Boolean).join('\n');
}

// ---------------- Portões de qualidade (Constituição §10; Perfil §14; F0x §9–§10) ----------------
export const PROFILE_IDENTITY_QUESTIONS = [
  'O rosto continua reconhecível sem depender do cabelo ou da roupa?',
  'A idade aparente corresponde ao momento atual (51 anos)?',
  'O rosto corresponde ao estado atual e o corpo segue as proporções atuais (sem emagrecer, engordar ou ganhar definição)?',
  'Olhos, nariz, boca, mandíbula e linha do cabelo permanecem consistentes?',
  'A expressão pertence ao repertório E01–E05?',
  'A barba mantém comprimento, distribuição e grisalho plausíveis?',
  'A imagem parece o Marcos em uma situação possível — e não um ator semelhante?',
];

export function buildGatePrompt(plan: PhotoPlan, refKeys: string[]): string {
  const v = variantById(plan.variant)!;
  const st = STYLES[v.style];
  return [
    'Você é o portão de qualidade do motor fotográfico da Hive. A 1ª imagem é a CANDIDATA gerada. As seguintes são fotografias REAIS de referência do Marcos Piccini (' + refKeys.join(', ') + ').',
    'Seja rigoroso: falhas de VERDADE ou IDENTIDADE nunca são compensadas por estética. Na dúvida relevante sobre identidade, reprove.',
    'Compare EXPLICITAMENTE com as referências: (a) cor do cabelo — predominantemente castanho-escuro, grisalho concentrado nas laterais; cabeça toda grisalha/prateada = falha de identidade; (b) comprimento e volume do cabelo — não pode estar mais comprido ou mais cheio; (c) barba — curta, castanha com grisalho, nunca cheia/escura/uniforme; (d) idade aparente; (e) largura do rosto, olhos, nariz e mandíbula. Qualquer letreiro, placa, letra ou logotipo visível no fundo (mesmo borrado) = falha de G0_verdade.',
    `Estilo pretendido: ${st.id} ${st.name} — variação ${v.id} ${v.name} (${v.operation}). Expressão pretendida: ${plan.expression} ${EXPRESSIONS[plan.expression].name}. Espaço de texto pedido: ${plan.text_space}.`,
    'Avalie e responda SOMENTE JSON:',
    '{',
    '  "G0_verdade": { "ok": bool, "notes": "inventa fato, cliente, evento, credencial, marca, plateia ou texto legível?" },',
    '  "G1_identidade": { "ok": bool, "score": 0.0-1.0, "answers": [7 booleans na ordem das perguntas], "notes": "" },',
    '  "G2_realismo": { "ok": bool, "notes": "luz, anatomia (mãos, pés, olhos), perspectiva, sinais de IA" },',
    '  "G3_coerencia": { "ok": bool, "notes": "a cena cumpre a função do estilo/variação, sem ilustrar literalmente?" },',
    '  "G4_composicao": { "ok": bool, "notes": "formato, espaço de texto útil, rosto/mãos/olhar preservados, sem cortes acidentais" },',
    '  "style_gates": [ { "q": "pergunta", "ok": bool, "note": "" } ],',
    '  "hard_reject_hits": [ "códigos da lista abaixo que ocorrem" ],',
    '  "observacoes": "texto curto e verificável"',
    '}',
    `Perguntas de identidade (Perfil §14): ${PROFILE_IDENTITY_QUESTIONS.map((q, i) => `${i + 1}. ${q}`).join(' ')}`,
    `Perguntas do estilo: ${st.gates.join(' | ')}`,
    `Códigos de rejeição automática do estilo: ${st.hardReject.join(', ')}.`,
  ].join('\n');
}

export interface GateResult {
  status: 'aprovada' | 'revisar' | 'rejeitada';
  hard_fail: 'verdade' | 'identidade' | 'realismo_critico' | 'nenhum';
  identity_status: 'aprovada' | 'revisar' | 'rejeitada';
  realism_status: 'aprovado' | 'revisar' | 'rejeitado';
  failures: string[];
  raw: Record<string, unknown>;
}

// Diversidade (G5) é medida por código (repetição recente); o resto vem da leitura visual.
// deno-lint-ignore no-explicit-any
export function readGates(raw: any, plan: Pick<PhotoPlan, 'variant' | 'wardrobe' | 'environment'>, recent: RecentUse[]): GateResult {
  if (Array.isArray(raw)) raw = raw[0] ?? {};   // o modelo às vezes devolve [ {...} ]
  const ok = (g: unknown) => (g as { ok?: boolean } | undefined)?.ok !== false;
  const failures: string[] = [];
  const idScore = Number(raw?.G1_identidade?.score ?? 0);
  const answers: boolean[] = Array.isArray(raw?.G1_identidade?.answers) ? raw.G1_identidade.answers : [];
  const idOk = ok(raw?.G1_identidade) && idScore >= 0.6 && answers.every((a) => a !== false);
  const truthOk = ok(raw?.G0_verdade);
  const realOk = ok(raw?.G2_realismo);
  const hits: string[] = Array.isArray(raw?.hard_reject_hits) ? raw.hard_reject_hits.filter(Boolean) : [];
  if (!truthOk) failures.push(`verdade: ${raw?.G0_verdade?.notes ?? ''}`.trim());
  if (!idOk) failures.push(`identidade (${idScore.toFixed(2)}): ${raw?.G1_identidade?.notes ?? ''}`.trim());
  if (!realOk) failures.push(`realismo: ${raw?.G2_realismo?.notes ?? ''}`.trim());
  if (!ok(raw?.G3_coerencia)) failures.push(`coerência: ${raw?.G3_coerencia?.notes ?? ''}`.trim());
  if (!ok(raw?.G4_composicao)) failures.push(`composição: ${raw?.G4_composicao?.notes ?? ''}`.trim());
  for (const g of Array.isArray(raw?.style_gates) ? raw.style_gates : []) if (g?.ok === false) failures.push(`estilo: ${g.q ?? ''} ${g.note ?? ''}`.trim());
  if (hits.length) failures.push(`rejeição automática: ${hits.join(', ')}`);
  const last3 = recent.slice(0, 3);
  if (last3.some((r) => r.variant === plan.variant && r.wardrobe === plan.wardrobe && r.environment === plan.environment)) failures.push('diversidade: repete variação, roupa e ambiente de um post recente');

  const realismCritical = !realOk && /mão|dedo|olho|hand|finger|eye|anatom|deform/i.test(String(raw?.G2_realismo?.notes ?? ''));
  const hard_fail: GateResult['hard_fail'] = !truthOk ? 'verdade' : !idOk ? 'identidade' : realismCritical ? 'realismo_critico' : 'nenhum';
  const status: GateResult['status'] = hard_fail !== 'nenhum' || hits.length ? 'rejeitada' : failures.length ? 'revisar' : 'aprovada';
  return {
    status, hard_fail, failures, raw,
    identity_status: idOk ? 'aprovada' : idScore >= 0.45 ? 'revisar' : 'rejeitada',
    realism_status: realOk ? 'aprovado' : realismCritical ? 'rejeitado' : 'revisar',
  };
}

export const ALL_VARIANT_IDS = VARIANTS.map((v) => v.id);
