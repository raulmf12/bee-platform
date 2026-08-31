-- =====================================================================
-- HIVE M03 — Conceito / Lente (tornar visível uma estrutura necessária)
-- =====================================================================
-- Segue a spec + board M03. 4 variações (diagramas geométricos, NÃO foto):
--   A · Relação   — conectar: interdependências (2 polos + causalidade circular)
--   B · Camadas   — aprofundar: níveis da mesma realidade (círculos concêntricos)
--   C · Movimento — transformar: passagem de estados (3 estados + conectores)
--   D · Mapa      — integrar: várias partes ao mesmo tempo (hexágono 6 dimensões)
--
-- PRINCÍPIO: o visual não decora o pensamento; torna visível uma estrutura
-- necessária pra compreendê-lo. "Silêncio visual. Clareza que ensina."
--
-- CONTEÚDO ESTRUTURAL = CANÔNICO da metodologia Bee (as 4 camadas, os 3
-- movimentos, as 6 Dimensões Sistêmicas) — semeado como DADO curável no
-- layer_stack.source.data. Nada inferido/inventado. Só o A extrai os 2 polos
-- do próprio texto (motor). Herda tokens/fonte/espiral globais. Feed 1080x1350.
-- =====================================================================

-- 1) Dimensões do motor: união com as da M03 (curável, um row global).
UPDATE public.design_selection_config SET
  weights = '{
    "standalone_text_strength":1,"verbal_tension":1,"conceptual_density":1,"authorship":1,
    "visual_metaphor_value":1,"information_structure_value":1,"documentary_value":1,
    "atmosphere_value":1,"materiality_value":1,
    "human_presence_value":1,"relation_value":1,"field_value":1,"context_narrative_value":1,
    "diary_value":1,"temporal_origin_value":1,"handwritten_record_value":1,"intimacy_value":1,
    "visual_structure_need":1,"layer_value":1,"movement_value":1,"integration_value":1,
    "interdependence_value":1,"depth_value":1,"transition_value":1,"whole_view_value":1
  }'::jsonb
WHERE scope = 'global' AND ativo = TRUE;

-- 2) M03 — manifestação
UPDATE public.design_manifestacoes SET
  operacao = 'tornar visível uma estrutura necessária',
  funcao   = 'O visual não decora o pensamento: torna visível a estrutura que o explica',
  quando_usar = '["ensinar conceitos e relações","mostrar estruturas e dinâmicas sistêmicas","sintetizar modelos e frameworks","revelar níveis não evidentes","mostrar processos, transições ou transformações","tornar visível o que não é óbvio"]'::jsonb,
  quando_nao  = '["apenas para variar visualmente o feed","uma frase forte se sustenta melhor como M01","presença humana acrescenta mais significado (M02)","o diagrama apenas repete literalmente o texto","a ideia exige excesso de elementos","o resultado vira slide corporativo/dashboard/infográfico","a estrutura aumenta a complexidade em vez de reduzir"]'::jsonb,
  score_criteria = '{"grows_with":["visual_structure_need","relation_value","layer_value","movement_value","integration_value","conceptual_density"],"gate":"só selecionar se a estrutura visual acrescenta compreensão real","teste_final":"o que o leitor vê agora que o texto sozinho deixava menos claro?"}'::jsonb
WHERE id = 'M03';

-- 3) M03 A..D — receitas CONGELADAS (título + diagrama canônico curável)
INSERT INTO public.design_variacoes
  (id, manifestacao_id, nome, operacao, sensacao, quando_usar, quando_nao, limites, layer_stack, asset_requirements, selection_rule, status, version, ordem)
