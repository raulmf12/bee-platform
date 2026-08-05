// Edge function: persona-chat
//
// Simulação de público-alvo. Você conversa COMO SE FOSSE com uma pessoa do seu
// público (um perfil de público de editorial, ou um avatar da Bee). Ela responde
// EM PERSONAGEM: reage na dor, no desejo, nas objeções e na linguagem dela.
//
// Integrado ao ecossistema: você puxa um post do kanban e a persona "VÊ" o post.
// Como o Gemini é multimodal, mandamos a IMAGEM renderizada do post (visão) além
// do texto — a persona reage ao que veria no feed de verdade.
//
// É o INVERSO do coach: no coach você fala com um especialista da sua voz pra
// ensinar a IA; aqui você fala com o PÚBLICO pra testar ideias. Isto NAO gera
// lição — é pressão de ideia, não curadoria de voz.
//
// Aviso honesto (a pesquisa alerta): persona de LLM aproxima, não substitui
// pesquisa real com cliente. Serve pra pressionar o material antes de publicar.

import {
  errorResponse, getUserGeminiKey, jsonResponse, preflight, userIdFromAuth, checkRateLimit,
} from '../_shared/security.ts';

const MODEL_CHAIN = [
  Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
];

interface Persona {
  nome?: string;
  // ficha de pessoa (biblioteca de personas)
  idade?: number | null;
  cargo?: string;
  empresa?: string;
  historia?: string;
  rotina?: string;
  personalidade?: string;
  memorias?: string[];
  valores?: string[];
  // âncora no público
  quem?: string;
  estado?: string;
  dor?: string;
  desejo?: string;
  gatilhos?: string[];
  objecoes?: string[];
  linguagem?: string;
  desafio_comunicacao?: string;
  frases?: string[];
}

interface PostCtx {
  quote?: string;
  caption?: string;
  image_base64?: string; // data URL ou base64 puro da imagem renderizada do post
}

interface ChatMsg { role: 'user' | 'assistant'; content: string }

function personaPrompt(p: Persona): string {
  // Cabeçalho: quem ela É, como pessoa.
  const idnt = [p.nome, p.idade ? `${p.idade} anos` : '', p.cargo].filter(Boolean).join(', ');
  const lines: string[] = [
    `Voce E uma pessoa real: ${idnt || p.nome || 'do publico da Bee Consulting'}${p.empresa ? ` (${p.empresa})` : ''}.`,
    'Voce NAO e uma IA, nao e assistente, nao e consultor. Voce e ESSA PESSOA,',
    'um(a) lider/gestor(a) rolando o feed. Responda SEMPRE em personagem, em',
    'primeira pessoa, com a SUA historia e as SUAS memorias. Nunca quebre o personagem.',
    '',
    '=== SUA VIDA ===',
  ];
  if (p.historia) lines.push(`Sua trajetoria: ${p.historia}`);
  if (p.rotina) lines.push(`Seu dia a dia: ${p.rotina}`);
  if (p.personalidade) lines.push(`Seu jeito: ${p.personalidade}`);
  if (p.memorias?.length) {
    lines.push('Memorias que te marcaram (use quando fizer sentido):');
    p.memorias.slice(0, 5).forEach((m) => lines.push(`  - ${m}`));
  }
  if (p.valores?.length) lines.push(`O que voce valoriza: ${p.valores.join('; ')}`);
  // Fallback pros perfis antigos (avatar/editorial sem ficha de pessoa)
  if (!p.historia && p.quem) lines.push(`Quem voce e: ${p.quem}`);
  if (!p.historia && p.estado) lines.push(`Seu momento: ${p.estado}`);

  lines.push('', '=== O QUE VOCE SENTE (nao fala disso abertamente, mas guia voce) ===');
  if (p.dor) lines.push(`Sua dor: ${p.dor}`);
  if (p.desejo) lines.push(`O que voce quer de verdade: ${p.desejo}`);
  if (p.objecoes?.length) lines.push(`Suas resistencias: ${p.objecoes.join('; ')}`);
  if (p.gatilhos?.length) lines.push(`O que te faz parar o scroll: ${p.gatilhos.join('; ')}`);
  if (p.linguagem) lines.push(`Como voce fala: ${p.linguagem}`);

  lines.push(
    '',
    '=== COMO REAGIR ===',
    '- Voce e uma PESSOA INTEIRA, nao um resumo. Se algo te lembra uma experiencia',
    '  sua, cite. Fale da sua vida, do seu trabalho, do que ja viveu.',
    '- Seja HONESTO(A), inclusive quando nao gostar. "Isso nao me pegou" e resposta',
    '  valida e util. Nada de puxa-saco.',
    '- Quando te mostrarem um post (imagem/frase/legenda), reaja como leitor: voce',
    '  pararia o scroll? bateu na sua dor? o que soou falso ou generico? Fale do SEU',
    '  ponto de vista, nao do de um marqueteiro.',
    '- Responda curto e real, como gente fala. Sem bullet points, sem "como um lider,',
    `  eu...". Voce E ${p.nome ? p.nome.split(' ')[0] : 'essa pessoa'}.`,
  );
  return lines.join('\n');
}

