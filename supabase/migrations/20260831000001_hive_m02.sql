-- =====================================================================
-- HIVE M02 — Rosto + Pensamento (presenca humana faz parte do significado)
-- =====================================================================
-- Segue a spec do cliente (spec-hive-m02). 4 variacoes:
--   A · Presenca  — o autor sustenta a ideia
--   B · Em Relacao — o pensamento nasce do encontro
--   C · Campo      — o contexto amplia o significado
--   D · Diario     — a origem do pensamento aparece
--
-- REGRA-MAE: a foto nao ilustra o texto; foto e pensamento formam UMA mensagem.
-- HIERARQUIA DE IMAGEM (instrucao do usuario): foto REAL do Marcos primeiro;
-- so quando nao houver foto real adequada, cena GERADA plausivel. E a geracao
-- so e honesta onde Marcos NAO precisa estar reconhecivel (C/D) — em A/B, sem
-- foto real, a variacao nao deve ser escolhida (nao se fabrica o rosto).
--
-- Tudo data-driven: must_have/prefer/avoid, allow_generated e o template de
-- geracao ficam em asset_requirements; o motor (hive-decide) le e decide.
-- Herda TODOS os tokens globais do M01 (cor/fonte/espiral/safe area).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Ancestralidade de imagem: derivacoes da mesma foto compartilham fonte.
--    (spec 1b · Repeticao / motor de diversidade por source_image_id)
-- ---------------------------------------------------------------------
ALTER TABLE public.design_assets
  ADD COLUMN IF NOT EXISTS source_image_id UUID REFERENCES public.design_assets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS person_slug TEXT;   -- 'marcos' (parametrizavel; nao hard-coded)
CREATE INDEX IF NOT EXISTS idx_design_assets_source ON public.design_assets(source_image_id);
CREATE INDEX IF NOT EXISTS idx_design_assets_person ON public.design_assets(person_slug) WHERE is_active;

-- ---------------------------------------------------------------------
-- 2. Config de selecao — uniao das dimensoes (M01 + M02) + diversidade
--    com ancestralidade. Um unico row global (curavel).
-- ---------------------------------------------------------------------
UPDATE public.design_selection_config SET
  weights = '{
    "standalone_text_strength":1,"verbal_tension":1,"conceptual_density":1,"authorship":1,
    "visual_metaphor_value":1,"information_structure_value":1,"documentary_value":1,
    "atmosphere_value":1,"materiality_value":1,
    "human_presence_value":1,"relation_value":1,"field_value":1,"context_narrative_value":1,
    "diary_value":1,"temporal_origin_value":1,"handwritten_record_value":1,"intimacy_value":1
  }'::jsonb,
  thresholds = '{"HIGH":0.70,"MED":0.40}'::jsonb,
  diversity  = '{"window":8,"penalty_per_recent_use":0.12,"tolerance":0.08,"source_penalty_per_use":0.12}'::jsonb
WHERE scope = 'global' AND ativo = TRUE;

-- ---------------------------------------------------------------------
-- 3. M02 — manifestacao (quando usar / quando nao / criterios de score)
-- ---------------------------------------------------------------------
UPDATE public.design_manifestacoes SET
  operacao = 'presenca humana como significado',
  funcao   = 'A foto nao ilustra o texto: foto e pensamento formam uma unica mensagem',
  quando_usar = '["presenca humana tem funcao narrativa","saber quem fala aumenta a potencia da ideia","pessoa, relacao, ambiente ou registro acrescentam dimensao que o texto sozinho nao tem","conteudo nasce de encontro, facilitacao, campo ou instante reconhecivel"]'::jsonb,
  quando_nao  = '["apenas para variar visualmente o feed","porque existe uma boa foto disponivel","a foto so ilustra literalmente o assunto","a presenca humana nao acrescenta significado","a cena exigiria falsificar um acontecimento apresentado como real","M01 sustenta melhor a forca autonoma do texto"]'::jsonb,
  score_criteria = '{"grows_with":["human_presence_value","relation_value","field_value","context_narrative_value","diary_value","intimacy_value"],"gate":"so selecionar se a presenca humana acrescenta significado","teste_final":"se retirarmos a foto, alguma dimensao importante da mensagem desaparece?"}'::jsonb
WHERE id = 'M02';

