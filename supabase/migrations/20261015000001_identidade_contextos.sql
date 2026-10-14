-- Fase 1 · Identidade e contextos (docs: Hive_Identidade_Contextos_Setup_e_Evolucao_v1 §4/§11,
-- Guia de implementação §5/§7). Fundação SEM mudar telas:
--   workspace → marca (Genesis) → emissor (quem fala) → frente (Consulting/Academy)
--   → público → PERFIL DE COMUNICAÇÃO (versionado) → snapshot de contexto em cada criação.
-- Tudo aditivo; dados atuais da Bee ficam associados à marca Bee (IDs preservados).
BEGIN;

-- ---------------------------------------------------------------------------
-- Workspace e marca
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.workspace_members (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'editor' CHECK (role IN ('owner', 'editor', 'viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);
CREATE TABLE IF NOT EXISTS public.brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  essence text,                                   -- natureza da contribuição (ex.: tecnologia de transformação)
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'archived')),
  is_default boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, slug)
);

-- Quem fala: pessoa (autoral) ou voz institucional. Fatos de autoridade só confirmados.
CREATE TABLE IF NOT EXISTS public.emitters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('person', 'institutional')),
  name text NOT NULL,
  voice text,                                     -- como escreve (complementa o Genesis)
  authority text,                                 -- de onde vem a autoridade (fatos confirmados)
  first_person boolean NOT NULL DEFAULT true,     -- pode falar em 1ª pessoa do singular?
  speaking_rules text,                            -- limites do lugar de fala
  photo_profile text,                             -- perfil fotográfico (ex.: 'marcos'); null = sem foto de pessoa
  facts_status text NOT NULL DEFAULT 'to_confirm' CHECK (facts_status IN ('confirmed', 'to_confirm')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Frente de atuação: linha duradoura (não é canal nem campanha).
CREATE TABLE IF NOT EXISTS public.business_fronts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  territories text[] NOT NULL DEFAULT '{}',
  offer_ids uuid[] NOT NULL DEFAULT '{}',        -- ofertas pertinentes (bee_products)
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, slug)
);

-- Público: pessoas/papéis/situações. NÃO é o estado do interlocutor (lente opcional à parte).
CREATE TABLE IF NOT EXISTS public.audiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  front_id uuid REFERENCES public.business_fronts(id) ON DELETE SET NULL,
  name text NOT NULL,
  definition text,
  situations text[] NOT NULL DEFAULT '{}',
  needs text[] NOT NULL DEFAULT '{}',
  language_notes text,
  roles jsonb NOT NULL DEFAULT '{}'::jsonb,       -- B2B: usuário, influenciador, comprador
  status text NOT NULL DEFAULT 'hypothesis' CHECK (status IN ('hypothesis', 'draft', 'active', 'archived')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Perfil de comunicação: marca + emissor + frente + público prioritário (+ secundários)
-- + posicionamento + expressão + política de oferta. Versionado (profile_versions).
CREATE TABLE IF NOT EXISTS public.communication_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  emitter_id uuid NOT NULL REFERENCES public.emitters(id),
  front_id uuid NOT NULL REFERENCES public.business_fronts(id),
  primary_audience_id uuid REFERENCES public.audiences(id) ON DELETE SET NULL,
  secondary_audience_ids uuid[] NOT NULL DEFAULT '{}',
  name text NOT NULL,                             -- legível: "Bee Academy · Marcos · Líderes e transformadores"
  positioning text,
  expression text,                                -- diferenças de expressão deste perfil
  cta_policy text NOT NULL DEFAULT 'by_intent' CHECK (cta_policy IN ('by_intent', 'never', 'soft')),
  offer_ids uuid[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  version integer NOT NULL DEFAULT 1,
  is_default boolean NOT NULL DEFAULT false,
  needs_recalibration text,                       -- o que ainda falta decidir (visível na UI)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_profile_default_per_brand ON public.communication_profiles (brand_id) WHERE is_default;

CREATE TABLE IF NOT EXISTS public.communication_profile_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.communication_profiles(id) ON DELETE CASCADE,
  version integer NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reviewed', 'active', 'superseded')),
  data jsonb NOT NULL,                            -- perfil + emissor + frente + públicos resolvidos
  reason text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, version)
);

