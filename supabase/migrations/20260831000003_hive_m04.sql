-- =====================================================================
-- HIVE M04 — Convite / Jornada (transformar interesse em movimento)
-- =====================================================================
-- Convite para uma experiência/evento REAL. 3 variações:
--   A · Convite Essencial — produto/info protagonistas (foto + oferta + CTA)
--   B · Ideia → Convite    — uma reflexão abre caminho, o convite é consequência
--   C · Jornada            — situa a experiência numa trajetória (MC→FLS→Clareira)
--
-- DIFERENÇA-CHAVE: o M04 depende de DADOS REAIS do evento (nome, benefício,
-- data, hora, formato, autor, CTA, etapas). A spec proíbe urgência/promessa
-- fabricada — então esses dados vêm do USUÁRIO (gerador de convite), NÃO são
-- inferidos de uma frase. Por isso o M04 fica FORA da auto-decisão do motor
-- (auto_select=false); é acionado pela tela /hive/convite.
--
-- Herda tokens/fonte/espiral globais. Feed 1080x1350. "Presença que convida."
-- =====================================================================

-- 1) Flag de auto-seleção: o motor (hive-decide) só agrupa manifestações
--    auto_select=true. M04 é acionado sob demanda (precisa dos dados do evento).
ALTER TABLE public.design_manifestacoes
  ADD COLUMN IF NOT EXISTS auto_select BOOLEAN NOT NULL DEFAULT TRUE;
UPDATE public.design_manifestacoes SET auto_select = FALSE WHERE id = 'M04';

-- 2) M04 — manifestação
UPDATE public.design_manifestacoes SET
  operacao = 'transformar interesse em movimento',
  funcao   = 'Convidar para a próxima experiência sem virar publicidade — a ação nasce de clareza e significado',
  quando_usar = '["divulgar Masterclass ou outros eventos","comunicar turmas e períodos de inscrição","mostrar continuidade da jornada (MC → FLS → Clareira)","reativar e converter interesse em ação"]'::jsonb,
  quando_nao  = '["uma frase forte se sustenta melhor como M01","não há experiência/evento concreto a convidar","exigiria urgência artificial ou promessa vaga","viraria estética de lançamento/infoproduto/anúncio"]'::jsonb,
  score_criteria = '{"gate":"só quando há uma experiência real a convidar; a ação é consequência de clareza","regra":"convite não é venda agressiva"}'::jsonb
WHERE id = 'M04';

-- 3) M04 A..C — receitas CONGELADAS. O conteúdo do evento entra no compose
--    (gerador); aqui ficam layout + defaults curáveis (jornada/fechamento).
INSERT INTO public.design_variacoes
  (id, manifestacao_id, nome, operacao, sensacao, quando_usar, quando_nao, limites, layer_stack, asset_requirements, selection_rule, status, version, ordem)