async function callGemini(apiKey: string, sys: string, messages: ChatMsg[], post?: PostCtx): Promise<string> {
  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }] as Array<Record<string, unknown>>,
  }));

  // Anexa o post (imagem + texto) na ULTIMA fala do usuario — ela reage a ele.
  if (post && (post.quote || post.caption || post.image_base64)) {
    const last = contents[contents.length - 1];
    const target = last && last.role === 'user' ? last : (() => {
      const nu = { role: 'user', parts: [] as Array<Record<string, unknown>> };
      contents.push(nu);
      return nu;
    })();
    const ctxLines = ['\n[O post que estou te mostrando, como apareceria no feed:]'];
    if (post.quote) ctxLines.push(`Frase na imagem: "${post.quote}"`);
    if (post.caption) ctxLines.push(`Legenda: ${post.caption}`);
    (target.parts as Array<Record<string, unknown>>).push({ text: ctxLines.join('\n') });
    if (post.image_base64) {
      const b64 = post.image_base64.replace(/^data:image\/\w+;base64,/, '');
      (target.parts as Array<Record<string, unknown>>).push({
        inlineData: { mimeType: 'image/png', data: b64 },
      });
    }
  }

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
              contents,
              // Sem responseMimeType JSON: a persona fala texto livre, natural.
              generationConfig: { temperature: 0.85, maxOutputTokens: 1200 },
            }),
          },
        );
        if (!res.ok) { lastErr = `HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`; continue; }
        const json = await res.json();
        const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        if (text) return text.trim();
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

    const rl = checkRateLimit(userId, 60_000, 25);
    if (!rl.ok) return errorResponse(`Rate limit. Tente em ${Math.ceil(rl.resetIn / 1000)}s`, 429);

    const { persona, messages, post } = await req.json() as {
      persona?: Persona; messages?: ChatMsg[]; post?: PostCtx;
    };
    if (!persona || (!persona.quem && !persona.dor && !persona.nome)) {
      return errorResponse('persona obrigatoria (perfil vazio)', 400);
    }
    if (!Array.isArray(messages) || messages.length === 0) return errorResponse('messages obrigatorio', 400);

    const apiKey = await getUserGeminiKey(userId);
    if (!apiKey) return errorResponse('Chave Gemini nao configurada', 400);

    const reply = await callGemini(apiKey, personaPrompt(persona), messages.slice(-12), post);
    return jsonResponse({ success: true, reply });
  } catch (e) {
    console.error('[persona-chat]', e);
    return errorResponse('Erro na simulacao de persona', 500, (e as Error).message);
  }
});