VALUES
  -- ===== M03-A · RELAÇÃO =====
  ('M03-A','M03','Relação','conectar',
   '["interdependência","reciprocidade","tensão","clareza","sistema"]'::jsonb,
   '["o significado está na relação entre os elementos","interdependência, influência mútua, reciprocidade","polaridade, tensão ou causalidade circular"]'::jsonb,
   '["fluxograma","setas em excesso","rede complexa","ícones genéricos"]'::jsonb,
   '{"chars_min":15,"chars_ideal_max":70,"chars_limit":110,"max_linhas":3,"destaque_permitido":true,"image_required":false}'::jsonb,
   '[
     {"role":"background","source":{"token":"creme"}},
     {"role":"headline","source":{"text":"visual_text","token_color":"azul_mp","font":"playfair"},"geometry":{"cx":50,"cy":24,"w":72,"align":"center"}},
     {"role":"diagram","source":{"kind":"relacao","data":{"poleA":"A","poleB":"B","support":"O que acontece em {A} impacta {B}. E o que acontece em {B} impacta {A}."}},"geometry":{"cx":50,"cy":52,"r":9}}
   ]'::jsonb,
   '{}'::jsonb,
   '{"conditions":"relation_value >= HIGH AND interdependence_value >= HIGH AND visual_structure_need >= HIGH"}'::jsonb,
   'frozen','v1.0', 1),

  -- ===== M03-B · CAMADAS =====
  ('M03-B','M03','Camadas','aprofundar',
   '["profundidade","estrutura","essência","revelação","sistema"]'::jsonb,
   '["revelar o que existe por baixo do aparente","níveis de uma mesma realidade","visível→padrões→estruturas→essência","sintoma→origem, explícito→implícito"]'::jsonb,
   '["pirâmide corporativa genérica","níveis arbitrários","excesso de legendas"]'::jsonb,
   '{"chars_min":15,"chars_ideal_max":70,"chars_limit":120,"max_linhas":3,"destaque_permitido":true,"image_required":false}'::jsonb,
   '[
     {"role":"background","source":{"token":"azul_mp"}},
     {"role":"headline","source":{"text":"visual_text","token_color":"creme","font":"playfair"},"geometry":{"cx":50,"cy":22,"w":74,"align":"center"}},
     {"role":"diagram","source":{"kind":"camadas","data":{"layers":[
        {"nome":"Visível","desc":"Comportamentos, resultados, eventos."},
        {"nome":"Padrões","desc":"Tendências, ciclos, relações recorrentes."},
        {"nome":"Estruturas","desc":"Regras, sistemas, crenças coletivas."},
        {"nome":"Essência","desc":"Propósito, valores, visão de mundo."}
     ]}},"geometry":{"cx":37,"cy":58,"r_outer":27}}
   ]'::jsonb,
   '{}'::jsonb,
   '{"conditions":"layer_value >= HIGH AND depth_value >= HIGH AND visual_structure_need >= HIGH"}'::jsonb,
   'frozen','v1.0', 2),

  -- ===== M03-C · MOVIMENTO =====
  ('M03-C','M03','Movimento','transformar',
   '["transformação","transição","processo","emergência","espiral"]'::jsonb,
   '["o significado está na passagem de um estado para outro","transições, ciclos, deslocamentos","evolução, ruptura, emergência, de→para"]'::jsonb,
   '["timeline corporativa","setas decorativas","etapas inventadas"]'::jsonb,
   '{"chars_min":15,"chars_ideal_max":70,"chars_limit":110,"max_linhas":3,"destaque_permitido":true,"image_required":false}'::jsonb,
   '[
     {"role":"background","source":{"token":"creme"}},
     {"role":"headline","source":{"text":"visual_text","token_color":"azul_mp","font":"playfair"},"geometry":{"cx":50,"cy":23,"w":74,"align":"center"}},
     {"role":"diagram","source":{"kind":"movimento","data":{"states":[
        {"n":"1","nome":"Quebra","desc":"Algo deixa de fazer sentido.","cor":"neutro"},
        {"n":"2","nome":"Transição","desc":"O velho não serve mais. O novo ainda não está claro.","cor":"laranja"},
        {"n":"3","nome":"Integração","desc":"Novo sentido. Nova forma de agir.","cor":"azul"}
     ],"support":"Não é linear. É um espiral de aprendizagens."}},"geometry":{"cy":44,"r":7}}
   ]'::jsonb,
   '{}'::jsonb,
   '{"conditions":"movement_value >= HIGH AND transition_value >= HIGH AND visual_structure_need >= HIGH"}'::jsonb,
   'frozen','v1.0', 3),

  -- ===== M03-D · MAPA (6 Dimensões Sistêmicas da Bee) =====
  ('M03-D','M03','Mapa','integrar',
   '["integração","totalidade","visão de sistema","framework","coexistência"]'::jsonb,
   '["enxergar várias partes ao mesmo tempo pra compreender o todo","frameworks, arquiteturas, dimensões","ecossistemas, múltiplas forças simultâneas"]'::jsonb,
   '["infográfico","organograma","dashboard","muitas caixas","conectores sem função"]'::jsonb,
   '{"chars_min":10,"chars_ideal_max":55,"chars_limit":90,"max_linhas":2,"destaque_permitido":true,"image_required":false}'::jsonb,
   '[
     {"role":"background","source":{"token":"creme"}},
     {"role":"headline","source":{"text":"visual_text","token_color":"azul_mp","font":"playfair"},"geometry":{"cx":50,"cy":20,"w":74,"align":"center"}},
     {"role":"diagram","source":{"kind":"mapa","data":{"center":"espiral","nodes":[
        {"nome":"Essencialidade","desc":"Propósito e significado","angle":120},
        {"nome":"Integralidade","desc":"Relações e cooperação","angle":60},
        {"nome":"Totalidade","desc":"Visão de sistema e contexto","angle":0},
        {"nome":"Maturidade","desc":"Consciência e julgamento","angle":300},
        {"nome":"Potencialidade","desc":"Aprendizado e evolução","angle":240},
        {"nome":"Vivacidade","desc":"Energia e execução","angle":180}
     ]}},"geometry":{"cx":50,"cy":58,"r":24}}
   ]'::jsonb,
   '{}'::jsonb,
   '{"conditions":"integration_value >= HIGH AND whole_view_value >= HIGH AND multiple_dimensions = TRUE AND visual_structure_need >= HIGH"}'::jsonb,
   'frozen','v1.0', 4)
ON CONFLICT (id) DO UPDATE SET
  nome = EXCLUDED.nome, operacao = EXCLUDED.operacao, sensacao = EXCLUDED.sensacao,
  quando_usar = EXCLUDED.quando_usar, quando_nao = EXCLUDED.quando_nao,
  limites = EXCLUDED.limites, layer_stack = EXCLUDED.layer_stack,
  asset_requirements = EXCLUDED.asset_requirements, selection_rule = EXCLUDED.selection_rule,
  status = EXCLUDED.status, version = EXCLUDED.version, ordem = EXCLUDED.ordem;
