// Edge function: distribute-schedule — a IA (de verdade) monta o CALENDÁRIO.
// Recebe os posts em stand-by + o que já está agendado + as preferências, e
// PROPÕE, pra cada post, um dia + horário + a JUSTIFICATIVA da escolha. Não
// grava nada: devolve o plano pro usuário revisar e aplicar (curadoria humana).
//
// Robustez de datas: o SERVIDOR gera as datas candidatas válidas (respeitando
// pular fim de semana, offset e horizonte) — o modelo só ESCOLHE entre elas e
// um horário permitido da plataforma. Assim ele nunca erra conta de calendário
// nem agenda no passado.
//
// Entrada: { today_date, horizon_days?, standby[], occupied[], prefs }
// Saída:   { success, plan: [{ post_id, date, time, reason }], summary }

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

interface StandbyPost {
  id: string;
  platform: string;
  editorial_slug?: string;
  editorial_name?: string;
  title?: string;
  theme?: string;
  virality_score?: number;
}
interface Occupied {
  date: string;       // 'YYYY-MM-DD'
  platform: string;
  editorial_slug?: string;
}
interface DistPrefs {
  skip_weekends?: boolean;
  per_day_limit?: number;
  start_offset_days?: number;
  platform_cadence?: Record<string, { per_week: number; times: string[] }>;
}
interface DistInput {
  today_date: string;       // 'YYYY-MM-DD' local do cliente
  horizon_days?: number;
  standby: StandbyPost[];
  occupied?: Occupied[];
  prefs: DistPrefs;
}

const WEEKDAY_PT = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

// Gera as próximas N datas de calendário válidas a partir de today+offset.
// Trabalha em componentes de data puros (sem fuso) via Date.UTC.
function candidateDates(todayDate: string, offset: number, horizon: number, skipWeekends: boolean): Array<{ date: string; weekday: string }> {
  const [y, m, d] = todayDate.split('-').map((x) => parseInt(x, 10));
  if (!y || !m || !d) return [];
  const out: Array<{ date: string; weekday: string }> = [];
  for (let i = offset; i <= offset + horizon && out.length < 40; i++) {
    const t = Date.UTC(y, m - 1, d + i);
    const dt = new Date(t);
    const dow = dt.getUTCDay();
    if (skipWeekends && (dow === 0 || dow === 6)) continue;
    out.push({ date: dt.toISOString().slice(0, 10), weekday: WEEKDAY_PT[dow] });
  }
  return out;
}

