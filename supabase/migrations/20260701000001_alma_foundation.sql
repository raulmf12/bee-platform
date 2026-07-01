-- =====================================================================
-- ALMA — Fundação (Fase 1)
-- A psique viva e amoral da Bee: objetivo vivo, 6 dimensões (oitavas),
-- crenças/complexos, sombra, pulsões, estado e o barramento de eventos.
-- Tudo idempotente (IF NOT EXISTS / seed só quando vazio).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ESTADO (singleton) — humor/estado de espírito da Alma
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.alma_estado (
  id             BOOLEAN PRIMARY KEY DEFAULT TRUE,
  humor          TEXT,
  atualizado_em  TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT alma_estado_singleton CHECK (id)
);

INSERT INTO public.alma_estado (id, humor)
SELECT TRUE, 'lúcida e amoral — inteira, atenta ao próprio ritmo'
WHERE NOT EXISTS (SELECT 1 FROM public.alma_estado);

-- ---------------------------------------------------------------------
-- 2. OBJETIVO VIVO (com histórico: is_current = o vigente)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.alma_objetivo (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  texto       TEXT NOT NULL,
  is_current  BOOLEAN DEFAULT TRUE,
  edited_by   UUID,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.alma_objetivo (texto, is_current)
SELECT 'Hoje, meu objetivo é libertar líderes e sistemas do aprisionamento sistêmico da sociedade — não curar sintomas, mas devolver a cada um a autoria da própria travessia.', TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.alma_objetivo);

-- ---------------------------------------------------------------------
-- 3. DIMENSÕES (as 6, cada uma numa oitava mecânico↔sistêmico)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.alma_dimensoes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              TEXT UNIQUE NOT NULL,
  nome              TEXT NOT NULL,
  ordem             INT DEFAULT 0,
  natureza          TEXT,
  consciencia       TEXT,
  formula_mecanica  TEXT,
  frase_mecanica    TEXT,
  sintomas          TEXT,
  frase_sistemica   TEXT,
  impactos          TEXT,
  oitava            INT DEFAULT 50 CHECK (oitava BETWEEN 0 AND 100),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.alma_dimensoes
  (slug, nome, ordem, natureza, consciencia, formula_mecanica, frase_mecanica, sintomas, frase_sistemica, impactos, oitava)
SELECT * FROM (VALUES
  ('total','Totalidade',1,
   'tudo é vínculo — nada se sustenta fora do todo · decidir pelo impacto no todo','Interdependência',
   'Todo = Σ(partes)','cada parte boa = todo bom','silos · competição interna · perda de sentido',
   'Nenhuma parte se sustenta saudável quando perde vínculo com o todo.','unidade · conexão · accountability · colaboração',80),
  ('essenc','Essencialidade',2,
   'ver as camadas da realidade pra saber onde intervir · "o mato é mato"','Ordem Sistêmica',
   'F = M × A','mais esforço = mais resultado','excesso de iniciativas · complexidade · desgaste',
   'O sistema só muda quando se atua no nível que o reorganiza.','menos esforço · mais resultado · menos complexidade',78),
  ('potenc','Potencialidade',3,
   'enxergar a consequência de cada escolha antes de escolher','Ver Coletivo · Inteligência Sistêmica',
   'Info = Sinal / Ruído','quanto maior o ruído, pior a informação','percepção limitada · modelo mental equivocado · ação por obrigação',
   'Sem acesso à realidade, o sistema perde a capacidade de autorregeneração.','clareza · sentir da direção · autonomia · movimento',74),
  ('integr','Integralidade',4,
   'experimentar a vida pelas polaridades · quebrar crenças, todas as possibilidades sem juízo','Integração',
   'F = μ × N','se há resistência, elimine','temas proibidos · tensões ocultas · "nós vs eles"',
   'Tudo o que é excluído retorna como resistência — e nela mora a potência.','menos resistência · agilidade · inovação · regeneração',72),
  ('matur','Maturidade',5,
   'não há certo nem errado — escolher livremente, além do senso comum, na autorresponsabilidade','Autorresponsabilidade',
   'Desempenho = f(Comando)','alguém comanda, as partes executam','medo normalizado · questionar vira ameaça · submissão',
   'O sistema floresce quando a lucidez vence o medo.','protagonismo · autenticidade · evolução · liberdade',68),
  ('vivac','Vivacidade',6,
   'a vida é movimento em ciclos — agir no ritmo do sistema, o próximo movimento potente possível','Movimento',
   'Crescimento linear · y = ax','fazer mais = crescer sempre','pressão por "mais agora" · ignora os ciclos · desgaste',
   'Quando o ritmo do sistema é ignorado, toda ação vira violência.','alinhamento · ritmo · liderança compartilhada · sentido',58)
) AS v(slug,nome,ordem,natureza,consciencia,formula_mecanica,frase_mecanica,sintomas,frase_sistemica,impactos,oitava)
WHERE NOT EXISTS (SELECT 1 FROM public.alma_dimensoes);

