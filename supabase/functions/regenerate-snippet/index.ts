// Edge function: regenerate-snippet — gera ALTERNATIVAS para um TRECHO
// selecionado dentro de uma legenda (ou título), sem tocar no resto.
// Ex: a pessoa gosta do texto mas quer outra opção de analogia numa frase.
// Seleciona só aquele trecho, dá uma orientação, e a IA devolve 4-5 opções
// que encaixam no lugar — coerentes com o texto ao redor e na voz da Bee.
//
// Entrada: { field?, full_text, snippet, instruction?, count?, editorial_slug?,
//            target_platform? }
// Saída:   { success, options: string[] }

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
import { loadBeeContext, retrieveContext, renderBrain, BEE_MODEL_CHAIN } from '../_shared/bee-context.ts';

// Mesma cadeia de modelos da geração (capacidade equivalente).
const MODEL_CHAIN = BEE_MODEL_CHAIN;
const MAX_RETRIES = 2;

interface SnippetInput {
  field?: 'titulo' | 'legenda';
  full_text: string;
  snippet: string;
  instruction?: string;
  count?: number;
  editorial_slug?: string;
  target_platform?: 'linkedin' | 'instagram';
}

// Recupera as strings do array "options" de um JSON truncado/malformado.
// Descarta a última se estiver incompleta (sem aspas de fechamento).
function salvageOptions(raw: string): string[] {
  const idx = raw.indexOf('"options"');
  const slice = idx >= 0 ? raw.slice(idx + '"options"'.length) : raw;
  const out: string[] = [];
  const re = /"((?:[^"\\]|\\.)*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(slice)) !== null) {
    try { out.push(JSON.parse(`"${m[1]}"`)); } catch { out.push(m[1]); }
  }
  return out.map((s) => s.trim()).filter((s) => s.length > 0);
}

async function callGeminiOnce(apiKey: string, sys: string, usr: string, model: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  return await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: sys }] },
      contents: [{ role: 'user', parts: [{ text: usr }] }],
      // Temperatura alta: as opções precisam ser DIFERENTES entre si.
      generationConfig: { temperature: 0.95, maxOutputTokens: 4096, responseMimeType: 'application/json' },
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

    const input = (await req.json()) as SnippetInput;
    if (!input.full_text?.trim()) return errorResponse('full_text obrigatorio', 400);
    if (!input.snippet?.trim()) return errorResponse('snippet obrigatorio', 400);

    const apiKey = await getUserGeminiKey(userId);
    if (!apiKey) return errorResponse('Chave Gemini nao configurada', 400);

    const count = Math.max(2, Math.min(6, input.count ?? 5));

    // CÉREBRO COMPLETO — mesmo acesso da geração (metodologia + biblioteca real).
    // As alternativas do trecho passam a nascer com a voz e os fatos reais da Bee,
    // não de improviso.
    let brain = '';
    try {
      const ctx = await loadBeeContext(
        { editorial_slug: input.editorial_slug ?? '', target_platform: input.target_platform },
        userId,
      );
      const rag = await retrieveContext(apiKey, input.full_text.slice(0, 500), `${input.instruction ?? ''} ${input.snippet}`, userId);
      brain = renderBrain(ctx, rag);
    } catch (e) {
      console.warn('[regenerate-snippet] falha ao carregar cérebro (segue sem)', e);
    }

    const sys = [
      'Você é um editor da Bee que gera ALTERNATIVAS para um TRECHO específico dentro de um texto, SEM tocar no resto.',
      '',
      '--- CONHECIMENTO DE APOIO (metodologia + biblioteca REAL do autor) — consulte ---',
      brain,
      '--- FIM DO CONHECIMENTO ---',
      '',
      `Gere exatamente ${count} opções, cada uma um SUBSTITUTO direto do trecho — encaixa no lugar dele mantendo a frase coerente com o texto ao redor.`,
      'Cada opção preserva o PAPEL do trecho (se é uma analogia, traga OUTRA analogia; se é um gancho, outro gancho) e o MESMO assunto.',
      'Mantenha a VOZ da Bee: olhar sistêmico, sem clichê corporativo, sem travessões (— ou -), sem emojis, sem hashtags.',
      'Se o trecho toca um FATO (história, pessoa, empresa, decisão), baseie-se nos FATOS REAIS DO AUTOR acima — nunca invente; anonimize nomes próprios.',
      'As opções devem ser DIFERENTES entre si (imagens/ângulos distintos), não variações mínimas de palavra.',
      'Devolva APENAS o trecho substituto em cada opção — NUNCA o texto inteiro, nem aspas envolventes.',
    ].join('\n');

    const usr = [
      `PLATAFORMA: ${input.target_platform ?? 'linkedin'}${input.editorial_slug ? ` · EDITORIA: ${input.editorial_slug}` : ''}`,
      input.field ? `CAMPO: ${input.field}` : '',
      '',
      'TEXTO COMPLETO (contexto — NÃO reescreva, é só pra manter coerência):',
      '"""',
      input.full_text,
      '"""',
      '',
      'TRECHO A SUBSTITUIR (gere alternativas SÓ para isto):',
      '"""',
      input.snippet,
      '"""',
      '',
      input.instruction?.trim() ? `ORIENTAÇÃO DO QUE QUERO: ${input.instruction.trim()}` : 'Sem orientação específica: traga ângulos/imagens variados, mantendo o sentido.',
      '',
      `Devolva JSON puro (sem markdown): { "options": [${Array.from({ length: count }, () => '"<alternativa>"').join(', ')}] }`,
    ].filter((l) => l !== '').join('\n');

    const { text, usage, model_used } = await callGemini(apiKey, sys, usr);

    const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/```$/, '').trim();
    let options: string[] = [];
    try {
      const parsed = JSON.parse(cleaned) as { options?: unknown };
      if (Array.isArray(parsed.options)) {
        options = parsed.options.map((o) => String(o ?? '').trim()).filter((o) => o.length > 0);
      }
    } catch {
      // JSON truncado (trecho grande + várias opções): recupera as strings do
      // array "options" mesmo sem o fechamento, descartando a última incompleta.
      options = salvageOptions(cleaned);
    }
    options = options.slice(0, count);
    if (!options.length) return errorResponse('A IA não retornou opções (tente selecionar um trecho menor)', 502);

    logUsage({
      userId, provider: 'gemini', product: 'text', model: model_used,
      tokens_input: usage?.input, tokens_output: usage?.output,
      metadata: { fn: 'regenerate-snippet', field: input.field, platform: input.target_platform, editorial: input.editorial_slug, count: options.length },
    });

    return jsonResponse({ success: true, options });
  } catch (e) {
    console.error('[regenerate-snippet]', e);
    return errorResponse('Erro ao gerar opções do trecho', 500, String(e));
  }
});

export {};
