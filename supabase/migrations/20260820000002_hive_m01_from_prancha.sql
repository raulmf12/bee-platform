-- =====================================================================
-- HIVE M01 — extraido da PRANCHA aprovada (nao ha Canva). Feed 1080x1350.
-- =====================================================================
-- Fonte de verdade = a imagem M01 aprovada pelo usuario. Valores de cor sao
-- ESTIMATIVAS amostradas da imagem (JPEG) e a geometria em % e' um PRIMEIRO
-- PASSE a calibrar no primeiro render. is_official=false ate confirmarmos os
-- HEX/fonte exatos.
--
-- CONFLITO conhecido: a prancha diz "Playfair Display"; o doc detalhado (sec.18)
-- diz "Arbutus Slab". Seguindo a instrucao "pegar da imagem" -> Playfair Display.
-- Trocar depois = 1 UPDATE no token 'arbutus_slab'/'font'.
--
-- Convencao de geometria (0-100 % do canvas):
--   texto:  {x|cx, cy(centro optico), w(largura caixa), align, anchor}
--   spiral/linha: {cx, cy, w}
--   foto/textura: {x, y, w, h, ...}
--   safe area: 7% lateral / 6% topo-base.
-- =====================================================================

-- ---- TOKENS (valores estimados da imagem M01) ----
UPDATE public.design_tokens SET value = '{"hex":"#1C2E4A"}'::jsonb, notes = 'Azul MP (deep navy) estimado da imagem M01' WHERE slug = 'azul_mp';
UPDATE public.design_tokens SET value = '{"hex":"#EFE8DB"}'::jsonb, notes = 'Creme estimado da imagem M01' WHERE slug = 'creme';
UPDATE public.design_tokens SET value = '{"hex":"#E08A3C"}'::jsonb, notes = 'Laranja Bee estimado da imagem M01 (verbo: revelacao/virada)' WHERE slug = 'laranja';
UPDATE public.design_tokens SET value = '{"hex":"#FFFFFF"}'::jsonb WHERE slug = 'branco';
UPDATE public.design_tokens SET value = '{"hex":"#6B7280"}'::jsonb, notes = 'Neutro texto (ex: assinatura) estimado da imagem' WHERE slug = 'neutro_texto';
UPDATE public.design_tokens SET value = '{"hex":"#B8BCC2"}'::jsonb, notes = 'Neutro linha/detalhe estimado da imagem' WHERE slug = 'neutro_linha';

-- Fonte: seguindo a imagem (Playfair Display, serif display de alto contraste).
-- Google Fonts (embuti­vel no render). Conflito com Arbutus Slab do doc: sinalizado.
UPDATE public.design_tokens
  SET value = '{"family":"Playfair Display","source":"google_fonts","weights":[500,600,700],"conflict_note":"prancha=Playfair; doc sec.18=Arbutus Slab — resolver"}'::jsonb,
      label = 'Fonte principal (Playfair Display — da imagem)',
      notes = 'Imagem M01 usa serif display tipo Playfair; doc menciona Arbutus Slab. Trocar aqui se for Arbutus.'
  WHERE slug = 'arbutus_slab';

-- Geometria base do M01 (safe area) — da spec-base.
UPDATE public.design_tokens
  SET value = '{"canvas":{"w":1080,"h":1350},"safe_lateral_pct":7,"safe_top_bottom_pct":6}'::jsonb,
      notes = 'Safe area M01 feed (spec-base). Calibrar no render.'
  WHERE slug = 'safe_area';

-- ---- ESPIRAL oficial: usa o asset que ja existe no repo (public/bee-spiral.png) ----
INSERT INTO public.design_assets (kind, title, url, origin, semantic, tags, is_active)
SELECT 'spiral', 'Espiral Bee oficial', '/bee-spiral.png', 'official',
       '{"cor":"laranja","significado":["expansao","aprendizagem","oitavas","infinitude"]}'::jsonb,
       ARRAY['espiral','oficial','bee'], TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.design_assets WHERE kind = 'spiral' AND url = '/bee-spiral.png');

UPDATE public.design_tokens
  SET value = '{"asset_url":"/bee-spiral.png"}'::jsonb,
      notes = 'Aponta pra public/bee-spiral.png (a que o template atual usa). CONFIRMAR se e a oficial.'
  WHERE slug = 'espiral_oficial';

-- ---- GEOMETRIA das 5 variacoes (primeiro passe, calibrar no render) ----

-- M01-A — Essencial: creme, texto azul centralizado, espiral inferior central.
UPDATE public.design_variacoes SET layer_stack = '[
  {"role":"background","required":true,"source":{"token":"creme"}},
  {"role":"headline","required":true,"source":{"text":"visual_text","token_color":"azul_mp","font":"arbutus_slab"},"geometry":{"cx":50,"cy":43,"w":64,"align":"center","anchor":"optical_center"}},
  {"role":"bee_spiral_official","required":false,"source":{"asset":"espiral_oficial"},"geometry":{"cx":50,"cy":76,"w":11}}
]'::jsonb WHERE id = 'M01-A';

