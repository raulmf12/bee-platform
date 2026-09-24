// Edge function: campaign-moment — TELA 04 (Leitura do momento).
// "Não pergunta novamente o que consegue saber": agrega no servidor o histórico
// real do usuário (publicações, cadência, editoriais, métricas, contas,
// campanhas anteriores) e pede ao modelo uma leitura do momento.
// Entrada: { type: 'organica'|'vendas', intent?: string, user_note?: string }
// Saída:   { success, moment: { label, summary, signals[] }, facts }
import {
  checkRateLimit, errorResponse, getUserGeminiKey, internalUserId, jsonResponse, logUsage, preflight, userIdFromAuth,
} from '../_shared/security.ts';
import { callGeminiJson, fetchRest } from '../_shared/gemini.ts';

interface Input { type?: 'organica' | 'vendas'; intent?: string; user_note?: string }

const MOMENTS = [
  ['Construção de base', 'presença digital ainda pequena ou irregular; a prioridade é consistência e clareza de posicionamento'],
  ['Expansão de presença', 'já existe uma base relevante, mas há espaço importante para ampliar alcance, consistência e reconhecimento'],
  ['Consolidação de autoridade', 'presença consistente e reconhecida; o momento é aprofundar repertório e demonstrar profundidade'],
  ['Retomada', 'houve pausa ou queda recente de publicações; o momento é retomar ritmo sem perder o posicionamento'],
  ['Aquecimento para lançamento', 'há um produto/oferta chegando; o momento é preparar terreno, gerar desejo e conversa'],
  ['Lançamento', 'o produto/oferta está aberto; o momento é converter mantendo a coerência da presença'],
];

type Post = { platform: string; status: string; published_at: string | null; created_at: string; metadata: Record<string, unknown> | null };

function weeksAgo(iso: string): number { return (Date.now() - new Date(iso).getTime()) / (7 * 86_400_000); }

