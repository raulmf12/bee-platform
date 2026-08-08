// Edge function: edit-text — EDIÇÃO CIRÚRGICA de um campo (título ou legenda).
// Recebe um texto que JÁ ESTÁ BOM + uma instrução de ajuste e aplica SOMENTE o
// que foi pedido, preservando o resto palavra por palavra. É o "Editar com IA":
// diferente de gerar do zero (generate-content) — aqui não há metodologia nem
// arsenal; a intenção é NÃO reescrever, só ajustar o ponto indicado.
//
// Entrada: { field, text, instruction, counterpart?, editorial_slug?,
//            target_platform?, max_chars? }
// Saída:   { success, text }
//
// NÃO aprende nem persiste nada — é um refino iterativo, chamado quantas vezes o
// usuário quiser até o texto ficar bom.

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

const MODEL_CHAIN = [
  Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-2.5-pro',
];
const MAX_RETRIES = 2;

interface EditInput {
  field: 'titulo' | 'legenda';
  text: string;
  instruction: string;
  counterpart?: string;          // o outro campo (só pra manter coerência)
  editorial_slug?: string;
  target_platform?: 'linkedin' | 'instagram';
  max_chars?: number;            // limite duro (o título tem ~200)
}

async function callGeminiOnce(apiKey: string, sys: string, usr: string, model: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  return await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: sys }] },
      contents: [{ role: 'user', parts: [{ text: usr }] }],
      // Temperatura baixa: fidelidade ao texto original, mudança mínima.
      generationConfig: { temperature: 0.3, maxOutputTokens: 2000, responseMimeType: 'application/json' },
    }),
  });
}

async function callGemini(apiKey: string, sys: string, usr: string) {
  let lastErr = '';
  for (const model of MODEL_CHAIN) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const res = await callGeminiOnce(apiKey, sys, usr, model);
        if (!res.ok) {
          lastErr = `[${model}] HTTP ${res.status}`;
          if (res.status === 503 || res.status === 429) { await new Promise((r) => setTimeout(r, (attempt + 1) * 1500)); continue; }
          break;
        }
        const json = await res.json();
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        if (!text || text.trim().length < 2) { lastErr = `[${model}] vazio`; continue; }
        return {
          text,
          usage: { input: json.usageMetadata?.promptTokenCount, output: json.usageMetadata?.candidatesTokenCount },
          model_used: model,
        };
      } catch (e) {
        lastErr = `[${model}] ${(e as Error).message}`;
        await new Promise((r) => setTimeout(r, 800));
      }
    }
  }
  throw new Error(`Gemini falhou. Último: ${lastErr}`);
}

Deno.serve(async (req: Request) => {
  const cors = preflight(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Use POST', 405);

  try {
    const userId = userIdFromAuth(req) ?? internalUserId(req);
    if (!userId) return errorResponse('Nao autenticado', 401);

    const rl = checkRateLimit(userId, 60_000, 40);
    if (!rl.ok) return errorResponse(`Rate limit. Tente em ${Math.ceil(rl.resetIn / 1000)}s`, 429);

    const input = (await req.json()) as EditInput;
    if (!input.text?.trim()) return errorResponse('text obrigatorio', 400);
    if (!input.instruction?.trim()) return errorResponse('instruction obrigatoria', 400);

    const apiKey = await getUserGeminiKey(userId);
    if (!apiKey) return errorResponse('Chave Gemini nao configurada', 400);

    const alvo = input.field === 'titulo' ? 'frase da imagem (título)' : 'legenda';

    const sys = [
      'Você é um editor de texto CIRÚRGICO da Bee. Recebe um texto que JÁ ESTÁ BOM e uma instrução de ajuste.',
      'Sua única tarefa: aplicar EXATAMENTE o ajuste pedido e NADA MAIS.',
      'Regras invioláveis:',
      '- Preserve todo o resto PALAVRA POR PALAVRA: estrutura, tom, ritmo, quebras de linha e todas as frases que a instrução não mencionou.',
      '- NÃO reescreva, NÃO "melhore" por conta própria, NÃO troque sinônimos fora do que foi pedido, NÃO acrescente nada que não foi solicitado.',
      '- Se o pedido for pequeno (trocar uma palavra, cortar uma frase, mudar o final, ajustar o tom de um trecho), mexa só naquilo.',
      '- Mantenha o MESMO assunto e a coerência com o texto complementar, se informado. Nunca mude de tema.',
      '- Devolva SÓ o texto final editado, sem aspas envolventes, sem comentários, sem markdown.',
    ].join('\n');

    const usr = [
      `CAMPO A EDITAR: ${alvo}`,
      input.counterpart?.trim()
        ? `TEXTO COMPLEMENTAR (NÃO edite — serve só pra você manter a coerência): "${input.counterpart.trim()}"`
        : '',
      input.max_chars ? `LIMITE: o resultado deve ter no máximo ${input.max_chars} caracteres.` : '',
      '',
      'TEXTO ATUAL (edite ESTE, preservando tudo que não foi pedido):',
      '"""',
      input.text,
      '"""',
      '',
      'AJUSTE PEDIDO:',
      input.instruction.trim(),
      '',
      'Devolva JSON puro (sem markdown): { "text": "<texto final editado>" }',
    ].filter((l) => l !== '').join('\n');

    const { text, usage, model_used } = await callGemini(apiKey, sys, usr);

    let parsed: { text?: string };
    try {
      parsed = JSON.parse(text.trim().replace(/^```json\s*/i, '').replace(/```$/, '').trim());
    } catch {
      return errorResponse('Resposta da IA em formato inválido', 502);
    }

    const edited = String(parsed.text ?? '').trim();
    if (!edited) return errorResponse('A IA não retornou texto editado', 502);

    logUsage({
      userId, provider: 'gemini', product: 'text', model: model_used,
      tokens_input: usage?.input, tokens_output: usage?.output,
      metadata: { fn: 'edit-text', field: input.field, platform: input.target_platform, editorial: input.editorial_slug },
    });

    return jsonResponse({ success: true, text: edited });
  } catch (e) {
    console.error('[edit-text]', e);
    return errorResponse('Erro ao editar o texto', 500, String(e));
  }
});

export {};