-- Snapshot do contexto usado numa criação (conteúdo-mãe/peça herdam; QA usa o mesmo).
CREATE TABLE IF NOT EXISTS public.context_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  profile_id uuid REFERENCES public.communication_profiles(id) ON DELETE SET NULL,
  profile_version integer,
  emitter_id uuid, front_id uuid, audience_ids uuid[] NOT NULL DEFAULT '{}',
  interlocutor_state text,                        -- lente opcional (identificado/incomodado/ambos)
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  fallback boolean NOT NULL DEFAULT false,        -- perfil não escolhido: usou o padrão (visível)
  summary text NOT NULL,                          -- "Quem fala · Frente · Público · Intenção"
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ctx_snapshots_user ON public.context_snapshots (user_id, created_at DESC);

-- Sessão do setup/recalibração (Fase 3 usa; nasce agora para o modelo ficar completo).
CREATE TABLE IF NOT EXISTS public.setup_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_id uuid REFERENCES public.brands(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('setup', 'review', 'add_front', 'recalibrate')),
  target_profile_ids uuid[] NOT NULL DEFAULT '{}',
  targets text[] NOT NULL DEFAULT '{}',
  base_versions jsonb NOT NULL DEFAULT '{}'::jsonb,
  answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  proposals jsonb NOT NULL DEFAULT '{}'::jsonb,
  step text NOT NULL DEFAULT 'overview',
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'ready_for_review', 'calibrating', 'done', 'archived')),
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Escopo de marca nas bases de identidade/metodologia (hoje tudo é Bee)
-- ---------------------------------------------------------------------------
INSERT INTO public.workspaces (id, name, slug) VALUES ('0b000000-0000-4000-8000-000000000001', 'Bee', 'bee') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.brands (id, workspace_id, name, slug, essence, is_default)
VALUES ('0b000000-0000-4000-8000-000000000002', '0b000000-0000-4000-8000-000000000001', 'Bee', 'bee',
        'Tecnologia de transformação (orientação atual do Marcos; revisar o posicionamento a partir disso).', true)
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['genesis_core','genesis_principios','genesis_lentes','genesis_tensoes','genesis_fluxo','genesis_avatares',
    'bee_editorials','bee_arsenal','bee_example_posts','bee_glossary','bee_style_rules','bee_headline_types','bee_analogies',
    'bee_hashtags','bee_directives','bee_products','knowledge_documents','design_assets','photo_references'] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL DEFAULT %L', t, '0b000000-0000-4000-8000-000000000002');
    EXECUTE format('UPDATE public.%I SET brand_id = %L WHERE brand_id IS NULL', t, '0b000000-0000-4000-8000-000000000002');
  END LOOP;
END $$;

