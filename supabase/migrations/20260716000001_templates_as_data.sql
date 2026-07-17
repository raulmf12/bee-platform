-- Templates viram DADO.
--
-- Ate aqui a geracao chamava hydrateBeeQuote() hardcoded e a post_templates era
-- decorativa: o template_config nunca era lido pra renderizar. Esta migration
-- semeia os templates de sistema de verdade, pra a geracao passar a ler daqui.
--
-- `slug` e a chave estavel: a geracao busca por `bee-quote-${sizeId}` em vez de
-- adivinhar por nome/plataforma. Unique index comum (NULLs nao conflitam), entao
-- linhas antigas sem slug convivem sem quebrar.
--
-- O template_config vem do proprio builder (scripts/dump-template.ts) — codigo e
-- banco nao divergem. Seed idempotente: upsert por slug.

alter table public.post_templates add column if not exists slug text;

create unique index if not exists post_templates_slug_key
  on public.post_templates (slug);

-- Bee Quote 4:5 (1080x1350)
insert into public.post_templates
  (slug, user_id, is_system, is_public, is_default, name, description, category, platform, format, slides_count, template_config)
values
  ('bee-quote-portrait', null, true, true, true, 'Bee Quote 4:5', 'Frase navy serif + espiral honey. Formato retrato — padrao LinkedIn.', 'bee', 'linkedin', 'image', 1, '{"width":1080,"height":1350,"background":"#FFFFFF","slides_json":[{"version":"6.0.0","background":"#FFFFFF","objects":[{"type":"Textbox","version":"6.0.0","text":"Sua frase aqui","left":76,"top":639,"width":929,"fontSize":60,"fontFamily":"Playfair Display","fontWeight":"bold","fill":"#2D4A5C","textAlign":"center","lineHeight":1.2,"editable":true,"name":"bee-quote"},{"type":"Image","version":"6.0.0","src":"/bee-spiral.png","crossOrigin":"anonymous","left":465,"top":1046,"scaleX":0.1388888888888889,"scaleY":0.1388888888888889,"name":"bee-spiral"}]}],"slides":{"slide1":{"name":"Slide 1","fields":[{"content_key":"bee-quote","type":"text","display_name":"Frase","max_chars":200,"text_rules":{"anchor_y_ratio":0.5,"width_ratio":0.86,"max_font_size":60,"min_font_size":30,"font_size_step":2,"max_lines":4,"balance":true,"line_height":1.2,"font_family":"Playfair Display","font_weight":"bold","fill":"#2D4A5C","text_align":"center","placeholder":"Sua frase aqui"}}]}}}'::jsonb)
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
  updated_at      = now();

-- Bee Quote 1:1 (1200x1200)
insert into public.post_templates
  (slug, user_id, is_system, is_public, is_default, name, description, category, platform, format, slides_count, template_config)
values
  ('bee-quote-square', null, true, true, true, 'Bee Quote 1:1', 'Frase navy serif + espiral honey. Formato quadrado — padrao Instagram.', 'bee', 'instagram', 'image', 1, '{"width":1200,"height":1200,"background":"#FFFFFF","slides_json":[{"version":"6.0.0","background":"#FFFFFF","objects":[{"type":"Textbox","version":"6.0.0","text":"Sua frase aqui","left":96,"top":538,"width":1008,"fontSize":64,"fontFamily":"Playfair Display","fontWeight":"bold","fill":"#2D4A5C","textAlign":"center","lineHeight":1.2,"editable":true,"name":"bee-quote"},{"type":"Image","version":"6.0.0","src":"/bee-spiral.png","crossOrigin":"anonymous","left":515,"top":911,"scaleX":0.1574074074074074,"scaleY":0.1574074074074074,"name":"bee-spiral"}]}],"slides":{"slide1":{"name":"Slide 1","fields":[{"content_key":"bee-quote","type":"text","display_name":"Frase","max_chars":200,"text_rules":{"anchor_y_ratio":0.48,"width_ratio":0.84,"max_font_size":64,"min_font_size":32,"font_size_step":2,"max_lines":4,"balance":true,"line_height":1.2,"font_family":"Playfair Display","font_weight":"bold","fill":"#2D4A5C","text_align":"center","placeholder":"Sua frase aqui"}}]}}}'::jsonb)
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
  updated_at      = now();

-- Bee Quote 1.91:1 (1200x628)
insert into public.post_templates
  (slug, user_id, is_system, is_public, is_default, name, description, category, platform, format, slides_count, template_config)
values
  ('bee-quote-landscape', null, true, true, false, 'Bee Quote 1.91:1', 'Frase navy serif + espiral honey. Formato paisagem.', 'bee', 'linkedin', 'image', 1, '{"width":1200,"height":628,"background":"#FFFFFF","slides_json":[{"version":"6.0.0","background":"#FFFFFF","objects":[{"type":"Textbox","version":"6.0.0","text":"Sua frase aqui","left":132,"top":255,"width":936,"fontSize":56,"fontFamily":"Playfair Display","fontWeight":"bold","fill":"#2D4A5C","textAlign":"center","lineHeight":1.2,"editable":true,"name":"bee-quote"},{"type":"Image","version":"6.0.0","src":"/bee-spiral.png","crossOrigin":"anonymous","left":545,"top":485,"scaleX":0.10185185185185185,"scaleY":0.10185185185185185,"name":"bee-spiral"}]}],"slides":{"slide1":{"name":"Slide 1","fields":[{"content_key":"bee-quote","type":"text","display_name":"Frase","max_chars":200,"text_rules":{"anchor_y_ratio":0.46,"width_ratio":0.78,"max_font_size":56,"min_font_size":28,"font_size_step":2,"max_lines":3,"balance":true,"line_height":1.2,"font_family":"Playfair Display","font_weight":"bold","fill":"#2D4A5C","text_align":"center","placeholder":"Sua frase aqui"}}]}}}'::jsonb)
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
  updated_at      = now();

