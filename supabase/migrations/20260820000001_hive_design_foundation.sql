-- =====================================================================
-- HIVE — SISTEMA VISUAL (Instagram) · FUNDAÇÃO (Fase 1)
-- =====================================================================
-- As 4 bibliotecas curáveis + máquina de estados + taxonomia M01..M08 +
-- as receitas do M01 (A..E) em rascunho.
--
-- IMPORTANTE: nada de valor OFICIAL inferido. Tokens (HEX, fonte, geometria)
-- e a geometria das camadas ficam VAZIOS e sinalizados (is_official=false /
-- geometry=null), aguardando os arquivos oficiais + medição dos templates
-- Canva aprovados (spec M01, secoes 19 e 27). O que é semeado aqui vem
-- direto da especificacao do usuario (taxonomia + regras qualitativas), nao
-- é inferido.
--
-- Tudo data-driven: pesos, limiares, penalidade de diversidade, regras de
-- variante e semantica dos assets sao DADOS, nunca hard-coded no codigo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. design_tokens — o "CSS visual da Bee" (fonte de verdade = oficial)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.design_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        TEXT NOT NULL CHECK (kind IN ('color','font','symbol','geometry','treatment')),
  slug        TEXT NOT NULL UNIQUE,
  label       TEXT,
  value       JSONB NOT NULL DEFAULT '{}'::jsonb,   -- {hex} / {family,weight,file_asset_id} / {ratios...}
  is_official BOOLEAN DEFAULT FALSE,                -- true so quando veio do arquivo oficial (nao inferido)
  notes       TEXT,
  ordem       INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- 2. design_assets — biblioteca de ativos (espiral, fundos, texturas, fotos)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.design_assets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         TEXT NOT NULL CHECK (kind IN ('spiral','background','texture','photo','signature','logo','graphic','generated')),
  title        TEXT NOT NULL,
  storage_path TEXT,                               -- path no bucket 'design'
  url          TEXT,                               -- public url (conveniencia)
  mime_type    TEXT,
  width        INT,
  height       INT,
  origin       TEXT NOT NULL DEFAULT 'official' CHECK (origin IN ('official','real','real_adapted','generated')),
  -- Metadados que deixam a Hive ESCOLHER (nao sortear): natureza, profundidade,
  -- humano, campo, silencio, espaco_texto (esquerda/centro), claro_escuro, etc.
  semantic     JSONB NOT NULL DEFAULT '{}'::jsonb,
  tags         TEXT[] DEFAULT '{}',
  is_active    BOOLEAN DEFAULT TRUE,
  usage_count  INT DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_design_assets_kind     ON public.design_assets(kind) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_design_assets_semantic ON public.design_assets USING gin (semantic);
CREATE INDEX IF NOT EXISTS idx_design_assets_tags     ON public.design_assets USING gin (tags);