Deno.serve(async (req: Request) => {
  const cors = preflight(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Use POST', 405);
  try {
    const userId = userIdFromAuth(req) ?? internalUserId(req);
    if (!userId) return errorResponse('Nao autenticado', 401);
    const rl = checkRateLimit(userId, 60_000, 15);
    if (!rl.ok) return errorResponse(`Rate limit. Tente em ${Math.ceil(rl.resetIn / 1000)}s`, 429);
    const input = (await req.json().catch(() => ({}))) as Input;
    const apiKey = await getUserGeminiKey(userId);
    if (!apiKey) return errorResponse('Chave Gemini nao configurada', 400);

    const since = new Date(Date.now() - 180 * 86_400_000).toISOString();
    const [posts, metrics, campaigns, accounts, core] = await Promise.all([
      fetchRest<Post[]>(`/user_posts?user_id=eq.${userId}&select=platform,status,published_at,created_at,metadata&or=(published_at.gte.${since},status.in.(scheduled,approved,pending_approval))&limit=1000`),
      fetchRest<Array<{ likes: number | null; comments: number | null; reach: number | null; source: string }>>(`/post_metrics?user_id=eq.${userId}&select=likes,comments,reach,source&limit=1000`),
      fetchRest<Array<{ name: string; status: string; type: string; created_at: string }>>(`/campaigns?user_id=eq.${userId}&select=name,status,type,created_at&order=created_at.desc&limit=10`),
      fetchRest<Array<{ platform: string; label: string }>>(`/social_accounts?user_id=eq.${userId}&select=platform,label`),
      fetchRest<Array<{ produto_real: string; frase_organizadora: string }>>(`/genesis_core?select=produto_real,frase_organizadora&limit=1`),
    ]);

    // ---- Fatos (determinísticos) ----
    const published = posts.filter((p) => p.status === 'published' && p.published_at);
    const byPlatform: Record<string, number> = {};
    const byEditorial: Record<string, number> = {};
    for (const p of published) {
      byPlatform[p.platform] = (byPlatform[p.platform] ?? 0) + 1;
      const ed = (p.metadata?.editorial_slug as string | undefined) ?? 'sem editorial';
      byEditorial[ed] = (byEditorial[ed] ?? 0) + 1;
    }
    const last4 = published.filter((p) => weeksAgo(p.published_at!) <= 4).length;
    const prev4 = published.filter((p) => { const w = weeksAgo(p.published_at!); return w > 4 && w <= 8; }).length;
    const lastPub = published.map((p) => p.published_at!).sort().at(-1) ?? null;
    const pipeline = posts.filter((p) => p.status !== 'published').length;
    const withMetrics = metrics.filter((m) => m.likes != null);
    const avgLikes = withMetrics.length ? Math.round(withMetrics.reduce((a, m) => a + (m.likes ?? 0), 0) / withMetrics.length) : null;
    const facts = {
      publicados_180d: published.length,
      por_plataforma: byPlatform,
      por_editorial: byEditorial,
      publicados_ultimas_4_semanas: last4,
      publicados_4_semanas_anteriores: prev4,
      media_semanal_recente: Math.round((last4 / 4) * 10) / 10,
      ultima_publicacao: lastPub,
      em_producao_ou_agendados: pipeline,
      contas: accounts.map((a) => `${a.platform} · ${a.label}`),
      campanhas_anteriores: campaigns.map((c) => `${c.name} (${c.type}, ${c.status})`),
      metricas: withMetrics.length ? { posts_com_metricas: withMetrics.length, media_curtidas: avgLikes } : 'sem métricas coletadas ainda',
    };

    const sys = [
      'Você é a Hive, a inteligência estratégica de conteúdo da Bee Consulting. Faz a LEITURA DO MOMENTO da presença digital de um produtor de conteúdo antes de montar uma campanha.',
      'Baseie-se SOMENTE nos fatos fornecidos. Nunca invente números. Se os dados forem poucos, diga isso com naturalidade.',
      'Escreva em português do Brasil, falando diretamente com a pessoa ("você"), tom sóbrio, claro e humano — sem jargão de marketing, sem exagero.',
      'Escolha o rótulo do momento dentre estes (use exatamente o texto):',
      ...MOMENTS.map(([l, d]) => `- "${l}": ${d}`),
    ].join('\n');
    const usr = [
      `TIPO DE CAMPANHA: ${input.type === 'vendas' ? 'Vendas / Lançamento' : 'Orgânica'}`,
      input.intent ? `O QUE A PESSOA PRETENDE: ${input.intent}` : '',
      input.user_note ? `A PESSOA CORRIGIU A LEITURA ANTERIOR, dizendo: "${input.user_note}". Priorize essa autodescrição.` : '',
      core[0] ? `PROPÓSITO DA MARCA: ${core[0].produto_real}` : '',
      '',
      'FATOS DA PRESENÇA DIGITAL (últimos 180 dias):',
      JSON.stringify(facts, null, 1),
      '',
      'Devolva JSON puro:',
      '{ "label": "<um dos rótulos>", "summary": "<2 a 3 frases, falando com a pessoa, no estilo: Você já construiu... Seu conteúdo apresenta...>", "signals": ["<3 a 4 sinais curtos e concretos tirados dos fatos>"] }',
    ].filter(Boolean).join('\n');

    const { data, model_used, usage } = await callGeminiJson<{ label?: string; summary?: string; signals?: string[] }>(apiKey, sys, usr, { temperature: 0.3, maxOutputTokens: 1200 });
    const label = MOMENTS.some(([l]) => l === data.label) ? data.label! : (published.length < 8 ? 'Construção de base' : 'Expansão de presença');
    logUsage({ userId, provider: 'gemini', product: 'text', model: model_used, tokens_input: usage.input, tokens_output: usage.output, metadata: { fn: 'campaign-moment' } });
    return jsonResponse({
      success: true,
      moment: { label, summary: String(data.summary ?? '').trim(), signals: (data.signals ?? []).slice(0, 4).map(String) },
      facts,
    });
  } catch (e) {
    console.error('[campaign-moment]', e);
    return errorResponse('Erro na leitura do momento', 500, String(e));
  }
});

export {};
