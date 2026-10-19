// RETORNO PREVISÍVEL (Estabilização · doc 04 §8): "Voltar" leva à origem interna que abriu a tela
// (passada em `state.from` ou `?from=`), validada contra as rotas da Hive; sem origem confiável, a um
// destino-pai explícito. Nunca `navigate(-1)` sozinho (link aberto direto ou em nova aba sairia da Hive)
// e nunca uma URL externa ou caminho arbitrário vindo de parâmetro.
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

// Rotas internas que podem ser destino de retorno.
const INTERNAL = [
  /^\/$/, /^\/agenda(\?|$)/, /^\/pipeline(\?|$)/, /^\/producao(\?|$)/, /^\/campanhas(\/[0-9a-f-]{36})?(\?|$)/, /^\/campanhas\/nova(\?|$)/,
  /^\/criar(\/conteudo)?(\?|$)/, /^\/posts\/novo(\?|$)/, /^\/posts\/[0-9a-f-]{36}(\?|$)/, /^\/podcasts(\?|$)/, /^\/desempenho(\?|$)/,
  /^\/identidade(\/.*)?$/,
];

export function safeInternalPath(raw?: string | null): string | null {
  if (!raw || typeof raw !== 'string') return null;
  let p = raw.trim();
  try { p = decodeURIComponent(p); } catch { return null; }
  if (!p.startsWith('/') || p.startsWith('//') || p.includes('\\') || /^\/[a-z]+:/i.test(p)) return null;
  return INTERNAL.some((re) => re.test(p)) ? p : null;
}

const LABELS: Array<[RegExp, string]> = [
  [/^\/agenda/, 'Voltar à agenda'], [/^\/pipeline/, 'Voltar aos conteúdos'], [/^\/producao/, 'Voltar à produção'],
  [/^\/campanhas\/nova/, 'Voltar à nova campanha'], [/^\/campanhas\/./, 'Voltar à campanha'], [/^\/campanhas/, 'Voltar às campanhas'],
  [/^\/criar/, 'Voltar a Criar'], [/^\/posts\/novo/, 'Voltar à revisão'], [/^\/posts\//, 'Voltar à peça'], [/^\/podcasts/, 'Voltar aos vídeos'],
  [/^\/desempenho/, 'Voltar ao desempenho'], [/^\/$/, 'Voltar ao início'],
];
export const backLabel = (path: string) => LABELS.find(([re]) => re.test(path))?.[1] ?? 'Voltar';

// Origem da tela atual (para quem ABRE outra tela passar adiante).
export function useHere(): string {
  const loc = useLocation();
  return `${loc.pathname}${loc.search}`;
}

// Destino do "Voltar" desta tela: origem válida → fallback explícito.
export function useBack(fallback: string): { to: string; label: string; go: () => void } {
  const navigate = useNavigate();
  const loc = useLocation();
  const [params] = useSearchParams();
  const from = safeInternalPath((loc.state as { from?: string } | null)?.from) ?? safeInternalPath(params.get('from'));
  const to = from ?? fallback;
  return { to, label: backLabel(to), go: () => navigate(to) };
}

// Destino pendente durante um gate obrigatório (configuração inicial): guardado na sessão do navegador.
const NEXT_KEY = 'hive.next';
export function rememberNext(path: string): void {
  try { if (safeInternalPath(path) && path !== '/') sessionStorage.setItem(NEXT_KEY, path); } catch { /* sem storage */ }
}
export function takeNext(): string | null {
  try { const p = sessionStorage.getItem(NEXT_KEY); sessionStorage.removeItem(NEXT_KEY); return safeInternalPath(p); } catch { return null; }
}