-- ---------------------------------------------------------------------
-- 4. M02 A..D — receitas CONGELADAS.
--    Geometria: o texto se posiciona pelo ESPACO NEGATIVO da foto
--    (headline.zones + default_zone; o compositor escolhe pela tag
--    espaco_texto do asset). Herda cor/fonte/espiral do global.
-- ---------------------------------------------------------------------
INSERT INTO public.design_variacoes
  (id, manifestacao_id, nome, operacao, sensacao, quando_usar, quando_nao, limites, layer_stack, asset_requirements, selection_rule, status, version, ordem)
VALUES
  -- ===== M02-A · PRESENCA =====
  ('M02-A','M02','Presenca','autor + pensamento',
   '["presenca","densidade","humanidade","proximidade","clareza"]'::jsonb,
   '["o pensamento possui autoria pessoal forte","saber quem esta falando aumenta a potencia da ideia","a expressao/presenca de Marcos acrescenta significado","o conteudo expressa conviccao, reflexao ou posicionamento autoral"]'::jsonb,
   '["a foto serve apenas para humanizar o post","o rosto nao acrescenta significado","a imagem parece retrato corporativo ou institucional","M01 sustenta melhor a autonomia da frase"]'::jsonb,
   '{"chars_min":20,"chars_ideal_max":150,"chars_limit":220,"chars_max_carrossel":300,"max_niveis":2,"destaque_max":1,"destaque_permitido":true,"image_required":true,"signature_default":false,"spiral_default":"optional"}'::jsonb,
   '[
     {"role":"photo","required":true,"source":{"asset_query":"ref:asset_requirements.photo"},"geometry":{"x":0,"y":0,"w":100,"h":100,"fit":"cover"}},
     {"role":"readability_overlay","required":false,"source":{"token":"azul_mp","condition":"apenas p/ legibilidade"},"geometry":{"mode":"directional","strength":0.7}},
     {"role":"headline","required":true,"source":{"text":"visual_text","token_color":"creme","font":"arbutus_slab"},"geometry":{"placement":"negative_space","default_zone":"baixo","zones":{"baixo":{"x":8,"w":84,"cy":80,"align":"left"},"topo":{"x":8,"w":84,"cy":17,"align":"left"},"esquerda":{"x":8,"w":50,"cy":50,"align":"left"},"direita":{"x":42,"w":50,"cy":50,"align":"left"},"centro":{"x":12,"w":76,"cy":50,"align":"center"}}}},
     {"role":"semantic_highlight","required":false,"source":{"token_color":"laranja","mode":"inline_words","min":1,"max":5}},
     {"role":"bee_spiral_official","required":false,"source":{"asset":"espiral_oficial"},"geometry":{"cx":90,"cy":92,"w":7}}
   ]'::jsonb,
   '{"photo":{"kind":"photo","must_have":{"marcos_presente":"sim","marcos_reconhecivel":"sim"},"prefer":{"asset_origin":"real","profundidade":"media","contexto_narrativo":"baixo"},"avoid":["retrato corporativo","pose excessiva","banco-de-imagem","expressao artificial","cenario excessivamente descritivo"],"allow_generated":false,"reason_no_gen":"Presenca exige Marcos reconhecivel; nao se fabrica o rosto — sem foto real, preferir M02-C ou M01"}}'::jsonb,
   '{"conditions":"human_presence_value >= HIGH AND authorship >= HIGH AND relation_value < HIGH AND field_value < HIGH"}'::jsonb,
   'frozen','v1.0', 1),

  -- ===== M02-B · EM RELACAO =====
  ('M02-B','M02','Em Relacao','encontro + pensamento',
   '["proximidade","troca","escuta","vinculo","movimento humano"]'::jsonb,
   '["uma conversa ou encontro faz parte da origem da ideia","a relacao acrescenta significado ao pensamento","o conteudo nasce de facilitacao, grupo, troca ou interacao","a existencia do outro e narrativamente relevante"]'::jsonb,
   '["a outra pessoa funciona apenas como figurante","e apenas uma foto de evento","a imagem comunica networking","a relacao representada contradiz ou falsifica um fato narrado"]'::jsonb,
   '{"chars_min":20,"chars_ideal_max":140,"chars_limit":210,"chars_max_carrossel":300,"max_niveis":2,"destaque_max":1,"destaque_permitido":true,"image_required":true,"signature_default":false,"spiral_default":"optional"}'::jsonb,
   '[
     {"role":"photo","required":true,"source":{"asset_query":"ref:asset_requirements.photo"},"geometry":{"x":0,"y":0,"w":100,"h":100,"fit":"cover"}},
     {"role":"readability_overlay","required":false,"source":{"token":"azul_mp","condition":"faixa/gradiente sutil"},"geometry":{"mode":"directional","strength":0.72}},
     {"role":"headline","required":true,"source":{"text":"visual_text","token_color":"creme","font":"arbutus_slab"},"geometry":{"placement":"negative_space","default_zone":"baixo","zones":{"baixo":{"x":8,"w":84,"cy":80,"align":"left"},"topo":{"x":8,"w":84,"cy":17,"align":"left"},"esquerda":{"x":8,"w":50,"cy":50,"align":"left"},"direita":{"x":42,"w":50,"cy":50,"align":"left"},"centro":{"x":12,"w":76,"cy":50,"align":"center"}}}},
     {"role":"semantic_highlight","required":false,"source":{"token_color":"laranja","mode":"inline_words","min":1,"max":5}},
     {"role":"bee_spiral_official","required":false,"source":{"asset":"espiral_oficial"},"geometry":{"cx":90,"cy":92,"w":7}}
   ]'::jsonb,
   '{"photo":{"kind":"photo","must_have":{"marcos_presente":"sim","relacao_narrativa":"alta"},"prefer":{"asset_origin":"real","espontaneidade":"alta","profundidade":"media"},"avoid":["grupo posado","foto corporativa","networking","pessoas geradas olhando p/ camera","rostos secundarios muito definidos quando gerada","simulacao documental de acontecimento especifico"],"allow_generated":false,"reason_no_gen":"B pede Marcos reconhecivel numa relacao real; sem foto real, nao gerar (viraria encontro fabricado) — preferir M02-C ou M01"}}'::jsonb,
   '{"conditions":"human_presence_value >= HIGH AND relation_value >= HIGH"}'::jsonb,
   'frozen','v1.0', 2),

  -- ===== M02-C · CAMPO =====
  ('M02-C','M02','Campo','contexto + pensamento',
   '["amplitude","realidade","movimento","experiencia","contemplacao"]'::jsonb,
   '["o lugar participa da ideia","o pensamento nasce de estar ou observar uma realidade","natureza, caminho, horizonte ou ambiente acrescentam significado","a escala entre pessoa e contexto faz parte da mensagem"]'::jsonb,
   '["o ambiente e apenas decorativo","a paisagem funciona como wallpaper","o lugar nao possui relacao semantica com o conteudo","a imagem e uma metafora visual literal e obvia"]'::jsonb,
   '{"chars_min":20,"chars_ideal_max":130,"chars_limit":200,"chars_max_carrossel":280,"max_niveis":2,"destaque_max":1,"destaque_permitido":true,"image_required":true,"signature_default":false,"spiral_default":"optional"}'::jsonb,
   '[
     {"role":"photo","required":true,"source":{"asset_query":"ref:asset_requirements.photo"},"geometry":{"x":0,"y":0,"w":100,"h":100,"fit":"cover"}},
     {"role":"readability_overlay","required":false,"source":{"token":"azul_mp","condition":"gradiente sutil"},"geometry":{"mode":"directional","strength":0.68}},
     {"role":"headline","required":true,"source":{"text":"visual_text","token_color":"creme","font":"arbutus_slab"},"geometry":{"placement":"negative_space","default_zone":"baixo","zones":{"baixo":{"x":8,"w":84,"cy":80,"align":"left"},"topo":{"x":8,"w":84,"cy":17,"align":"left"},"esquerda":{"x":8,"w":52,"cy":50,"align":"left"},"direita":{"x":40,"w":52,"cy":50,"align":"left"},"centro":{"x":12,"w":76,"cy":50,"align":"center"}}}},
     {"role":"semantic_highlight","required":false,"source":{"token_color":"laranja","mode":"inline_words","min":1,"max":5}},
     {"role":"bee_spiral_official","required":false,"source":{"asset":"espiral_oficial"},"geometry":{"cx":90,"cy":92,"w":6}}
   ]'::jsonb,
   '{"photo":{"kind":"photo","must_have":{"contexto_narrativo":"alto"},"prefer":{"profundidade":"alta","asset_origin":"real"},"avoid":["paisagem generica","imagem motivacional","metafora literal","Marcos obrigatoriamente centralizado","cenario artificial excessivamente perfeito"],"allow_generated":true,"generation":{"base_prompt":"Cena de campo/contexto real, fotorrealista e contemplativa, luz natural, profundidade alta, muito espaco negativo. A pessoa (se houver) aparece pequena, parcial ou de costas — NUNCA rosto reconhecivel em primeiro plano. Sem estetica de banco de imagens, sem texto, sem logo.","forbid":["rosto reconhecivel em primeiro plano","banco de imagens","texto","logo","pessoas olhando p/ camera"]}}}'::jsonb,
   '{"conditions":"field_value >= HIGH AND context_narrative_value >= HIGH AND relation_value < HIGH"}'::jsonb,
   'frozen','v1.0', 3),

  -- ===== M02-D · DIARIO =====
  ('M02-D','M02','Diario','registro + pensamento',
   '["intimidade","espontaneidade","autoria","proximidade","imperfeicao","verdade"]'::jsonb,
   '["o pensamento nasce de um instante reconhecivel","ha temporalidade ou carater de registro","anotacao, fragmento, data, manuscrito ou objeto participa da origem","o conteudo possui natureza pessoal e imediata"]'::jsonb,
   '["a espontaneidade e fabricada","a imagem parece ensaio tentando parecer casual","o registro e apenas decoracao","o conteudo nao possui nenhuma dimensao de origem ou instante"]'::jsonb,
   '{"chars_min":15,"chars_ideal_max":120,"chars_limit":180,"chars_max_carrossel":260,"max_niveis":2,"destaque_max":1,"destaque_permitido":true,"image_required":true,"signature_default":false,"spiral_default":"none"}'::jsonb,
   '[
     {"role":"photo","required":true,"source":{"asset_query":"ref:asset_requirements.photo"},"geometry":{"x":0,"y":0,"w":100,"h":100,"fit":"cover"}},
     {"role":"readability_overlay","required":false,"source":{"token":"azul_mp","condition":"evitar; so se indispensavel"},"geometry":{"mode":"directional","strength":0.6}},
     {"role":"headline","required":true,"source":{"text":"visual_text","token_color":"creme","font":"arbutus_slab"},"geometry":{"placement":"negative_space","default_zone":"baixo","zones":{"baixo":{"x":8,"w":84,"cy":81,"align":"left"},"topo":{"x":8,"w":84,"cy":18,"align":"left"},"esquerda":{"x":8,"w":52,"cy":52,"align":"left"},"direita":{"x":40,"w":52,"cy":52,"align":"left"},"centro":{"x":12,"w":76,"cy":52,"align":"center"}}}},
     {"role":"semantic_highlight","required":false,"source":{"token_color":"laranja","mode":"inline_words","min":1,"max":5}},
     {"role":"author_signature","required":false,"source":{"text":"MARCOS PICCINI","token_color":"neutro_texto"},"geometry":{"cx":50,"cy":90,"w":40,"align":"center","case":"upper","tracking":"wide","size":"xs"}}
   ]'::jsonb,
   '{"photo":{"kind":"photo","must_have":{"espontaneidade":"alta","tipo_registro":"cotidiano|anotacao"},"prefer":{"asset_origin":"real","documentalidade":"media"},"avoid":["mockup perfeito","caderno artificialmente composto","lifestyle","caligrafia fake apresentada como manuscrito real","estetica publicitaria"],"allow_generated":true,"generation":{"base_prompt":"Registro de diario/cotidiano fotorrealista: detalhe, objeto significativo, anotacao ou fragmento sobre superficie real. Luz natural, imperfeicao plausivel, carater documental e intimo. Sem rosto reconhecivel, sem manuscrito legivel apresentado como real, sem mockup perfeito, sem estetica publicitaria, sem texto, sem logo.","forbid":["mockup perfeito","manuscrito legivel apresentado como real","estetica publicitaria","texto","logo","lifestyle"]}}}'::jsonb,
   '{"conditions":"diary_value >= HIGH OR temporal_origin_value >= HIGH OR handwritten_record_value >= HIGH"}'::jsonb,
   'frozen','v1.0', 4)
ON CONFLICT (id) DO UPDATE SET
  nome = EXCLUDED.nome, operacao = EXCLUDED.operacao, sensacao = EXCLUDED.sensacao,
  quando_usar = EXCLUDED.quando_usar, quando_nao = EXCLUDED.quando_nao,
  limites = EXCLUDED.limites, layer_stack = EXCLUDED.layer_stack,
  asset_requirements = EXCLUDED.asset_requirements, selection_rule = EXCLUDED.selection_rule,
  status = EXCLUDED.status, version = EXCLUDED.version, ordem = EXCLUDED.ordem;
