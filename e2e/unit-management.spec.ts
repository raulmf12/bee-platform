import { test, expect } from '@playwright/test';
import { managementToken, createManagementFetch } from './helpers/management';

test('Linux usa token do ambiente sem decodificar token cru', () => {
  expect(managementToken({ SUPABASE_ACCESS_TOKEN: 'sbp-exemplo' }, 'linux')).toBe('sbp-exemplo');
});
test('macOS decodifica somente prefixo do keyring', () => {
  expect(managementToken({}, 'darwin', () => 'go-keyring-base64:' + Buffer.from('exemplo').toString('base64'))).toBe('exemplo');
  expect(managementToken({}, 'darwin', () => 'token-cru')).toBe('token-cru');
});
test('Linux sem token não tenta keychain', () => {
  expect(() => managementToken({}, 'linux', () => { throw new Error('não chamar'); })).toThrow('SUPABASE_ACCESS_TOKEN');
});
test('erro do keychain não expõe saída do comando', () => {
  expect(() => managementToken({}, 'darwin', () => { throw new Error('SEGREDO'); })).toThrow('Token administrativo indisponível no keychain.');
});
test('403 impede novas requisições sem trocar token', async () => {
  let calls = 0;
  const client = createManagementFetch(() => 'teste', async () => { calls++; return new Response('', { status: 403 }); });
  await expect(client('https://api.supabase.com/v1/projects/test/database/query')).rejects.toThrow('403');
  await expect(client('https://api.supabase.com/v1/projects/test/api-keys')).rejects.toThrow('bloqueado');
  expect(calls).toBe(1);
});
test('erro do banco chega com o motivo (regras PTxxx/CHECK são conferidas pela mensagem)', async () => {
  const client = createManagementFetch(() => 'teste', async () => new Response('{"message":"ERROR: pacote imutável"}', { status: 400 }));
  await expect(client('https://api.supabase.com/v1/projects/test/database/query')).rejects.toThrow(/HTTP 400: .*imutável/);
});
test('recusa destino externo antes de obter token', async () => {
  const client = createManagementFetch(() => { throw new Error('não obter'); });
  await expect(client('https://example.com')).rejects.toThrow('Destino administrativo inválido');
});