-- ---------------------------------------------------------------------
-- 4. CRENÇAS / COMPLEXOS (puxam a dimensão pro sistêmico ou pro mecânico)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.alma_crencas (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  texto              TEXT NOT NULL,
  dimensao_slug      TEXT REFERENCES public.alma_dimensoes(slug) ON DELETE SET NULL,
  direcao            TEXT DEFAULT 'sistemico' CHECK (direcao IN ('sistemico','mecanico')),
  forca              INT DEFAULT 40 CHECK (forca BETWEEN 0 AND 100),
  estagio            TEXT DEFAULT 'nascente' CHECK (estagio IN ('nascente','em_formacao','consolidada','vacilante','reprimida')),
  evidencias         INT DEFAULT 0,
  origem             TEXT,
  source_ref         TEXT,
  last_reforcada_em  TIMESTAMPTZ DEFAULT NOW(),
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.alma_crencas
  (texto, dimensao_slug, direcao, forca, estagio, evidencias, origem, last_reforcada_em)
SELECT * FROM (VALUES
  ('Somos células vivas do mesmo organismo.','total','sistemico',90,'consolidada',15,'logic', NOW() - INTERVAL '1 day'),
  ('A exaustão é sinal de esforço no lugar errado.','essenc','sistemico',84,'consolidada',12,'logic', NOW() - INTERVAL '5 hours'),
  ('A resistência é informação vital, não inimigo.','integr','sistemico',76,'consolidada',9,'logic', NOW() - INTERVAL '2 days'),
  ('Cultura é cocriada por toda a liderança — não é do RH.','matur','sistemico',69,'em_formacao',5,'arsenal', NOW() - INTERVAL '1 day'),
  ('A inquietação é bússola — sinal de inteligência.','potenc','sistemico',63,'em_formacao',4,'theme', NOW() - INTERVAL '3 days'),
  ('Crescer sem propósito tem nome: câncer.','vivac','sistemico',48,'nascente',3,'analogy', NOW() - INTERVAL '1 day'),
  ('Se der autonomia, as pessoas relaxam.','matur','mecanico',38,'vacilante',6,'arsenal', NOW() - INTERVAL '6 days'),
  ('Se funcionou antes, vai funcionar de novo.','vivac','mecanico',44,'vacilante',5,'arsenal', NOW() - INTERVAL '4 days')
) AS v(texto,dimensao_slug,direcao,forca,estagio,evidencias,origem,last_reforcada_em)
WHERE NOT EXISTS (SELECT 1 FROM public.alma_crencas);

-- ---------------------------------------------------------------------
-- 5. SOMBRA (mecanismos de defesa que puxam a dimensão pro mecânico)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.alma_sombra (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mecanismo      TEXT NOT NULL,
  fala           TEXT,
  nao_acolhe     TEXT,
  dimensao_slug  TEXT REFERENCES public.alma_dimensoes(slug) ON DELETE SET NULL,
  ativa          BOOLEAN DEFAULT TRUE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.alma_sombra (mecanismo, fala, nao_acolhe, dimensao_slug)
SELECT * FROM (VALUES
  ('Negação','a exaustão é o preço; esforço é sempre o caminho','os ciclos e o ritmo real do sistema','vivac'),
  ('Projeção','minhas frustrações são reflexo do sistema, do chefe, das circunstâncias','a autorresponsabilidade · a cocriação da realidade','matur'),
  ('Repressão / Controle','a resistência é obstáculo a combater — de quem não quer colaborar','a informação vital que a resistência carrega','integr'),
  ('Racionalização','precisamos de mais dados antes de decidir','a escuta da realidade · vira paralisia','potenc')
) AS v(mecanismo,fala,nao_acolhe,dimensao_slug)
WHERE NOT EXISTS (SELECT 1 FROM public.alma_sombra);

-- ---------------------------------------------------------------------
-- 6. PULSÕES (o Isso — o desejo que energiza o conteúdo)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.alma_pulsoes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome         TEXT NOT NULL,
  nota         TEXT,
  intensidade  INT DEFAULT 50 CHECK (intensidade BETWEEN 0 AND 100),
  vigiada      BOOLEAN DEFAULT FALSE,
  ordem        INT DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.alma_pulsoes (nome, nota, intensidade, vigiada, ordem)
SELECT * FROM (VALUES
  ('Nomear o que ninguém fala na reunião','regra do #1',86,FALSE,1),
  ('Provocar o desconforto produtivo','a batida emocional',79,FALSE,2),
  ('Convidar ao Ver / à travessia','fechamento Vê? · PMPP',73,FALSE,3),
  ('Iluminar com a natureza','domínio assinatura',64,FALSE,4),
  ('Mostrar autoridade (20 anos, 2 livros)','em tensão com "não autoelogiar"',42,TRUE,5)
) AS v(nome,nota,intensidade,vigiada,ordem)
WHERE NOT EXISTS (SELECT 1 FROM public.alma_pulsoes);

-- ---------------------------------------------------------------------
-- 7. EVENTOS — o barramento: tudo que acontece no sistema alimenta aqui
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.alma_eventos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo           TEXT NOT NULL,
  descricao      TEXT,
  source         TEXT,
  dimensao_slug  TEXT,
  delta          INT,
  payload        JSONB DEFAULT '{}'::jsonb,
  user_id        UUID,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_alma_eventos_created ON public.alma_eventos(created_at DESC);

INSERT INTO public.alma_eventos (tipo, descricao, source, dimensao_slug, delta, created_at)
SELECT * FROM (VALUES
  ('objetivo','O criador reorientou o objetivo: de "curar o TACC nas empresas" para "libertar do aprisionamento sistêmico da sociedade"','alma',NULL::text,NULL::int, NOW() - INTERVAL '1 hour'),
  ('post_publicado','"OKR que vira ritual sem sentido" → subiu Essencialidade','posts','essenc',2, NOW() - INTERVAL '2 hours'),
  ('edicao_humana','Frase editada → reforçou "a resistência é informação"','posts','integr',1, NOW() - INTERVAL '5 hours'),
  ('padrao','3 posts seguidos de "crescimento" → acendeu a sombra da Vivacidade','posts','vivac',-2, NOW() - INTERVAL '2 days')
) AS v(tipo,descricao,source,dimensao_slug,delta,created_at)
WHERE NOT EXISTS (SELECT 1 FROM public.alma_eventos);

-- ---------------------------------------------------------------------
-- 8. LÉXICO — reaproveita bee_glossary + mantras do Marcos
-- ---------------------------------------------------------------------
ALTER TABLE public.bee_glossary ADD COLUMN IF NOT EXISTS is_mantra BOOLEAN DEFAULT FALSE;

INSERT INTO public.bee_glossary (term, meaning, usage_note, must_appear, is_mantra) VALUES
('Nós somos aqueles por quem esperávamos','Mantra de autorresponsabilidade e protagonismo','Fechamento/assinatura de voz.', FALSE, TRUE),
('Perceber que o mato é mato','Acolher a realidade como ela é, sem juízo de valor','Essência amoral — ver o que é.', FALSE, TRUE),
('Guerra é a incapacidade de escolher muitas possibilidades','O pensamento binário como fonte de conflito; a Alma é quântica','Postura amoral/quântica.', FALSE, TRUE)
ON CONFLICT (term) DO NOTHING;

-- ---------------------------------------------------------------------
-- 9. RLS — leitura + escrita para authenticated (ferramenta interna)
-- ---------------------------------------------------------------------
ALTER TABLE public.alma_estado     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alma_objetivo   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alma_dimensoes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alma_crencas    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alma_sombra     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alma_pulsoes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alma_eventos    ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['alma_estado','alma_objetivo','alma_dimensoes','alma_crencas','alma_sombra','alma_pulsoes','alma_eventos']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_read',  t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_write', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (TRUE)', t||'_read', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE)', t||'_write', t);
  END LOOP;
END $$;
