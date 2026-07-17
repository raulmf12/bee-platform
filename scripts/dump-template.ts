// Gera o SQL de seed dos templates de sistema a partir do PROPRIO builder.
// Assim o template_config do banco nunca diverge do codigo versionado.
//
//   npx tsx scripts/dump-template.ts > /tmp/seed.sql
//
// O seed e idempotente: casa por `slug` e faz upsert.

import { buildBeeQuoteTemplateConfig, type BeeQuoteSize } from '../src/lib/templates/beeQuote';

interface SeedRow {
  slug: string;
  size: BeeQuoteSize;
  name: string;
  description: string;
  platform: string;
  is_default: boolean;
}

// A geracao escolhe o template pelo slug `bee-quote-${sizeId}`.
const ROWS: SeedRow[] = [
  {
    slug: 'bee-quote-portrait',
    size: 'portrait',
    name: 'Bee Quote 4:5',
    description: 'Frase navy serif + espiral honey. Formato retrato — padrao LinkedIn.',
    platform: 'linkedin',
    is_default: true,
  },
  {
    slug: 'bee-quote-square',
    size: 'square',
    name: 'Bee Quote 1:1',
    description: 'Frase navy serif + espiral honey. Formato quadrado — padrao Instagram.',
    platform: 'instagram',
    is_default: true,
  },
  {
    slug: 'bee-quote-landscape',
    size: 'landscape',
    name: 'Bee Quote 1.91:1',
    description: 'Frase navy serif + espiral honey. Formato paisagem.',
    platform: 'linkedin',
    is_default: false,
  },
];

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

const lines: string[] = [];
for (const r of ROWS) {
  const cfg = buildBeeQuoteTemplateConfig(r.size);
  lines.push(`-- ${r.name} (${cfg.width}x${cfg.height})`);
  lines.push(`insert into public.post_templates
  (slug, user_id, is_system, is_public, is_default, name, description, category, platform, format, slides_count, template_config)
values
  (${q(r.slug)}, null, true, true, ${r.is_default}, ${q(r.name)}, ${q(r.description)}, 'bee', ${q(r.platform)}, 'image', ${cfg.slides_json.length}, ${q(JSON.stringify(cfg))}::jsonb)
on conflict (slug) do update set
  name            = excluded.name,
  description     = excluded.description,
  category        = excluded.category,
  platform        = excluded.platform,
  format          = excluded.format,
  slides_count    = excluded.slides_count,
  template_config = excluded.template_config,
  is_system       = true,
  is_public       = true,
  is_default      = excluded.is_default,
  is_archived     = false,
  updated_at      = now();`);
  lines.push('');
}

console.log(lines.join('\n'));