async function callGeminiOnce(apiKey: string, sys: string, usr: string, model: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  return await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: sys }] },
      contents: [{ role: 'user', parts: [{ text: usr }] }],
      generationConfig: { temperature: 0.6, maxOutputTokens: 4000, responseMimeType: 'application/json' },
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

    const rl = checkRateLimit(userId, 60_000, 20);
    if (!rl.ok) return errorResponse(`Rate limit. Tente em ${Math.ceil(rl.resetIn / 1000)}s`, 429);

    const input = (await req.json()) as DistInput;
    if (!Array.isArray(input.standby) || input.standby.length === 0) {
      return errorResponse('Nada em stand-by pra distribuir', 400);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.today_date ?? '')) {
      return errorResponse('today_date invalido (use YYYY-MM-DD)', 400);
    }

    const apiKey = await getUserGeminiKey(userId);
    if (!apiKey) return errorResponse('Chave Gemini nao configurada', 400);

    const prefs = input.prefs ?? {};
    const skipWeekends = prefs.skip_weekends ?? true;
    const perDay = Math.max(1, prefs.per_day_limit ?? 1);
    const offset = Math.max(0, prefs.start_offset_days ?? 1);
    const horizon = Math.max(14, Math.min(120, input.horizon_days ?? 45));
    const cadence = prefs.platform_cadence ?? {};

    const candidates = candidateDates(input.today_date, offset, horizon, skipWeekends);
    if (!candidates.length) return errorResponse('Sem datas candidatas', 500);
    const validDates = new Set(candidates.map((c) => c.date));

    // Horários permitidos por plataforma (default sensato se não vier cadência).
    const timesByPlatform: Record<string, string[]> = {};
    for (const p of input.standby) {
      if (timesByPlatform[p.platform]) continue;
      timesByPlatform[p.platform] = cadence[p.platform]?.times?.length
        ? cadence[p.platform].times
        : (p.platform === 'instagram' ? ['12:00', '18:30'] : ['09:00', '15:00']);
    }

    const sys = [
      'Você é o estrategista de conteúdo da Bee montando o calendário editorial da marca.',
      'Sua tarefa: distribuir os posts em stand-by ao longo dos próximos dias de forma ESTRATÉGICA e com NEXO — não aleatória.',
      'Princípios da boa distribuição:',
      '- Espalhe de forma equilibrada no horizonte; evite empilhar vários posts no mesmo dia (respeite o limite por dia).',
      '- Respeite a cadência semanal de cada plataforma (quantos posts por semana) e use SÓ os horários permitidos daquela plataforma.',
      '- Não cole dois posts da MESMA editoria em dias seguidos: dê respiro entre temas parecidos.',
      '- Sequencie com sentido narrativo: alterne intensidade/editoria pra criar ritmo na semana (não dois posts pesados e densos em sequência).',
      '- Considere a nota de viralidade pra dar bons dias/horários aos posts mais fortes, sem amontoar todos juntos.',
      '- Escolha o dia da semana e o horário que fazem sentido pra cada plataforma e tipo de conteúdo.',
      'Para CADA post, escreva uma justificativa CURTA (1 frase, máx ~90 chars) explicando por que aquele dia/horário — concreta, não genérica.',
      'REGRAS DURAS: use SOMENTE datas da lista de datas válidas e SOMENTE horários permitidos da plataforma do post. Todo post do stand-by deve receber exatamente um slot.',
    ].join('\n');

    const usr = [
      `HOJE: ${input.today_date}. Limite por dia: ${perDay}.`,
      '',
      'DATAS VÁLIDAS (escolha o campo "date" APENAS entre estas):',
      candidates.map((c) => `${c.date} (${c.weekday})`).join(' | '),
      '',
      'HORÁRIOS PERMITIDOS por plataforma (escolha "time" APENAS entre os da plataforma do post):',
      Object.entries(timesByPlatform).map(([pl, ts]) => `${pl}: ${ts.join(', ')}`).join('\n'),
      '',
      'CADÊNCIA SEMANAL por plataforma (máx posts/semana):',
      Object.entries(cadence).map(([pl, c]) => `${pl}: ${c.per_week}/semana`).join('\n') || '(sem limite específico)',
      '',
      'JÁ AGENDADOS (não mexa neles; use pra equilibrar e não colidir):',
      (input.occupied ?? []).length
        ? (input.occupied ?? []).map((o) => `${o.date} · ${o.platform}${o.editorial_slug ? ` · ${o.editorial_slug}` : ''}`).join('\n')
        : '(calendário vazio)',
      '',
      'POSTS EM STAND-BY pra distribuir:',
      input.standby.map((p, i) =>
        `${i + 1}. id=${p.id} · ${p.platform}${p.editorial_name ? ` · editoria: ${p.editorial_name}` : ''}` +
        `${p.virality_score != null ? ` · nota: ${p.virality_score}` : ''}` +
        `${p.title ? ` · "${String(p.title).slice(0, 80)}"` : ''}`,
      ).join('\n'),
      '',
      'Devolva JSON puro (sem markdown):',
      '{ "summary": "<1 frase sobre a lógica geral>", "plan": [ { "post_id": "<id>", "date": "<YYYY-MM-DD>", "time": "<HH:mm>", "reason": "<justificativa curta>" } ] }',
    ].join('\n');

    const { text, usage, model_used } = await callGemini(apiKey, sys, usr);

    const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/```$/, '').trim();
    let parsed: { summary?: string; plan?: Array<{ post_id?: string; date?: string; time?: string; reason?: string }> };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return errorResponse('A IA retornou um plano ilegível. Tente de novo.', 502);
    }

    // Validação/saneamento: só aceita posts do stand-by, datas candidatas e
    // horários permitidos da plataforma. Descarta linha inválida (o cliente
    // completa o que faltar pelo método local).
    const byId = new Map(input.standby.map((p) => [p.id, p]));
    const timeRe = /^([01]?\d|2[0-3]):[0-5]\d$/;
    const seenIds = new Set<string>();
    const plan: Array<{ post_id: string; date: string; time: string; reason: string }> = [];
    for (const row of parsed.plan ?? []) {
      const post = row.post_id ? byId.get(row.post_id) : undefined;
      if (!post || seenIds.has(post.id)) continue;
      if (!row.date || !validDates.has(row.date)) continue;
      let time = (row.time ?? '').trim();
      const allowed = timesByPlatform[post.platform] ?? [];
      if (!timeRe.test(time) || (allowed.length && !allowed.includes(time))) {
        time = allowed[0] ?? '09:00';
      }
      seenIds.add(post.id);
      plan.push({ post_id: post.id, date: row.date, time, reason: (row.reason ?? '').toString().slice(0, 140) });
    }

    if (!plan.length) return errorResponse('A IA não conseguiu montar um plano válido. Tente de novo.', 502);

    logUsage({
      userId, provider: 'gemini', product: 'text', model: model_used,
      tokens_input: usage?.input, tokens_output: usage?.output,
      metadata: { fn: 'distribute-schedule', posts: input.standby.length, planned: plan.length },
    });

    return jsonResponse({ success: true, plan, summary: (parsed.summary ?? '').toString().slice(0, 200) });
  } catch (e) {
    console.error('[distribute-schedule]', e);
    return errorResponse('Erro ao distribuir com IA', 500, String(e));
  }
});

export {};
