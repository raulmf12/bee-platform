import { execFileSync } from 'node:child_process';

export function managementToken(env = process.env, platform = process.platform, keychain = () => execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString()) {
  let raw = env.SUPABASE_ACCESS_TOKEN?.trim();
  if (!raw && platform === 'darwin') {
    try { raw = keychain().trim(); } catch { throw new Error('Token administrativo indisponível no keychain.'); }
  }
  if (!raw) throw new Error('Defina SUPABASE_ACCESS_TOKEN no ambiente de testes.');
  return raw.startsWith('go-keyring-base64:') ? Buffer.from(raw.slice('go-keyring-base64:'.length), 'base64').toString() : raw;
}

/** 403 encerra o acesso desta instância; sem troca de chave ou rota alternativa. */
export function createManagementFetch(token = managementToken, request: typeof fetch = fetch) {
  let blocked = false;
  return async (url: string, init: RequestInit = {}) => {
    if (blocked) throw new Error('Acesso administrativo bloqueado após 403. Aguarde o Raul.');
    if (!url.startsWith('https://api.supabase.com/v1/projects/')) throw new Error('Destino administrativo inválido.');
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token()}`);
    const response = await request(url, { ...init, headers });
    if (response.status === 403) {
      blocked = true;
      throw new Error('Supabase 403: pare e aguarde o Raul.');
    }
    // O corpo traz o motivo do banco (ex.: RAISE ... 'imutável'): os testes de regra conferem essa mensagem.
    if (!response.ok) throw new Error(`Management API: HTTP ${response.status}: ${(await response.text().catch(() => '')).slice(0, 400)}`);
    return response;
  };
}
export const managementFetch = createManagementFetch();
