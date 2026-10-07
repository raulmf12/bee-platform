// Memória anti-repetição: tudo o que já foi dito (posts publicados/programados/
// aprovados, importados do Instagram e do LinkedIn) vira embedding em content_memory.
// A pauta e a escrita consultam por SIGNIFICADO — sem janela de 90 dias e sem
// depender do título. Embeddings SEMANTIC_SIMILARITY dos dois lados (simétrico).
import { embedText } from './embed.ts';
import { callGeminiJson, svcHeaders } from './gemini.ts';
import { hashText, memoryText, repeatedStructures } from './memory-text.ts';

export { hashText, memoryText, repeatedStructures };

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
// Calibrado nos posts reais do Marcos (todo o corpus é do mesmo domínio, então a
// similaridade é alta em geral): ideia curta × post antigo fica entre 0,75 e 0,85
// mesmo quando é o MESMO caso. Por isso o embedding só ACHA os vizinhos e quem
// decide se é repetição é um juiz (LLM). ≥ NEAR vira contexto "já falamos disso".
export const NEAR_THRESHOLD = Number(Deno.env.get('MEMORY_NEAR_THRESHOLD') ?? '0.74');

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, { ...init, headers: { ...svcHeaders(), ...(init.headers ?? {}) } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path.split('?')[0]} ${res.status}: ${text.slice(0, 200)}`);
  return (text ? JSON.parse(text) : null) as T;
}

export const embedForMemory = (apiKey: string, text: string) => embedText(apiKey, text.slice(0, 2000), 'SEMANTIC_SIMILARITY');

// Indexa o que ainda não está na memória (ou mudou de texto). Incremental e barato.
export async function syncMemory(apiKey: string, userId: string, limit = 40): Promise<{ added: number; updated: number; pending: number }> {
  const [posts, mem] = await Promise.all([
    rest<Row[]>(`/user_posts?user_id=eq.${userId}&status=in.(published,scheduled,approved)&select=id,platform,title,caption,carousel_text,published_at,scheduled_date,created_at,metadata&order=created_at.desc&limit=5000`),
    rest<Row[]>(`/content_memory?user_id=eq.${userId}&select=post_id,text_hash&limit=10000`),
  ]);
  const known = new Map(mem.map((m) => [m.post_id, m.text_hash]));
  const todo: Array<{ p: Row; text: string; hash: string; update: boolean }> = [];
  for (const p of posts) {
    const text = memoryText(p);
    if (!text) continue;
    const hash = hashText(text);
    if (known.get(p.id) === hash) continue;
    todo.push({ p, text, hash, update: known.has(p.id) });
  }
  const batch = todo.slice(0, limit);
  let added = 0, updated = 0;
  for (let i = 0; i < batch.length; i += 4) {
    const chunk = batch.slice(i, i + 4);
    const vecs = await Promise.all(chunk.map((t) => embedForMemory(apiKey, t.text)));
    const rows = chunk.map((t, j) => ({
      user_id: userId, post_id: t.p.id, platform: t.p.platform,
      origin: t.p.metadata?.imported_from === 'instagram' ? 'instagram_import' : t.p.metadata?.imported_from === 'linkedin' ? 'linkedin_import' : 'platform',
      text: t.text, text_hash: t.hash, said_at: t.p.published_at ?? t.p.scheduled_date ?? t.p.created_at, embedding: JSON.stringify(vecs[j]),
    }));
    await rest(`/content_memory?on_conflict=post_id`, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows) });
    chunk.forEach((t) => (t.update ? updated++ : added++));
  }
  return { added, updated, pending: Math.max(0, todo.length - batch.length) };
}

export interface MemoryHit { post_id: string | null; platform: string | null; origin: string; text: string; said_at: string | null; similarity: number }

export async function similarPast(apiKey: string, userId: string, text: string, k = 5, embedding?: number[]): Promise<MemoryHit[]> {
  const vec = embedding ?? await embedForMemory(apiKey, text);
  return rest<MemoryHit[]>(`/rpc/match_content_memory`, { method: 'POST', body: JSON.stringify({ query_embedding: vec, filter_user_id: userId, match_count: k }) });
}

export async function recentSaid(userId: string, n = 40): Promise<Array<{ text: string; said_at: string | null }>> {
  return rest(`/content_memory?user_id=eq.${userId}&select=text,said_at&order=said_at.desc.nullslast&limit=${n}`);
}

// Bloco de prompt: o que já foi dito perto deste tema + tiques a evitar.
export function memoryPromptBlock(near: MemoryHit[], tics: string[]): string {
  const lines: string[] = [];
  if (near.length) {
    lines.push('JÁ PUBLICADO SOBRE TEMA PRÓXIMO (não reescreva estes — traga ângulo, exemplo, cena e estrutura NOVOS; se não houver nada novo a dizer, mude a entrada):');
    near.forEach((h) => lines.push(`- (${h.said_at?.slice(0, 10) ?? 's/d'} · ${h.platform ?? ''}) ${h.text.slice(0, 220)}`));
  }
  if (tics.length) {
    lines.push('TIQUES RECENTES — NÃO use nesta peça:');
    tics.forEach((t) => lines.push(`- ${t}`));
  }
  return lines.join('\n');
}

// Juiz de repetição: para cada item, compara com os vizinhos e decide se é a MESMA
// ideia/caso/argumento já publicado (repeat), tema próximo com ângulo novo (close) ou novo.
export interface RepeatVerdict { verdict: 'repeat' | 'close' | 'new'; of?: MemoryHit; reason: string }
export async function judgeRepetition(apiKey: string, items: Array<{ text: string; neighbors: MemoryHit[] }>): Promise<{ verdicts: RepeatVerdict[]; usage: { input?: number; output?: number }; model: string }> {
  const withN = items.map((it, i) => ({ ...it, i })).filter((it) => it.neighbors.length);
  if (!withN.length) return { verdicts: items.map(() => ({ verdict: 'new', reason: '' })), usage: {}, model: 'none' };
  const sys = [
    'Você é o guardião anti-repetição da Hive. Decide se um conteúdo NOVO repete algo que o autor JÁ publicou.',
    '"repeat" = mesma tese/ideia central, mesmo caso/história/número, ou a mesma frase com sinônimos trocados (ex.: "ferramentas complexas para evitar conversas simples" × "metodologias complexas para evitar conversas simples"), ou a mesma fórmula com outro sujeito (ex.: "o cansaço não é X, é um dado" × "o desconforto não é X, é um dado").',
    '"close" = mesmo território/tema, mas com tese, ângulo ou exemplo realmente diferentes.',
    '"new" = não se sobrepõe de forma relevante.',
    'Todos os textos são do mesmo autor e do mesmo campo (liderança sistêmica): falar de liderança, cultura ou equipe NÃO é repetição por si só. Seja preciso.',
    'JSON puro.',
  ].join('\n');
  const usr = withN.map((it) => [
    `ITEM ${it.i}: ${it.text.slice(0, 600)}`,
    ...it.neighbors.map((n, j) => `  já publicado ${it.i}.${j} (${n.said_at?.slice(0, 10) ?? 's/d'}): ${n.text.slice(0, 350)}`),
  ].join('\n')).join('\n\n') + '\n\n{ "items": [ { "item": 0, "verdict": "repeat|close|new", "of": "0.1 ou null", "reason": "<curto>" } ] }';
  const { data, usage, model_used } = await callGeminiJson<{ items?: Array<{ item?: number; verdict?: string; of?: string | null; reason?: string }> }>(apiKey, sys, usr, { temperature: 0.1, maxOutputTokens: 1500 });
  const verdicts: RepeatVerdict[] = items.map(() => ({ verdict: 'new', reason: '' }));
  for (const r of data.items ?? []) {
    const i = Number(r.item);
    if (!Number.isInteger(i) || !items[i]) continue;
    const v = r.verdict === 'repeat' || r.verdict === 'close' ? r.verdict : 'new';
    const j = Number(String(r.of ?? '').split('.')[1]);
    verdicts[i] = { verdict: v, of: Number.isInteger(j) ? items[i].neighbors[j] : items[i].neighbors[0], reason: String(r.reason ?? '').slice(0, 240) };
  }
  return { verdicts, usage, model: model_used };
}

// Vizinhos de vários textos de uma vez (embeddings em paralelo).
export async function neighborsFor(apiKey: string, userId: string, texts: string[], k = 4): Promise<MemoryHit[][]> {
  return Promise.all(texts.map((t) => similarPast(apiKey, userId, t, k).then((h) => h.filter((x) => x.similarity >= NEAR_THRESHOLD - 0.06)).catch(() => [])));
}
