// Edge function: generate-persona
//
// A IA cria uma PESSOA INTEIRA a partir de um público-base + as pistas do
// usuário. Não é atributo de marketing — é gente: nome, idade, cargo, história,
// rotina, memórias, personalidade. Ancorada na dor/desejo do público real pra
// ela continuar sendo quem lê a Bee.
//
// Só PROPÕE — devolve a ficha pra o usuário revisar/editar/salvar.

import {
  errorResponse, getUserGeminiKey, jsonResponse, preflight, userIdFromAuth, checkRateLimit,
} from '../_shared/security.ts';

const MODEL_CHAIN = [
  Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
];

// Base = o público que ancora a pessoa (avatar ou público de editorial).
interface Base {
  nome?: string; quem?: string; dor?: string; desejo?: string;
  gatilhos?: string[]; objecoes?: string[]; linguagem?: string;
}

function systemPrompt(): string {
  return [
    'Voce cria PERSONAS realistas do publico da Bee Consulting (consultoria',
    'sistemica de lideranca). Uma persona NAO e uma lista de atributos — e uma',
    'PESSOA INTEIRA: com nome, idade, um trabalho concreto, uma historia de vida,',
    'uma rotina, memorias que a marcaram, um jeito de ser.',
    '',
    'Regras:',
    '- Concreta e especifica. Nome brasileiro real. Cargo e empresa plausiveis',
    '  (setor/porte anonimizado, ex: "diretor de operacoes numa transportadora de',
    '  medio porte"). Nada de "gestor generico".',
    '- A pessoa TEM que continuar sendo o publico-base: a dor, o desejo, as',
    '  objecoes e os gatilhos vem dele. Voce so DA CORPO a esse recorte.',
    '- Memorias e historia devem EXPLICAR a dor: de onde veio, o que a formou.',
    '- Respeite as pistas do usuario (genero, setor, idade, tom) se houver.',
    '',
    '=== SAIDA (JSON puro, sem markdown) ===',
    '{',
    '  "nome": "nome completo",',
    '  "idade": 44,',
    '  "cargo": "cargo atual",',
    '  "empresa": "contexto da empresa (setor, porte) — anonimizado",',
    '  "historia": "1 paragrafo: a trajetoria dela ate aqui, que explica a dor",',
    '  "rotina": "como e um dia normal dela",',
    '  "personalidade": "temperamento, como fala, manias, o que a irrita",',
    '  "memorias": ["2-4 memorias/experiencias formativas, concretas"],',
    '  "valores": ["2-4 coisas que ela valoriza de verdade"],',
    '  "dor": "a dor central (do publico-base, na pele dela)",',
    '  "desejo": "o que ela quer de verdade",',
    '  "objecoes": ["2-3 resistencias dela"],',
    '  "gatilhos": ["3-4 coisas que fazem ela parar o scroll"],',
    '  "linguagem": "como ela fala e o que valoriza ouvir"',
    '}',
    '- Tudo em portugues. Concreto, humano, sem lugar-comum.',
  ].join('\n');
}

function userPrompt(base: Base, hints?: string): string {
  const p: string[] = ['=== PUBLICO-BASE (ancore a pessoa nisto) ==='];
  if (base.nome) p.push(`Recorte: ${base.nome}`);
  if (base.quem) p.push(`Quem e: ${base.quem}`);
  if (base.dor) p.push(`Dor: ${base.dor}`);
  if (base.desejo) p.push(`Desejo: ${base.desejo}`);
  if (base.objecoes?.length) p.push(`Objecoes: ${base.objecoes.join('; ')}`);
  if (base.gatilhos?.length) p.push(`Gatilhos: ${base.gatilhos.join('; ')}`);
  if (base.linguagem) p.push(`Linguagem: ${base.linguagem}`);
  if (hints?.trim()) { p.push('', `=== PISTAS DO USUARIO (respeite) ===`, hints.trim()); }
  p.push('', 'Crie a pessoa completa. Devolva o JSON.');
  return p.join('\n');
}

function closeTruncated(raw: string): string {
  const stack: string[] = [];
  let inStr = false, esc = false;
  for (const c of raw) {
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '{' || c === '[') stack.push(c);
    else if (c === '}' || c === ']') stack.pop();
  }
  let out = raw;
  if (inStr) out += '"';
  out = out.replace(/[,:]\s*$/, '');
  while (stack.length) out += stack.pop() === '{' ? '}' : ']';
  return out;
}

function toArr(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean).slice(0, 6);
  if (typeof v === 'string' && v.trim()) return [v.trim()];
  return [];
}

function parse(raw: string) {
  const cleaned = (raw ?? '').trim().replace(/^```json\s*/i, '').replace(/```$/, '').trim();
  let p: Record<string, unknown>;
  try { p = JSON.parse(cleaned) as Record<string, unknown>; }
  catch { p = JSON.parse(closeTruncated(cleaned)) as Record<string, unknown>; }
  const idade = Number(p.idade);
  return {
    nome: String(p.nome ?? '').trim(),
    idade: Number.isFinite(idade) ? Math.round(idade) : null,
    cargo: String(p.cargo ?? '').trim(),
    empresa: String(p.empresa ?? '').trim(),
    historia: String(p.historia ?? '').trim(),
    rotina: String(p.rotina ?? '').trim(),
    personalidade: String(p.personalidade ?? '').trim(),
    memorias: toArr(p.memorias),
    valores: toArr(p.valores),
    dor: String(p.dor ?? '').trim(),
    desejo: String(p.desejo ?? '').trim(),
    objecoes: toArr(p.objecoes),
    gatilhos: toArr(p.gatilhos),
    linguagem: String(p.linguagem ?? '').trim(),
  };
}

async function callGemini(apiKey: string, sys: string, usr: string): Promise<string> {
  let lastErr = '';
  for (const model of MODEL_CHAIN) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: sys }] },
              contents: [{ role: 'user', parts: [{ text: usr }] }],
              generationConfig: { temperature: 0.9, maxOutputTokens: 4000, responseMimeType: 'application/json' },
            }),
          },
        );
        if (!res.ok) { lastErr = `HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`; continue; }
        const json = await res.json();
        const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        if (text) return text;
        lastErr = 'resposta vazia';
      } catch (e) { lastErr = (e as Error).message; }
    }
  }
  throw new Error(`Gemini falhou: ${lastErr}`);
}

Deno.serve(async (req: Request) => {
  const cors = preflight(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Use POST', 405);

  try {
    const userId = userIdFromAuth(req);
    if (!userId) return errorResponse('Nao autenticado', 401);

    const rl = checkRateLimit(userId, 60_000, 15);
    if (!rl.ok) return errorResponse(`Rate limit. Tente em ${Math.ceil(rl.resetIn / 1000)}s`, 429);

    const { base, hints } = await req.json() as { base?: Base; hints?: string };
    if ((!base || (!base.quem && !base.dor && !base.nome)) && !hints?.trim()) {
      return errorResponse('Escolha um publico-base ou de uma pista', 400);
    }

    const apiKey = await getUserGeminiKey(userId);
    if (!apiKey) return errorResponse('Chave Gemini nao configurada', 400);

    const raw = await callGemini(apiKey, systemPrompt(), userPrompt(base ?? {}, hints));
    let persona;
    try { persona = parse(raw); } catch { return errorResponse('A IA devolveu formato invalido, tente de novo', 502); }
    if (!persona.nome) persona.nome = 'Pessoa sem nome';

    return jsonResponse({ success: true, persona });
  } catch (e) {
    console.error('[generate-persona]', e);
    return errorResponse('Erro ao gerar a persona', 500, (e as Error).message);
  }
});