-- M01-B — Tensao: fundo azul, texto creme a esquerda, 1 palavra laranja, linha + espiral.
UPDATE public.design_variacoes SET layer_stack = '[
  {"role":"background","required":true,"source":{"token":"azul_mp"}},
  {"role":"headline","required":true,"source":{"text":"visual_text","token_color":"creme","font":"arbutus_slab"},"geometry":{"cx":50,"cy":46,"w":74,"align":"center","anchor":"optical_center"}},
  {"role":"semantic_highlight","required":false,"source":{"token_color":"laranja","mode":"inline_words","min":1,"max":5}},
  {"role":"structural_graphic","required":false,"source":{"kind":"linha","token_color":"laranja"},"geometry":{"cx":50,"cy":64,"w":6,"orientation":"horizontal"}},
  {"role":"bee_spiral_official","required":false,"source":{"asset":"espiral_oficial"},"geometry":{"cx":50,"cy":82,"w":10}}
]'::jsonb WHERE id = 'M01-B';

-- M01-C — Editorial: creme, moldura fina azul + marcador, texto centralizado, espiral, assinatura.
UPDATE public.design_variacoes SET layer_stack = '[
  {"role":"background","required":true,"source":{"token":"creme"}},
  {"role":"structural_graphic","required":false,"source":{"kind":"moldura","token_color":"azul_mp"},"geometry":{"type":"frame","inset":6,"stroke":"thin","marker":{"cx":50,"cy":24,"w":4,"token_color":"laranja"}}},
  {"role":"headline","required":true,"source":{"text":"visual_text","token_color":"azul_mp","font":"arbutus_slab"},"geometry":{"cx":50,"cy":40,"w":68,"align":"center","anchor":"optical_center"}},
  {"role":"semantic_highlight","required":false,"source":{"token_color":"laranja","mode":"inline_words","min":1,"max":5}},
  {"role":"bee_spiral_official","required":false,"source":{"asset":"espiral_oficial"},"geometry":{"cx":50,"cy":66,"w":9}},
  {"role":"author_signature","required":true,"source":{"text":"MARCOS PICCINI","token_color":"neutro_texto"},"geometry":{"cx":50,"cy":78,"w":40,"align":"center","case":"upper","tracking":"wide","size":"xs"}}
]'::jsonb WHERE id = 'M01-C';

-- M01-D — Campo: foto 100%, overlay condicional, texto creme a esquerda-baixo, espiral discreta.
UPDATE public.design_variacoes SET layer_stack = '[
  {"role":"photo","required":true,"source":{"asset_query":"ref:asset_requirements.photo"},"geometry":{"x":0,"y":0,"w":100,"h":100,"fit":"cover"}},
  {"role":"readability_overlay","required":false,"source":{"token":"azul_mp","condition":"apenas se necessario a legibilidade"},"geometry":{"x":0,"y":0,"w":100,"h":100,"opacity_range":[0,35],"gradient":"bottom"}},
  {"role":"headline","required":true,"source":{"text":"visual_text","token_color":"creme","font":"arbutus_slab"},"geometry":{"x":9,"cy":60,"w":64,"align":"left","anchor":"left_optical"}},
  {"role":"semantic_highlight","required":false,"source":{"token_color":"laranja","mode":"inline_words","min":1,"max":5}},
  {"role":"bee_spiral_official","required":false,"source":{"asset":"espiral_oficial"},"geometry":{"cx":50,"cy":86,"w":9}}
]'::jsonb WHERE id = 'M01-D';

-- M01-E — Materia: creme + textura organica a direita (5-15%), texto azul a esquerda, linha + espiral.
UPDATE public.design_variacoes SET layer_stack = '[
  {"role":"background","required":true,"source":{"token":"creme"}},
  {"role":"texture","required":false,"source":{"asset_query":"ref:asset_requirements.texture"},"geometry":{"x":52,"y":0,"w":48,"h":100,"opacity_range":[5,15],"anchor":"right"}},
  {"role":"headline","required":true,"source":{"text":"visual_text","token_color":"azul_mp","font":"arbutus_slab"},"geometry":{"x":9,"cy":40,"w":64,"align":"left","anchor":"left_optical"}},
  {"role":"semantic_highlight","required":false,"source":{"token_color":"laranja","mode":"inline_words","min":1,"max":5}},
  {"role":"structural_graphic","required":false,"source":{"kind":"linha","token_color":"laranja"},"geometry":{"cx":50,"cy":62,"w":6,"orientation":"horizontal"}},
  {"role":"bee_spiral_official","required":false,"source":{"asset":"espiral_oficial"},"geometry":{"cx":50,"cy":74,"w":10}}
]'::jsonb WHERE id = 'M01-E';

-- ---- M01 v1.0 APROVADA visualmente -> congela as 5 receitas ----
UPDATE public.design_variacoes SET status = 'frozen', version = 'v1.0' WHERE manifestacao_id = 'M01';