-- Diretrizes e lições ganham escopo de frente/emissor/perfil (null = vale para a marca toda).
ALTER TABLE public.bee_directives
  ADD COLUMN IF NOT EXISTS front_id uuid REFERENCES public.business_fronts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS emitter_id uuid REFERENCES public.emitters(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES public.communication_profiles(id) ON DELETE SET NULL;
ALTER TABLE public.ai_learnings
  ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS front_id uuid REFERENCES public.business_fronts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS emitter_id uuid REFERENCES public.emitters(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES public.communication_profiles(id) ON DELETE SET NULL;
UPDATE public.ai_learnings SET brand_id = '0b000000-0000-4000-8000-000000000002' WHERE brand_id IS NULL;

-- Perfil e snapshot acompanham campanha → ideia → conteúdo-mãe → peça.
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES public.communication_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS profile_needs_review boolean NOT NULL DEFAULT false;
ALTER TABLE public.ideas ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES public.communication_profiles(id) ON DELETE SET NULL;
ALTER TABLE public.contents
  ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES public.communication_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS context_snapshot_id uuid REFERENCES public.context_snapshots(id) ON DELETE SET NULL;
ALTER TABLE public.user_posts
  ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES public.communication_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS context_snapshot_id uuid REFERENCES public.context_snapshots(id) ON DELETE SET NULL,
  -- Curadoria como REFERÊNCIA DE VOZ, independente do status de publicação (§7).
  ADD COLUMN IF NOT EXISTS reference_status text CHECK (reference_status IS NULL OR reference_status IN ('not_reviewed', 'current_voice', 'historical', 'excluded'));

-- Histórico importado é histórico: não vira referência de voz sem curadoria.
ALTER TABLE public.user_posts DISABLE TRIGGER trg_user_posts_updated;
UPDATE public.user_posts SET reference_status = 'historical'
 WHERE reference_status IS NULL AND metadata->>'imported_from' IN ('instagram', 'linkedin');
ALTER TABLE public.user_posts ENABLE TRIGGER trg_user_posts_updated;

-- Peça herda perfil e snapshot do conteúdo-mãe (como herda a ACJ).
CREATE OR REPLACE FUNCTION public.piece_inherit_context() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.content_id IS NOT NULL AND (NEW.context_snapshot_id IS NULL OR NEW.profile_id IS NULL) THEN
    SELECT COALESCE(NEW.profile_id, c.profile_id), COALESCE(NEW.context_snapshot_id, c.context_snapshot_id)
      INTO NEW.profile_id, NEW.context_snapshot_id
      FROM public.contents c WHERE c.id = NEW.content_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_posts_inherit_context ON public.user_posts;
CREATE TRIGGER trg_posts_inherit_context BEFORE INSERT OR UPDATE OF content_id, context_snapshot_id ON public.user_posts
  FOR EACH ROW EXECUTE FUNCTION public.piece_inherit_context();

-- Lições por escopo: frente/emissor/perfil null = vale para a marca toda.
DROP FUNCTION IF EXISTS public.ai_prompt_learnings(uuid, text, text, text, text[], integer);
CREATE OR REPLACE FUNCTION public.ai_prompt_learnings(
  p_user uuid, p_editorial text, p_platform text, p_avatar text, p_facets text[], p_limit integer DEFAULT 12,
  p_front uuid DEFAULT NULL, p_emitter uuid DEFAULT NULL, p_profile uuid DEFAULT NULL)
RETURNS TABLE(texto text, categoria text, facet text, evidencias integer, especificidade integer)
LANGUAGE sql STABLE SET search_path TO 'public' AS $function$
  select l.texto, l.categoria, l.facet, l.evidencias,
    ((l.editorial_slug is not null)::int + (l.platform is not null)::int + (l.target_avatar is not null)::int
      + (l.front_id is not null)::int + (l.emitter_id is not null)::int + (l.profile_id is not null)::int) as especificidade
  from public.ai_learnings l
  where l.user_id = p_user and l.ativo and l.facet = any(p_facets)
    and (l.editorial_slug is null or l.editorial_slug = p_editorial)
    and (l.platform is null or l.platform = p_platform)
    and (l.target_avatar is null or l.target_avatar = coalesce(p_avatar, 'ambos'))
    and (l.front_id is null or l.front_id = p_front)
    and (l.emitter_id is null or l.emitter_id = p_emitter)
    and (l.profile_id is null or l.profile_id = p_profile)
  order by especificidade desc, l.evidencias desc, l.last_reforcada_em desc
  limit p_limit;
$function$;
GRANT EXECUTE ON FUNCTION public.ai_prompt_learnings(uuid, text, text, text, text[], integer, uuid, uuid, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Acesso: membros do workspace (o isolamento completo entre clientes é a Fase 6)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_workspace_member(ws uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = ws AND m.user_id = auth.uid())
$$;
CREATE OR REPLACE FUNCTION public.is_brand_member(b uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.brands br JOIN public.workspace_members m ON m.workspace_id = br.workspace_id
                  WHERE br.id = b AND m.user_id = auth.uid())
$$;

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workspaces_member ON public.workspaces;
CREATE POLICY workspaces_member ON public.workspaces FOR SELECT TO authenticated USING (public.is_workspace_member(id));
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ws_members_self ON public.workspace_members;
CREATE POLICY ws_members_self ON public.workspace_members FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS brands_member ON public.brands;
CREATE POLICY brands_member ON public.brands TO authenticated USING (public.is_workspace_member(workspace_id)) WITH CHECK (public.is_workspace_member(workspace_id));
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['emitters','business_fronts','audiences','communication_profiles'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_brand ON public.%1$s', t);
    EXECUTE format('CREATE POLICY %1$s_brand ON public.%1$s TO authenticated USING (public.is_brand_member(brand_id)) WITH CHECK (public.is_brand_member(brand_id))', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_updated ON public.%1$s', t);
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated BEFORE UPDATE ON public.%1$s FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t);
  END LOOP;
END $$;
ALTER TABLE public.communication_profile_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS profile_versions_brand ON public.communication_profile_versions;
CREATE POLICY profile_versions_brand ON public.communication_profile_versions TO authenticated
  USING (EXISTS (SELECT 1 FROM public.communication_profiles p WHERE p.id = profile_id AND public.is_brand_member(p.brand_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.communication_profiles p WHERE p.id = profile_id AND public.is_brand_member(p.brand_id)));
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['context_snapshots','setup_sessions'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_all_own ON public.%1$s', t);
    EXECUTE format('CREATE POLICY %1$s_all_own ON public.%1$s TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)', t);
  END LOOP;
END $$;
DROP TRIGGER IF EXISTS trg_setup_sessions_updated ON public.setup_sessions;
CREATE TRIGGER trg_setup_sessions_updated BEFORE UPDATE ON public.setup_sessions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['workspaces','workspace_members','brands','emitters','business_fronts','audiences','communication_profiles',
    'communication_profile_versions','context_snapshots','setup_sessions'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Configuração inicial da Bee (Guia §5). Proposta revisável: Marcos recalibra na Fase 3.
-- ---------------------------------------------------------------------------
INSERT INTO public.workspace_members (workspace_id, user_id, role)
SELECT '0b000000-0000-4000-8000-000000000001', u.id, CASE WHEN u.id = 'dfa11979-83c5-4737-9601-56e4df05746a' THEN 'owner' ELSE 'editor' END
  FROM auth.users u ON CONFLICT DO NOTHING;

INSERT INTO public.emitters (id, brand_id, kind, name, voice, authority, first_person, speaking_rules, photo_profile, facts_status) VALUES
 ('0b000000-0000-4000-8000-000000000003', '0b000000-0000-4000-8000-000000000002', 'person', 'Marcos Piccini',
  (SELECT voz_como_escreve FROM public.genesis_core LIMIT 1),
  'Autoridade autoral sustentada por repertório e experiências confirmadas: 20 anos de cases reais e dois livros (herdado da configuração anterior — confirmar).',
  true, 'Fala em primeira pessoa; usa histórias e casos apenas quando confirmados. Não tem respostas prontas — tem perguntas que ninguém está fazendo.',
  'marcos', 'to_confirm'),
 ('0b000000-0000-4000-8000-000000000004', '0b000000-0000-4000-8000-000000000002', 'institutional', 'Bee Consulting',
  'Voz institucional: clara, sóbria, baseada em fatos, práticas e referências organizacionais confirmadas.',
  'Práticas, métodos e trabalhos da Bee com organizações (somente fatos confirmados).',
  false, 'Fala como "nós"/"a Bee". Não usa autobiografia do Marcos em primeira pessoa nem atribui a ele falas sem autoria apropriada.',
  NULL, 'to_confirm')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.business_fronts (id, brand_id, name, slug, description, territories, offer_ids) VALUES
 ('0b000000-0000-4000-8000-000000000005', '0b000000-0000-4000-8000-000000000002', 'Bee Academy', 'academy',
  'Formação e desenvolvimento de quem atua em transformação; líderes continuam como recorte importante dentro de uma definição mais ampla.',
  ARRAY['Experiência de quem transforma','Padrões que limitam a transformação','Percepção e prática','Histórias e aprendizagens de atuação'],
  ARRAY(SELECT id FROM public.bee_products WHERE slug IN ('masterclass-6d','fls','mc04'))),
 ('0b000000-0000-4000-8000-000000000006', '0b000000-0000-4000-8000-000000000002', 'Bee Consulting', 'consulting',
  'Questões organizacionais e institucionais, leitura de sistemas, casos e aplicação da tecnologia Bee. Produtos da Academy só quando pertinentes.',
  ARRAY['Dinâmicas organizacionais','Casos e aprendizagens de transformação','Relações e cultura','Tecnologia Bee aplicada a sistemas'],
  '{}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.audiences (id, brand_id, front_id, name, definition, situations, needs, roles, status, notes) VALUES
 ('0b000000-0000-4000-8000-000000000007', '0b000000-0000-4000-8000-000000000002', '0b000000-0000-4000-8000-000000000005',
  'Líderes', 'Líderes e gestores que sustentam equipes e resultados — o público com que a Hive vinha trabalhando.',
  ARRAY['pressão por resultado','equipes cansadas ou desalinhadas','modelos de gestão que não respondem mais'], ARRAY['ver o sistema além do sintoma','liderar com presença'],
  '{}', 'active', 'Público legado da configuração anterior.'),
 ('0b000000-0000-4000-8000-000000000008', '0b000000-0000-4000-8000-000000000002', '0b000000-0000-4000-8000-000000000005',
  'Transformadores', 'Pessoas que assumem a responsabilidade de provocar, facilitar ou sustentar transformação em pessoas, grupos ou organizações.',
  '{}', '{}', '{}', 'hypothesis',
  'Definição operacional inicial a validar. Consultoria, facilitação, RH e liderança são exemplos possíveis, não segmentos aprovados. Núcleo inicial a definir pelo Marcos na recalibração.'),
 ('0b000000-0000-4000-8000-000000000009', '0b000000-0000-4000-8000-000000000002', '0b000000-0000-4000-8000-000000000006',
  'Pessoas e papéis em questões organizacionais', 'Quem vive, decide ou influencia questões organizacionais: dirigentes, gestores, RH e quem conduz mudanças na organização.',
  '{}', '{}', '{"usuario":"quem vive a dinâmica","influenciador":"quem recomenda caminhos","comprador":"quem decide contratar"}', 'hypothesis',
  'Hipótese ampla para a entrevista; segmentação final a definir com o Marcos.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.communication_profiles (id, brand_id, emitter_id, front_id, primary_audience_id, secondary_audience_ids, name, positioning, expression, cta_policy, offer_ids, status, is_default, needs_recalibration) VALUES
 ('0b000000-0000-4000-8000-00000000000a', '0b000000-0000-4000-8000-000000000002', '0b000000-0000-4000-8000-000000000003', '0b000000-0000-4000-8000-000000000005',
  '0b000000-0000-4000-8000-000000000007', ARRAY['0b000000-0000-4000-8000-000000000008']::uuid[],
  'Bee Academy · Marcos · Líderes e transformadores',
  'Formação de quem atua em transformação, a partir da leitura sistêmica da Bee. Mensagens de autoridade, histórias e leitura de casos têm valor próprio.',
  'Voz autoral do Marcos: observação, perguntas e histórias com significado.', 'by_intent',
  ARRAY(SELECT id FROM public.bee_products WHERE slug IN ('masterclass-6d','fls','mc04')), 'active', true,
  'Recalibrar: Academy deve priorizar transformadores; definir o núcleo inicial (situação, tipo de transformação, dificuldade recorrente).'),
 ('0b000000-0000-4000-8000-00000000000b', '0b000000-0000-4000-8000-000000000002', '0b000000-0000-4000-8000-000000000003', '0b000000-0000-4000-8000-000000000006',
  '0b000000-0000-4000-8000-000000000009', '{}',
  'Bee Consulting · Marcos · Organizações',
  'Leitura de sistemas organizacionais e aplicação da tecnologia Bee em questões institucionais: dinâmicas, cultura, relações e casos de transformação.',
  'Voz autoral do Marcos aplicada a temas organizacionais; casos só com dados confirmados.', 'by_intent', '{}', 'active', false,
  'Definir interlocutores prioritários da Consulting e quando falar como Marcos ou como Bee.'),
 ('0b000000-0000-4000-8000-00000000000c', '0b000000-0000-4000-8000-000000000002', '0b000000-0000-4000-8000-000000000004', '0b000000-0000-4000-8000-000000000006',
  '0b000000-0000-4000-8000-000000000009', '{}',
  'Bee Consulting · Institucional · Organizações',
  'Voz institucional da Bee Consulting para temas organizacionais.', 'Institucional: "nós", fatos e práticas confirmadas.', 'by_intent', '{}', 'draft', false,
  'Uso da voz institucional ainda é decisão de curadoria do Marcos.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.communication_profile_versions (profile_id, version, status, data, reason, activated_at)
SELECT p.id, 1, CASE WHEN p.status = 'active' THEN 'active' ELSE 'draft' END,
       jsonb_build_object('name', p.name, 'positioning', p.positioning, 'expression', p.expression, 'cta_policy', p.cta_policy,
         'emitter_id', p.emitter_id, 'front_id', p.front_id, 'primary_audience_id', p.primary_audience_id, 'secondary_audience_ids', p.secondary_audience_ids),
       'Configuração inicial a partir do legado (Fase 1) — revisar no percurso Minha identidade.',
       CASE WHEN p.status = 'active' THEN now() END
  FROM public.communication_profiles p
 WHERE p.brand_id = '0b000000-0000-4000-8000-000000000002'
ON CONFLICT (profile_id, version) DO NOTHING;

-- Campanhas: a de lançamento da Masterclass é Academy; as demais ficam para curadoria
-- (sem fallback silencioso — a UI mostra "perfil a definir").
UPDATE public.campaigns SET profile_id = '0b000000-0000-4000-8000-00000000000a'
 WHERE profile_id IS NULL AND (product_id IN (SELECT id FROM public.bee_products WHERE slug IN ('masterclass-6d','fls','mc04')) OR name ILIKE '%masterclass%');
UPDATE public.campaigns SET profile_needs_review = true
 WHERE profile_id IS NULL AND coalesce(metadata->>'kind', '') <> 'avulso';

COMMIT;
