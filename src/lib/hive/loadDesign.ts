// Carrega as receitas frozen do M01 + os tokens de cor + a espiral, do banco.
// Leitura via supabase client (RLS: authenticated pode ler as tabelas design_*).

import { supabase } from '@/lib/supabase';
import type { M01Recipe, DesignAsset } from './composeM01';

export interface DesignData {
  variacoes: M01Recipe[];
  colors: Record<string, string>;   // slug -> hex
  spiralUrl: string;
  assets: { photos: DesignAsset[]; textures: DesignAsset[] };
}

export async function loadM01Design(): Promise<DesignData> {
  const [varRes, tokRes, assetRes] = await Promise.all([
    supabase
      .from('design_variacoes')
      .select('id,nome,limites,layer_stack')
      .eq('manifestacao_id', 'M01')
      .eq('status', 'frozen')
      .eq('ativo', true)
      .order('ordem', { ascending: true }),
    supabase.from('design_tokens').select('slug,kind,value'),
    supabase.from('design_assets').select('kind,url,width,height').eq('is_active', true).in('kind', ['photo', 'texture']),
  ]);

  if (varRes.error) throw varRes.error;
  if (tokRes.error) throw tokRes.error;
  if (assetRes.error) throw assetRes.error;

  const colors: Record<string, string> = {};
  let spiralUrl = '/bee-spiral.png';
  for (const t of tokRes.data ?? []) {
    const value = (t.value ?? {}) as Record<string, unknown>;
    if (t.kind === 'color' && typeof value.hex === 'string') colors[t.slug] = value.hex;
    if (t.slug === 'espiral_oficial' && typeof value.asset_url === 'string') spiralUrl = value.asset_url;
  }

  const photos: DesignAsset[] = [];
  const textures: DesignAsset[] = [];
  for (const a of assetRes.data ?? []) {
    const asset: DesignAsset = { url: a.url as string, width: a.width as number | undefined, height: a.height as number | undefined };
    if (a.kind === 'photo') photos.push(asset);
    else if (a.kind === 'texture') textures.push(asset);
  }

  const variacoes = (varRes.data ?? []) as unknown as M01Recipe[];
  return { variacoes, colors, spiralUrl, assets: { photos, textures } };
}
