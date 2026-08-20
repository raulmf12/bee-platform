// Carrega as receitas frozen do M01 + os tokens de cor + a espiral, do banco.
// Leitura via supabase client (RLS: authenticated pode ler as tabelas design_*).

import { supabase } from '@/lib/supabase';
import type { M01Recipe } from './composeM01';

export interface DesignData {
  variacoes: M01Recipe[];
  colors: Record<string, string>;   // slug -> hex
  spiralUrl: string;
}

export async function loadM01Design(): Promise<DesignData> {
  const [varRes, tokRes] = await Promise.all([
    supabase
      .from('design_variacoes')
      .select('id,nome,limites,layer_stack')
      .eq('manifestacao_id', 'M01')
      .eq('status', 'frozen')
      .eq('ativo', true)
      .order('ordem', { ascending: true }),
    supabase.from('design_tokens').select('slug,kind,value'),
  ]);

  if (varRes.error) throw varRes.error;
  if (tokRes.error) throw tokRes.error;

  const colors: Record<string, string> = {};
  let spiralUrl = '/bee-spiral.png';
  for (const t of tokRes.data ?? []) {
    const value = (t.value ?? {}) as Record<string, unknown>;
    if (t.kind === 'color' && typeof value.hex === 'string') colors[t.slug] = value.hex;
    if (t.slug === 'espiral_oficial' && typeof value.asset_url === 'string') spiralUrl = value.asset_url;
  }

  const variacoes = (varRes.data ?? []) as unknown as M01Recipe[];
  return { variacoes, colors, spiralUrl };
}