VALUES
  -- ===== M04-A · CONVITE ESSENCIAL =====
  ('M04-A','M04','Convite Essencial','produto é protagonista',
   '["clareza","benefício","direção","convite","presença"]'::jsonb,
   '["o leitor já está próximo da experiência","a peça precisa tornar a oferta clara e acionável","produto e informação são protagonistas"]'::jsonb,
   '["urgência artificial","estética de lançamento","promessa vaga","foto genérica de evento"]'::jsonb,
   '{"chars_ideal_max":40,"destaque_permitido":true,"image_required":true,"cta_default":"INSCREVA-SE AGORA"}'::jsonb,
   '[
     {"role":"background","source":{"kind":"photo"}},
     {"role":"invite","source":{"kind":"convite_essencial"}}
   ]'::jsonb,
   '{"photo":{"kind":"photo","prefer":{"profundidade":"alta"},"avoid":["foto genérica de evento","corporativo"],"allow_generated":true,"generation":{"base_prompt":"Fotografia atmosférica com profundidade, propósito e movimento (ex.: lago ao amanhecer, cais, cadeira, paisagem contemplativa), luz natural, cinematográfica, muito espaço negativo. Sem texto, sem logo, sem pessoas olhando p/ câmera.","forbid":["texto","logo","estética de evento corporativo"]}}}'::jsonb,
   '{"conditions":"peça precisa apresentar uma experiência com clareza"}'::jsonb,
   'frozen','v1.0', 1),

  -- ===== M04-B · IDEIA → CONVITE =====
  ('M04-B','M04','Ideia → Convite','a reflexão abre caminho',
   '["tensão","reflexão","abertura","consequência","sentido"]'::jsonb,
   '["uma ideia autoral/tensão é a melhor porta de entrada","o convite surge como consequência da ideia","criar significado antes de convidar"]'::jsonb,
   '["card publicitário colado sobre post autoral","headline de anúncio","interrupção publicitária"]'::jsonb,
   '{"chars_ideal_max":60,"destaque_permitido":true,"image_required":true,"cta_default":"INSCRIÇÕES ABERTAS"}'::jsonb,
   '[
     {"role":"background","source":{"kind":"photo"}},
     {"role":"invite","source":{"kind":"ideia_convite"}}
   ]'::jsonb,
   '{"photo":{"kind":"photo","prefer":{"profundidade":"alta"},"avoid":["foto genérica de evento"],"allow_generated":true,"generation":{"base_prompt":"Fotografia atmosférica e simbólica que sustente reflexão E convite (profundidade, propósito, movimento), luz natural, contemplativa, muito espaço negativo. Sem texto, sem logo.","forbid":["texto","logo","estética publicitária"]}}}'::jsonb,
   '{"conditions":"criar significado antes de convidar"}'::jsonb,
   'frozen','v1.0', 2),

  -- ===== M04-C · JORNADA =====
  ('M04-C','M04','Jornada','a experiência dentro de um caminho',
   '["continuidade","progressão","sentido","pertencimento","trajetória"]'::jsonb,
   '["situar a experiência numa trajetória mais ampla","mostrar continuidade e progressão entre etapas","transmitir caminho, não funil comercial"]'::jsonb,
   '["fluxograma","funil comercial","muitas etapas","conectores sem função"]'::jsonb,
   '{"chars_ideal_max":55,"destaque_permitido":true,"image_required":false}'::jsonb,
   '[
     {"role":"background","source":{"token":"creme"}},
     {"role":"invite","source":{"kind":"jornada","data":{
        "steps":[
          {"n":"1","nome":"MASTERCLASS","title":"Liderar uma oitava acima.","desc":"Consciência que abre novas possibilidades.","focal":false},
          {"n":"2","nome":"FLS 6D","title":"Formação em Liderança Sistêmica.","desc":"Aprofundamento para transformar na prática.","focal":true},
          {"n":"3","nome":"CLAREIRA","title":"Comunidade de Liderança Sistêmica.","desc":"Pertencimento, aprendizado contínuo e evolução.","focal":false}
        ],
        "closing_title":"Você não precisa caminhar sozinho.",
        "closing_desc":"Presença, método e comunidade em uma jornada contínua."
     }}}
   ]'::jsonb,
   '{}'::jsonb,
   '{"conditions":"mostrar continuidade entre experiências"}'::jsonb,
   'frozen','v1.0', 3)
ON CONFLICT (id) DO UPDATE SET
  nome = EXCLUDED.nome, operacao = EXCLUDED.operacao, sensacao = EXCLUDED.sensacao,
  quando_usar = EXCLUDED.quando_usar, quando_nao = EXCLUDED.quando_nao,
  limites = EXCLUDED.limites, layer_stack = EXCLUDED.layer_stack,
  asset_requirements = EXCLUDED.asset_requirements, selection_rule = EXCLUDED.selection_rule,
  status = EXCLUDED.status, version = EXCLUDED.version, ordem = EXCLUDED.ordem;