-- ---------------------------------------------------------------------
-- 3. design_manifestacoes — M01..M08 (os modos visuais)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.design_manifestacoes (
  id             TEXT PRIMARY KEY,                 -- 'M01'
  nome           TEXT NOT NULL,                    -- 'Frase Essencial'
  operacao       TEXT,                             -- 'silencio / maxima sintese'
  funcao         TEXT,
  quando_usar    JSONB DEFAULT '[]'::jsonb,
  quando_nao     JSONB DEFAULT '[]'::jsonb,
  score_criteria JSONB DEFAULT '{}'::jsonb,        -- quais dimensoes semanticas contam
  ativo          BOOLEAN DEFAULT TRUE,
  ordem          INT DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- 4. design_variacoes — as receitas (M01-A..E). Cada uma = um layout.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.design_variacoes (
  id                 TEXT PRIMARY KEY,             -- 'M01-A'
  manifestacao_id    TEXT NOT NULL REFERENCES public.design_manifestacoes(id) ON DELETE CASCADE,
  nome               TEXT NOT NULL,                -- 'Essencial'
  operacao           TEXT,                         -- 'IDEIA + ESPACO'
  sensacao           JSONB DEFAULT '[]'::jsonb,
  quando_usar        JSONB DEFAULT '[]'::jsonb,
  quando_nao         JSONB DEFAULT '[]'::jsonb,    -- "evitar"
  -- limites de conteudo/marca: chars, niveis tipograficos, destaque, se exige
  -- imagem, defaults de assinatura/espiral, etc.
  limites            JSONB DEFAULT '{}'::jsonb,
  -- pilha de camadas (secao 24): ordered [{role, required, source, geometry}].
  -- geometry (x,y,w,anchor em % do canvas) fica NULL ate a medicao do Canva.
  layer_stack        JSONB DEFAULT '[]'::jsonb,
  -- query semantica p/ escolher foto/textura na design_assets.
  asset_requirements JSONB DEFAULT '{}'::jsonb,
  -- pseudorregra de selecao (limiares por dimensao) — dado curavel.
  selection_rule     JSONB DEFAULT '{}'::jsonb,
  status             TEXT DEFAULT 'draft' CHECK (status IN ('draft','frozen','archived')),
  version            TEXT DEFAULT 'v1.0',
  ativo              BOOLEAN DEFAULT TRUE,
  ordem              INT DEFAULT 0,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_design_variacoes_manifestacao ON public.design_variacoes(manifestacao_id);

-- ---------------------------------------------------------------------
-- 5. design_selection_config — pesos, limiares e diversidade (curavel)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.design_selection_config (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope      TEXT NOT NULL DEFAULT 'global',
  weights    JSONB NOT NULL DEFAULT '{}'::jsonb,   -- peso por dimensao semantica
  thresholds JSONB NOT NULL DEFAULT '{}'::jsonb,   -- limiares (ex: rupture HIGH)
  diversity  JSONB NOT NULL DEFAULT '{}'::jsonb,   -- {window, penalty, tolerance}
  ativo      BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- 6. user_posts — maquina de estados (2 portoes) + explicabilidade
-- ---------------------------------------------------------------------
ALTER TABLE public.user_posts
  ADD COLUMN IF NOT EXISTS editorial_locked BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS text_approved    BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS image_status     TEXT DEFAULT 'pending' CHECK (image_status IN ('pending','approved','revision','rejected')),
  ADD COLUMN IF NOT EXISTS image_approved   BOOLEAN DEFAULT FALSE,
  -- objeto de decisao do motor visual (modo/variante/scores/assets/reasons).
  ADD COLUMN IF NOT EXISTS visual_decision  JSONB;

-- ---------------------------------------------------------------------
-- 7. Bucket de storage 'design' (leitura publica p/ render client-side)
-- ---------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('design', 'design', TRUE)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "design_obj_read"   ON storage.objects;
DROP POLICY IF EXISTS "design_obj_write"  ON storage.objects;
DROP POLICY IF EXISTS "design_obj_update" ON storage.objects;
DROP POLICY IF EXISTS "design_obj_delete" ON storage.objects;
CREATE POLICY "design_obj_read"   ON storage.objects FOR SELECT USING (bucket_id = 'design');
CREATE POLICY "design_obj_write"  ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'design');
CREATE POLICY "design_obj_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'design');
CREATE POLICY "design_obj_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'design');

-- ---------------------------------------------------------------------
-- 8. RLS — leitura p/ authenticated; escrita p/ authenticated (curadoria)
--    (service role sempre bypassa). Mesmo padrao das tabelas bee_*.
-- ---------------------------------------------------------------------
ALTER TABLE public.design_tokens           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_assets           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_manifestacoes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_variacoes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_selection_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "design_tokens_all"        ON public.design_tokens;
DROP POLICY IF EXISTS "design_assets_all"        ON public.design_assets;
DROP POLICY IF EXISTS "design_manifestacoes_all" ON public.design_manifestacoes;
DROP POLICY IF EXISTS "design_variacoes_all"     ON public.design_variacoes;
DROP POLICY IF EXISTS "design_selection_all"     ON public.design_selection_config;
CREATE POLICY "design_tokens_all"        ON public.design_tokens           FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "design_assets_all"        ON public.design_assets           FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "design_manifestacoes_all" ON public.design_manifestacoes    FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "design_variacoes_all"     ON public.design_variacoes        FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "design_selection_all"     ON public.design_selection_config FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- ---------------------------------------------------------------------
-- 9. Triggers updated_at
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_design_tokens_updated        ON public.design_tokens;
DROP TRIGGER IF EXISTS trg_design_assets_updated        ON public.design_assets;
DROP TRIGGER IF EXISTS trg_design_manifestacoes_updated ON public.design_manifestacoes;
DROP TRIGGER IF EXISTS trg_design_variacoes_updated     ON public.design_variacoes;
DROP TRIGGER IF EXISTS trg_design_selection_updated     ON public.design_selection_config;
CREATE TRIGGER trg_design_tokens_updated        BEFORE UPDATE ON public.design_tokens           FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_design_assets_updated        BEFORE UPDATE ON public.design_assets           FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_design_manifestacoes_updated BEFORE UPDATE ON public.design_manifestacoes    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_design_variacoes_updated     BEFORE UPDATE ON public.design_variacoes        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_design_selection_updated     BEFORE UPDATE ON public.design_selection_config FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =====================================================================
-- SEED (estrutural, vindo da spec — NAO sao valores oficiais inferidos)
-- =====================================================================

-- 9.1 Tokens: apenas os SLOTS (slugs), com value vazio e is_official=false.
--     Aguardam os arquivos oficiais (HEX, fonte, medicao Canva).
INSERT INTO public.design_tokens (kind, slug, label, value, is_official, notes, ordem) VALUES
  ('color',    'azul_mp',        'Azul MP (profundo)',     '{}'::jsonb, FALSE, 'Aguardando HEX oficial', 1),
  ('color',    'creme',          'Creme',                  '{}'::jsonb, FALSE, 'Aguardando HEX oficial', 2),
  ('color',    'laranja',        'Laranja Bee',            '{}'::jsonb, FALSE, 'Aguardando HEX oficial', 3),
  ('color',    'branco',         'Branco',                 '{}'::jsonb, FALSE, 'Aguardando HEX oficial', 4),
  ('color',    'neutro_texto',   'Neutro texto',           '{}'::jsonb, FALSE, 'Aguardando HEX oficial', 5),
  ('color',    'neutro_linha',   'Neutro linha/detalhe',   '{}'::jsonb, FALSE, 'Aguardando HEX oficial', 6),
  ('font',     'arbutus_slab',   'Arbutus Slab (principal)', '{"family":"Arbutus Slab","role":"primary"}'::jsonb, FALSE, 'Aguardando arquivo de fonte + licenca p/ embutir no render', 1),
  ('symbol',   'espiral_oficial','Espiral oficial',        '{"asset_id":null}'::jsonb, FALSE, 'Aguardando SVG/PNG oficial (design_assets.kind=spiral)', 1),
  ('geometry', 'safe_area',      'Safe area',              '{}'::jsonb, FALSE, 'Aguardando medicao dos templates Canva aprovados (spec sec.27)', 1)
ON CONFLICT (slug) DO NOTHING;

-- 9.2 Config de selecao (esqueleto): dimensoes + diversidade. Pesos p/ tunar.
INSERT INTO public.design_selection_config (scope, weights, thresholds, diversity, ativo) VALUES
  ('global',
   '{"standalone_text_strength":1,"verbal_tension":1,"conceptual_density":1,"authorship":1,"human_presence_value":1,"visual_metaphor_value":1,"information_structure_value":1,"documentary_value":1,"atmosphere_value":1,"materiality_value":1}'::jsonb,
   '{"HIGH":0.66,"MED":0.4}'::jsonb,
   '{"window":3,"penalty_per_recent_use":0.05,"tolerance":0.05}'::jsonb,
   TRUE)
ON CONFLICT DO NOTHING;

-- 9.3 Manifestacoes M01..M08 (taxonomia da spec)
INSERT INTO public.design_manifestacoes (id, nome, operacao, funcao, ativo, ordem) VALUES
  ('M01','Frase Essencial','silencio / maxima sintese','Dar presenca visual a uma ideia que ja possui forca propria', TRUE, 1),
  ('M02','Rosto + Pensamento','autoria / presenca humana','Marcos e parte da mensagem: foto real + frase curta', TRUE, 2),
  ('M03','Historia Visual (Carrossel)','tensao -> virada','Carrossel que cria tensao e revela progressivamente', TRUE, 3),
  ('M04','Provocacao Visual','contraste que incomoda','Poucas palavras, composicao disruptiva (crenca, contradicao, pergunta)', TRUE, 4),
  ('M05','Ideia Visual (Conceito)','metafora visual','Uma metafora visual representa o conceito', TRUE, 5),
  ('M06','Mapa / Sistema','diagrama','Diagrama simples torna uma ideia visivel', TRUE, 6),
  ('M07','Campo / Contemplacao','atmosfera','Imagem contemplativa + espiral integrada a composicao', TRUE, 7),
  ('M08','Vida Real / Bastidor','documental','Fotografia documental, pouco tratada', TRUE, 8)
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, operacao = EXCLUDED.operacao, funcao = EXCLUDED.funcao;

-- 9.4 M01 — quando usar / quando nao / criterios de score (spec sec.6,7,8)
UPDATE public.design_manifestacoes SET
  quando_usar = '["frase com alta autonomia","pensamento completo","sintese forte","formulacao memoravel","tensao verbal","paradoxo","tese","deslocamento de percepcao","pergunta poderosa","afirmacao autoral","baixa dependencia de contexto visual"]'::jsonb,
  quando_nao  = '["presenca humana acrescenta significado (ver M02)","narrativa e dominante (modos narrativos)","contradicao precisa ser materializada (ver M04)","metafora visual amplia o pensamento (ver M05)","peca precisa organizar informacao (ver M06)","atmosfera importa mais que a frase (ver M07)","um acontecimento real e a mensagem (ver M08)"]'::jsonb,
  score_criteria = '{"grows_with":["standalone_text_strength","verbal_tension","conceptual_density"],"shrinks_with":["human_presence_value","visual_metaphor_value","information_structure_value","documentary_value"]}'::jsonb
WHERE id = 'M01';

-- 9.5 M01 A..E — receitas em RASCUNHO. Regras qualitativas da spec (sec.11-24).
--     geometry/token values ficam NULL/placeholder ate a medicao do Canva.
INSERT INTO public.design_variacoes
  (id, manifestacao_id, nome, operacao, sensacao, quando_usar, quando_nao, limites, layer_stack, asset_requirements, selection_rule, status, ordem)
VALUES
  ('M01-A','M01','Essencial','IDEIA + ESPACO',
   '["silencio","inteligencia","clareza","precisao","confianca"]'::jsonb,
   '["frase forte, clara, precisa, autoral","nao precisa de atmosfera nem imagem","nao depende de contraste dramatico"]'::jsonb,
   '["fotografia gratuita","textura gratuita","decoracao","excesso de simbolos","molduras sem funcao"]'::jsonb,
   '{"chars_min":45,"chars_ideal_max":110,"chars_limit":150,"max_niveis":2,"destaque_max":1,"image_required":false,"signature_default":false,"spiral_default":"optional","destaque_permitido":false}'::jsonb,
   '[{"role":"background","required":true,"source":{"token":"creme_ou_branco"},"geometry":null},{"role":"headline","required":true,"source":{"text":"visual_text","token_color":"azul_mp","font":"arbutus_slab"},"geometry":null},{"role":"bee_spiral_official","required":false,"source":{"asset":"espiral_oficial"},"geometry":null}]'::jsonb,
   '{}'::jsonb,
   '{"default":true,"conditions":"rupture < HIGH AND authorship < HIGH AND atmosphere_value < HIGH AND materiality_value < HIGH"}'::jsonb,
   'draft', 1),

  ('M01-B','M01','Tensao','IDEIA + RUPTURA',
   '["interrupcao","energia","tensao","coragem","deslocamento"]'::jsonb,
   '["paradoxo","oposicao","negacao","contraste","inversao","mudanca brusca de perspectiva","estruturas nao X -> Y / quanto mais X -> menos Y / parece X -> e Y"]'::jsonb,
   '["estetica de coach","clickbait","publicidade agressiva","thumbnail","caixa alta excessiva","excesso de contraste"]'::jsonb,
   '{"chars_min":45,"chars_ideal_max":110,"chars_limit":150,"max_niveis":2,"image_required":false,"signature_default":false,"spiral_default":"optional","destaque_permitido":true,"destaque_palavras_min":1,"destaque_palavras_max":5,"destaque_regra":"marca o ponto de virada semantico"}'::jsonb,
   '[{"role":"background","required":true,"source":{"token":"azul_mp"},"geometry":null},{"role":"headline","required":true,"source":{"text":"visual_text","token_color":"creme","font":"arbutus_slab"},"geometry":null},{"role":"semantic_highlight","required":false,"source":{"token_color":"laranja"},"geometry":null},{"role":"structural_graphic","required":false,"source":{"kind":"linha","token_color":"laranja"},"geometry":null},{"role":"bee_spiral_official","required":false,"source":{"asset":"espiral_oficial"},"geometry":null}]'::jsonb,
   '{}'::jsonb,
   '{"conditions":"paradox = TRUE OR conceptual_opposition >= HIGH OR rupture_strength >= HIGH"}'::jsonb,
   'draft', 2),

  ('M01-C','M01','Editorial','IDEIA + AUTORIA',
   '["pensamento","permanencia","repertorio","autoria","densidade"]'::jsonb,
   '["densidade conceitual","carater de tese","formulacao proprietaria","sensacao de trecho de livro","carater ensaistico","forte autoria"]'::jsonb,
   '["aparencia academica","powerpoint","relatorio corporativo","excesso de metadados"]'::jsonb,
   '{"chars_min":45,"chars_ideal_max":110,"chars_limit":150,"max_niveis":2,"image_required":false,"signature_default":true,"spiral_default":"optional","destaque_permitido":true}'::jsonb,
   '[{"role":"background","required":true,"source":{"token":"creme"},"geometry":null},{"role":"structural_graphic","required":false,"source":{"kind":"moldura_marcador","token_color":"azul_mp"},"geometry":null},{"role":"headline","required":true,"source":{"text":"visual_text","token_color":"azul_mp","font":"arbutus_slab"},"geometry":null},{"role":"semantic_highlight","required":false,"source":{"token_color":"laranja"},"geometry":null},{"role":"bee_spiral_official","required":false,"source":{"asset":"espiral_oficial"},"geometry":null},{"role":"author_signature","required":true,"source":{"text":"MARCOS PICCINI"},"geometry":null}]'::jsonb,
   '{}'::jsonb,
   '{"conditions":"conceptual_density >= HIGH AND authorship >= HIGH AND rupture_strength < HIGH"}'::jsonb,
   'draft', 3),

  ('M01-D','M01','Campo','IDEIA + ESPACO (atmosfera)',
   '["contemplacao","profundidade","horizonte","amplitude","silencio"]'::jsonb,
   '["horizonte","amplitude","perspectiva","caminho","passagem","silencio","natureza","arquitetura","tempo","futuro","desconhecido","consciencia","transformacao"]'::jsonb,
   '["imagem que ilustra literalmente o substantivo da frase","banco de imagem corporativo","pessoa sorrindo olhando p/ camera"]'::jsonb,
   '{"chars_min":45,"chars_ideal_max":90,"chars_limit":150,"max_niveis":2,"image_required":true,"signature_default":false,"spiral_default":"optional","destaque_permitido":true,"asset_priority":["real","real_adapted","generated"]}'::jsonb,
   '[{"role":"photo","required":true,"source":{"asset_query":"ref:asset_requirements.photo"},"geometry":null},{"role":"readability_overlay","required":false,"source":{"token":"azul_mp","condition":"apenas se necessario a legibilidade"},"geometry":null},{"role":"headline","required":true,"source":{"text":"visual_text","token_color":"creme","font":"arbutus_slab"},"geometry":null},{"role":"semantic_highlight","required":false,"source":{"token_color":"laranja"},"geometry":null},{"role":"bee_spiral_official","required":false,"source":{"asset":"espiral_oficial"},"geometry":null}]'::jsonb,
   '{"photo":{"kind":"photo","must_have":["espaco_texto"],"prefer":["natureza","profundidade","silencio","contemplacao"],"avoid":["pessoa_sorrindo_camera","banco_imagem_corporativo","ilustracao_literal"],"match":"equivalencia de sensacao, nao literal"}}'::jsonb,
   '{"conditions":"atmosphere_value >= HIGH AND contemplation >= HIGH AND human_presence_value < HIGH"}'::jsonb,
   'draft', 4),

  ('M01-E','M01','Materia','IDEIA + MATERIALIDADE',
   '["materia","humanidade","tempo","textura","profundidade","imperfeicao"]'::jsonb,
   '["camadas","tempo","construcao","desconstrucao","maturidade","integracao","imperfeicao","origem","organicidade","transformacao gradual"]'::jsonb,
   '["scrapbook","estetica artesanal fofa","wellness generico","espiritualidade generica","excesso de textura","textura vintage/grunge/papel envelhecido"]'::jsonb,
   '{"chars_min":45,"chars_ideal_max":110,"chars_limit":150,"max_niveis":2,"image_required":false,"signature_default":false,"spiral_default":"optional","destaque_permitido":true,"textura_presenca_pct":[5,15]}'::jsonb,
   '[{"role":"background","required":true,"source":{"token":"creme"},"geometry":null},{"role":"texture","required":false,"source":{"asset_query":"ref:asset_requirements.texture"},"geometry":null},{"role":"headline","required":true,"source":{"text":"visual_text","token_color":"azul_mp","font":"arbutus_slab"},"geometry":null},{"role":"semantic_highlight","required":false,"source":{"token_color":"laranja"},"geometry":null},{"role":"structural_graphic","required":false,"source":{"kind":"linha","token_color":"laranja"},"geometry":null},{"role":"bee_spiral_official","required":false,"source":{"asset":"espiral_oficial"},"geometry":null}]'::jsonb,
   '{"texture":{"kind":"texture","prefer":["papel","fibra","mineral","superficie","sombra_natural"],"presence_pct":[5,15],"rule":"materialidade deve carregar significado"}}'::jsonb,
   '{"conditions":"materiality_value >= HIGH OR organic_process >= HIGH OR layers_are_semantic = TRUE"}'::jsonb,
   'draft', 5)
ON CONFLICT (id) DO NOTHING;
