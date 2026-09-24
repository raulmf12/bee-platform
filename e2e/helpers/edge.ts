import type { Page } from '@playwright/test';
import { loadEnv } from './env';

// Chama uma edge function DE VERDADE com a sessão do usuário logado na página
// (token do localStorage do supabase-js). Útil pra exercitar o backend real.
export async function callEdge<T = unknown>(page: Page, fn: string, body: unknown): Promise<{ status: number; json: T }> {
  loadEnv();
  const url = process.env.VITE_SUPABASE_URL!;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
  return page.evaluate(async ({ url, key, fn, body }) => {
    const raw = Object.keys(localStorage).find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
    const token = raw ? JSON.parse(localStorage.getItem(raw)!).access_token : key;
    const res = await fetch(`${url}/functions/v1/${fn}`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json: unknown = text;
    try { json = JSON.parse(text); } catch { /* texto cru */ }
    return { status: res.status, json: json as never };
  }, { url, key, fn, body });
}
