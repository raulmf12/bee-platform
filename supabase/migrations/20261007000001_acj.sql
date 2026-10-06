-- Biblioteca ACJ (Arquiteturas de Conexão e Jornada) — núcleo de domínio.
-- docs/acj/: Integração v1.0, ACJ-00 v1.0, Template Operacional v0.1, Adendo Técnico v0.1,
-- Registro Vivo v0.1. A ACJ entra entre a estratégia da campanha e a pauta:
--   Plano ACJ da campanha → Plano ACJ do ciclo → ideia (primária/secundária)
--   → Contrato ACJ do conteúdo-mãe (fonte canônica) → snapshot nas peças
--   → resultados/comentários → Registro Vivo.
-- As invariantes ficam AQUI (Adendo §8), não só no prompt ou na interface.
BEGIN;

-- ---------------------------------------------------------------------------
-- Vocabulário: só ACJ-01..05 são atribuíveis. ACJ-00 é governança.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.acj_valid(id text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$ SELECT id IN ('ACJ-01','ACJ-02','ACJ-03','ACJ-04','ACJ-05') $$;

-- Mix ACJ: só chaves ACJ-01..05, valores 0..100, total 100 (tolerância 1 p/ arredondamento).
CREATE OR REPLACE FUNCTION public.acj_mix_ok(m jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT m IS NOT NULL AND jsonb_typeof(m) = 'object'
    AND NOT EXISTS (SELECT 1 FROM jsonb_object_keys(m) k WHERE NOT public.acj_valid(k))
    AND NOT EXISTS (SELECT 1 FROM jsonb_each(m) e WHERE jsonb_typeof(e.value) <> 'number' OR (e.value)::numeric < 0 OR (e.value)::numeric > 100)
    AND abs(COALESCE((SELECT sum((e.value)::numeric) FROM jsonb_each(m) e), 0) - 100) <= 1
$$;

-- ---------------------------------------------------------------------------
-- Definições versionadas (global, só leitura para usuários; seed gerado dos .md)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.acj_definitions (
  acj_id text NOT NULL CHECK (public.acj_valid(acj_id)),
  version text NOT NULL,
  status text NOT NULL CHECK (status IN ('draft', 'in_validation', 'active', 'deprecated')),
  name text NOT NULL,
  short_phrase text,
  purpose text,
  desired_effect text,
  primary_question text,
  state_from text,
  state_to text,
  mechanism text,
  color text,
  editorial_hints text[] NOT NULL DEFAULT '{}',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  document_ref text,
  effective_from timestamptz NOT NULL DEFAULT now(),
  deprecated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (acj_id, version)
);
ALTER TABLE public.acj_definitions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS acj_definitions_read ON public.acj_definitions;
CREATE POLICY acj_definitions_read ON public.acj_definitions FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.acj_definitions TO authenticated;
GRANT ALL ON public.acj_definitions TO service_role;

-- ---------------------------------------------------------------------------
-- Plano ACJ da Campanha (Template Operacional §5) — versionado; aprovação humana separada.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.acj_campaign_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  version integer NOT NULL,
  status text NOT NULL DEFAULT 'recommended' CHECK (status IN ('draft', 'recommended', 'approved', 'active', 'recalibration_needed', 'completed', 'archived')),
  adoption text NOT NULL DEFAULT 'native' CHECK (adoption IN ('native', 'late')),
  adoption_note text,
  audience_state text,
  desired_state text,
  journey_needs jsonb NOT NULL DEFAULT '[]'::jsonb,
  target_mix jsonb NOT NULL CHECK (public.acj_mix_ok(target_mix)),
  phases jsonb NOT NULL DEFAULT '[]'::jsonb,
  sequence_hypotheses jsonb NOT NULL DEFAULT '[]'::jsonb,
  success_signals jsonb NOT NULL DEFAULT '{}'::jsonb,
  recalibration_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  exclusions jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence text CHECK (confidence IS NULL OR confidence IN ('very_low', 'low', 'medium', 'high', 'very_high')),
  human_decisions_required jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_acj_version text,
  decision_origin text NOT NULL DEFAULT 'acj_00' CHECK (decision_origin IN ('strategy', 'acj_00', 'marcos', 'execution_feedback', 'audience_response', 'journey_result')),
  instruction text,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, version),
  CHECK (status NOT IN ('approved', 'active') OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_acj_cplans_campaign ON public.acj_campaign_plans (campaign_id, version DESC);

-- Versão aprovada é imutável no conteúdo (só muda status). Aprovar uma versão
-- arquiva a anterior vigente — nunca apaga histórico.
CREATE OR REPLACE FUNCTION public.acj_campaign_plan_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.version IS NULL THEN
      SELECT COALESCE(max(version), 0) + 1 INTO NEW.version FROM public.acj_campaign_plans WHERE campaign_id = NEW.campaign_id;
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status IN ('approved', 'active', 'completed', 'archived')
     AND (NEW.target_mix IS DISTINCT FROM OLD.target_mix OR NEW.phases IS DISTINCT FROM OLD.phases
          OR NEW.audience_state IS DISTINCT FROM OLD.audience_state OR NEW.journey_needs IS DISTINCT FROM OLD.journey_needs) THEN
    RAISE EXCEPTION 'Plano ACJ aprovado é imutável: crie uma nova versão.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_acj_cplan_guard ON public.acj_campaign_plans;
CREATE TRIGGER trg_acj_cplan_guard BEFORE INSERT OR UPDATE ON public.acj_campaign_plans FOR EACH ROW EXECUTE FUNCTION public.acj_campaign_plan_guard();

CREATE OR REPLACE FUNCTION public.acj_campaign_plan_after() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IN ('approved', 'active') AND (TG_OP = 'INSERT' OR OLD.status NOT IN ('approved', 'active')) THEN
    UPDATE public.acj_campaign_plans SET status = 'archived'
     WHERE campaign_id = NEW.campaign_id AND id <> NEW.id AND status IN ('approved', 'active', 'recommended', 'draft', 'recalibration_needed');
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_acj_cplan_after ON public.acj_campaign_plans;
CREATE TRIGGER trg_acj_cplan_after AFTER INSERT OR UPDATE OF status ON public.acj_campaign_plans FOR EACH ROW EXECUTE FUNCTION public.acj_campaign_plan_after();

-- ---------------------------------------------------------------------------
-- Plano ACJ do Ciclo (Template Operacional §6) — referencia uma versão do plano da campanha.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.acj_cycle_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cycle_id uuid NOT NULL REFERENCES public.campaign_cycles(id) ON DELETE CASCADE,
  campaign_plan_id uuid NOT NULL REFERENCES public.acj_campaign_plans(id) ON DELETE CASCADE,
  campaign_plan_version integer NOT NULL,
  version integer NOT NULL,
  cycle_mix jsonb NOT NULL CHECK (public.acj_mix_ok(cycle_mix)),
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,           -- ACJ → nº de conteúdos (evita falsa precisão %)
  realized jsonb NOT NULL DEFAULT '{}'::jsonb,         -- ACJ → conteúdos já planejados/publicados na campanha
  gaps jsonb NOT NULL DEFAULT '[]'::jsonb,
  saturation_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  priorities jsonb NOT NULL DEFAULT '[]'::jsonb,
  circulation_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  rationale text,
  plan_status_at_creation text,                         -- status do plano da campanha quando o ciclo foi planejado
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'recommended', 'approved', 'active', 'recalibration_needed', 'completed', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, version)
);
CREATE INDEX IF NOT EXISTS idx_acj_cyplans_cycle ON public.acj_cycle_plans (cycle_id, version DESC);

CREATE OR REPLACE FUNCTION public.acj_cycle_plan_before() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.version IS NULL THEN
    SELECT COALESCE(max(version), 0) + 1 INTO NEW.version FROM public.acj_cycle_plans WHERE cycle_id = NEW.cycle_id;
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(NEW.counts) k WHERE NOT public.acj_valid(k)) THEN
    RAISE EXCEPTION 'Plano do ciclo: só ACJ-01 a ACJ-05.' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.acj_cycle_plans SET status = 'archived' WHERE cycle_id = NEW.cycle_id AND status <> 'archived';
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_acj_cyplan_before ON public.acj_cycle_plans;
CREATE TRIGGER trg_acj_cyplan_before BEFORE INSERT ON public.acj_cycle_plans FOR EACH ROW EXECUTE FUNCTION public.acj_cycle_plan_before();

-- ---------------------------------------------------------------------------
-- Ideia: ACJ primária (+ secundária opcional, diferente) e papel na sequência.
-- ---------------------------------------------------------------------------
ALTER TABLE public.ideas
  ADD COLUMN IF NOT EXISTS acj_primary text,
  ADD COLUMN IF NOT EXISTS acj_secondary text,
  ADD COLUMN IF NOT EXISTS acj_role text,
  ADD COLUMN IF NOT EXISTS acj_rationale text,
  ADD COLUMN IF NOT EXISTS acj_confidence text;
ALTER TABLE public.ideas DROP CONSTRAINT IF EXISTS ideas_acj_check;
ALTER TABLE public.ideas ADD CONSTRAINT ideas_acj_check CHECK (
  (acj_primary IS NULL OR public.acj_valid(acj_primary))
  AND (acj_secondary IS NULL OR (public.acj_valid(acj_secondary) AND acj_primary IS NOT NULL AND acj_secondary <> acj_primary))
);
CREATE INDEX IF NOT EXISTS idx_ideas_acj ON public.ideas (cycle_id, acj_primary);

-- ---------------------------------------------------------------------------
-- Contrato ACJ do Conteúdo-mãe (Template Operacional §7) — FONTE CANÔNICA, versionado.
-- Mudar o movimento = nova versão (o UPDATE do movimento é recusado).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.acj_content_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content_id uuid NOT NULL REFERENCES public.contents(id) ON DELETE CASCADE,
  version integer NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'validated', 'active', 'superseded')),
  campaign_plan_id uuid REFERENCES public.acj_campaign_plans(id) ON DELETE SET NULL,
  cycle_plan_id uuid REFERENCES public.acj_cycle_plans(id) ON DELETE SET NULL,
  acj_primary text NOT NULL CHECK (public.acj_valid(acj_primary)),
  acj_secondary text CHECK (acj_secondary IS NULL OR public.acj_valid(acj_secondary)),
  attribution_confidence text CHECK (attribution_confidence IS NULL OR attribution_confidence IN ('very_low', 'low', 'medium', 'high', 'very_high')),
  rationale text,
  alternative_considered text,
  alternative_reason text,
  audience_state_from text NOT NULL,
  journey_need text NOT NULL,
  movement_to text NOT NULL,
  connection_mechanism text NOT NULL,
  authorial_gesture text,
  expected_experience text,
  expected_response jsonb NOT NULL DEFAULT '[]'::jsonb,
  failure_modes jsonb NOT NULL DEFAULT '[]'::jsonb,
  expression_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  not_to_do text,
  source_acj_version text,
  assigned_late boolean NOT NULL DEFAULT false,         -- ACJ atribuída depois da ideia (aviso, não bloqueio)
  validation jsonb,                                      -- portão G3/G4 (movimento realizado?)
  marcos_feedback jsonb,                                 -- leitura do produtor sobre o movimento
  decision_origin text NOT NULL DEFAULT 'acj_00',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (content_id, version),
  CHECK (acj_secondary IS NULL OR acj_secondary <> acj_primary)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_acj_contract_current ON public.acj_content_contracts (content_id) WHERE status <> 'superseded';

CREATE OR REPLACE FUNCTION public.acj_contract_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.version IS NULL THEN
      SELECT COALESCE(max(version), 0) + 1 INTO NEW.version FROM public.acj_content_contracts WHERE content_id = NEW.content_id;
    END IF;
    UPDATE public.acj_content_contracts SET status = 'superseded' WHERE content_id = NEW.content_id AND status <> 'superseded';
    RETURN NEW;
  END IF;
  IF NEW.acj_primary IS DISTINCT FROM OLD.acj_primary OR NEW.acj_secondary IS DISTINCT FROM OLD.acj_secondary
     OR NEW.movement_to IS DISTINCT FROM OLD.movement_to OR NEW.connection_mechanism IS DISTINCT FROM OLD.connection_mechanism
     OR NEW.audience_state_from IS DISTINCT FROM OLD.audience_state_from OR NEW.content_id IS DISTINCT FROM OLD.content_id THEN
    RAISE EXCEPTION 'Mudança de movimento exige nova versão do contrato ACJ.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_acj_contract_guard ON public.acj_content_contracts;
CREATE TRIGGER trg_acj_contract_guard BEFORE INSERT OR UPDATE ON public.acj_content_contracts FOR EACH ROW EXECUTE FUNCTION public.acj_contract_guard();

-- ---------------------------------------------------------------------------
-- Peça: herda o contrato (snapshot). Publicação congela o snapshot para sempre.
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_posts
  ADD COLUMN IF NOT EXISTS acj_primary text,
  ADD COLUMN IF NOT EXISTS acj_secondary text,
  ADD COLUMN IF NOT EXISTS acj_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS acj_status text,
  ADD COLUMN IF NOT EXISTS acj_frozen_at timestamptz,
  ADD COLUMN IF NOT EXISTS acj_deviation jsonb;
ALTER TABLE public.user_posts DROP CONSTRAINT IF EXISTS user_posts_acj_check;
ALTER TABLE public.user_posts ADD CONSTRAINT user_posts_acj_check CHECK (
  (acj_primary IS NULL OR public.acj_valid(acj_primary))
  AND (acj_secondary IS NULL OR public.acj_valid(acj_secondary))
  AND (acj_status IS NULL OR acj_status IN ('inherited', 'legacy_unassigned', 'not_applicable', 'unknown'))
);
CREATE INDEX IF NOT EXISTS idx_posts_acj ON public.user_posts (campaign_id, acj_primary) WHERE acj_primary IS NOT NULL;

CREATE OR REPLACE FUNCTION public.acj_piece_inherit() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE c public.acj_content_contracts%ROWTYPE;
BEGIN
  -- Snapshot publicado é imutável (Adendo §8.11): ignora qualquer tentativa de mudar.
  IF TG_OP = 'UPDATE' AND OLD.acj_frozen_at IS NOT NULL THEN
    NEW.acj_primary := OLD.acj_primary; NEW.acj_secondary := OLD.acj_secondary; NEW.acj_snapshot := OLD.acj_snapshot;
    NEW.acj_status := OLD.acj_status; NEW.acj_frozen_at := OLD.acj_frozen_at;
    RETURN NEW;
  END IF;
  IF NEW.content_id IS NOT NULL THEN
    SELECT * INTO c FROM public.acj_content_contracts
     WHERE content_id = NEW.content_id AND status <> 'superseded' ORDER BY version DESC LIMIT 1;
    IF FOUND THEN
      NEW.acj_primary := c.acj_primary;
      NEW.acj_secondary := c.acj_secondary;
      NEW.acj_status := 'inherited';
      NEW.acj_snapshot := jsonb_build_object(
        'contract_id', c.id, 'contract_version', c.version, 'acj_primary', c.acj_primary, 'acj_secondary', c.acj_secondary,
        'audience_state_from', c.audience_state_from, 'movement_to', c.movement_to, 'connection_mechanism', c.connection_mechanism,
        'expected_response', c.expected_response, 'source_acj_version', c.source_acj_version, 'taken_at', now());
    END IF;
  END IF;
  IF NEW.status = 'published' AND NEW.acj_snapshot IS NOT NULL THEN
    NEW.acj_frozen_at := now();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_posts_acj_inherit ON public.user_posts;
CREATE TRIGGER trg_posts_acj_inherit BEFORE INSERT OR UPDATE ON public.user_posts FOR EACH ROW EXECUTE FUNCTION public.acj_piece_inherit();

-- Contrato novo → peças ainda não publicadas do conteúdo atualizam a herança.
CREATE OR REPLACE FUNCTION public.acj_contract_propagate() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.user_posts SET acj_snapshot = acj_snapshot WHERE content_id = NEW.content_id AND acj_frozen_at IS NULL;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_acj_contract_propagate ON public.acj_content_contracts;
CREATE TRIGGER trg_acj_contract_propagate AFTER INSERT ON public.acj_content_contracts FOR EACH ROW EXECUTE FUNCTION public.acj_contract_propagate();

-- Peças já publicadas antes da ACJ: sem snapshot retroativo (Adendo §18.2).
-- (sem mexer no updated_at: a lista de posts ordena por ele)
ALTER TABLE public.user_posts DISABLE TRIGGER trg_user_posts_updated;
UPDATE public.user_posts SET acj_status = 'legacy_unassigned'
 WHERE status = 'published' AND acj_snapshot IS NULL AND acj_status IS NULL;
ALTER TABLE public.user_posts ENABLE TRIGGER trg_user_posts_updated;

-- ---------------------------------------------------------------------------
-- Comentários (sinal qualitativo da audiência). Nunca vão para prompt com autor.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.post_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.user_posts(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.social_accounts(id) ON DELETE SET NULL,
  platform text NOT NULL CHECK (platform IN ('instagram', 'linkedin')),
  external_id text NOT NULL,
  parent_external_id text,
  text text,
  author_username text,
  is_own boolean NOT NULL DEFAULT false,
  like_count integer,
  commented_at timestamptz,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, external_id)
);
CREATE INDEX IF NOT EXISTS idx_post_comments_post ON public.post_comments (post_id, commented_at);

-- Leitura dos sinais de um post à luz da ACJ (G7: distingue arquitetura, conteúdo,
-- execução, distribuição e contexto; não declara causalidade).
CREATE TABLE IF NOT EXISTS public.acj_signal_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.user_posts(id) ON DELETE CASCADE,
  acj_primary text CHECK (acj_primary IS NULL OR public.acj_valid(acj_primary)),
  comment_count integer NOT NULL DEFAULT 0,
  movement_evidence text CHECK (movement_evidence IS NULL OR movement_evidence IN ('strong', 'partial', 'absent', 'insufficient')),
  probable_causes text[] NOT NULL DEFAULT '{}',
  signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary text,
  limitations text,
  model text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_acj_readings_post ON public.acj_signal_readings (post_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Registro Vivo de Aprendizagens ACJ (ACJL-AAAA-NNN) — estados e transições do §5.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.acj_learning_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code text NOT NULL,
  title text NOT NULL,
  acj_ids text[] NOT NULL DEFAULT '{}',
  object_type text CHECK (object_type IS NULL OR object_type IN ('campaign', 'cycle', 'content', 'piece', 'agenda', 'audience', 'result')),
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  cycle_id uuid REFERENCES public.campaign_cycles(id) ON DELETE SET NULL,
  content_id uuid REFERENCES public.contents(id) ON DELETE SET NULL,
  post_id uuid REFERENCES public.user_posts(id) ON DELETE SET NULL,
  observed_fact text NOT NULL,
  context text,
  sources text[] NOT NULL DEFAULT '{}',
  candidate_pattern text,
  hypothesis text,
  alternatives text,
  test_design jsonb NOT NULL DEFAULT '{}'::jsonb,
  probable_causes text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'hypothesis', 'testing', 'provisional', 'validated', 'consolidated', 'rejected', 'inconclusive', 'suspended')),
  confidence text NOT NULL DEFAULT 'very_low' CHECK (confidence IN ('very_low', 'low', 'medium', 'high', 'very_high')),
  change_class text CHECK (change_class IS NULL OR change_class IN ('no_change', 'execution_adjustment', 'architecture_adjustment', 'new_variant', 'possible_new_architecture')),
  next_action text,
  affected_document text,
  promotion_status text NOT NULL DEFAULT 'not_promoted' CHECK (promotion_status IN ('not_promoted', 'proposed', 'promoted')),
  reopen_reason text,
  origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual', 'hive_suggestion')),
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, code),
  CHECK (NOT (acj_ids && ARRAY['ACJ-00']::text[])),
  CHECK (status NOT IN ('validated', 'consolidated') OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  CHECK (status <> 'consolidated' OR affected_document IS NOT NULL),
  CHECK (promotion_status = 'not_promoted' OR status IN ('validated', 'consolidated'))
);
CREATE INDEX IF NOT EXISTS idx_acj_learning_user ON public.acj_learning_entries (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.acj_learning_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_id uuid NOT NULL REFERENCES public.acj_learning_entries(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('marcos', 'audience', 'journey', 'system')),
  post_id uuid REFERENCES public.user_posts(id) ON DELETE SET NULL,
  content_id uuid REFERENCES public.contents(id) ON DELETE SET NULL,
  description text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  limitations text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.acj_learning_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_id uuid NOT NULL REFERENCES public.acj_learning_entries(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  change_class text,
  confidence text,
  note text,
  decided_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.acj_learning_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE ok boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.code IS NULL OR NEW.code = '' THEN
      PERFORM pg_advisory_xact_lock(hashtext('acjl' || NEW.user_id::text));
      SELECT 'ACJL-' || to_char(now(), 'YYYY') || '-' || lpad((COALESCE(max(split_part(code, '-', 3)::int), 0) + 1)::text, 3, '0')
        INTO NEW.code FROM public.acj_learning_entries
       WHERE user_id = NEW.user_id AND code LIKE 'ACJL-' || to_char(now(), 'YYYY') || '-%';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.code IS DISTINCT FROM OLD.code THEN
    RAISE EXCEPTION 'O ID do registro é imutável.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    ok := CASE OLD.status
      WHEN 'open' THEN NEW.status IN ('hypothesis', 'inconclusive')
      WHEN 'hypothesis' THEN NEW.status IN ('testing', 'suspended', 'rejected', 'inconclusive')
      WHEN 'testing' THEN NEW.status IN ('provisional', 'rejected', 'inconclusive', 'suspended')
      WHEN 'provisional' THEN NEW.status IN ('testing', 'validated', 'rejected', 'inconclusive')
      WHEN 'validated' THEN NEW.status IN ('consolidated')
      WHEN 'suspended' THEN NEW.status IN ('hypothesis', 'testing')
      ELSE NEW.status IN ('open', 'hypothesis') AND COALESCE(NEW.reopen_reason, '') <> '' AND NEW.reopen_reason IS DISTINCT FROM OLD.reopen_reason
    END;
    IF NOT ok THEN
      RAISE EXCEPTION 'Transição não permitida no Registro Vivo: % → %', OLD.status, NEW.status USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_acj_learning_guard ON public.acj_learning_entries;
CREATE TRIGGER trg_acj_learning_guard BEFORE INSERT OR UPDATE ON public.acj_learning_entries FOR EACH ROW EXECUTE FUNCTION public.acj_learning_guard();

-- Toda mudança de status deixa trilha (quem, quando, de → para).
CREATE OR REPLACE FUNCTION public.acj_learning_audit() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.acj_learning_decisions (user_id, entry_id, from_status, to_status, change_class, confidence, note, decided_by)
    VALUES (NEW.user_id, NEW.id, CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END, NEW.status, NEW.change_class, NEW.confidence,
            CASE WHEN TG_OP = 'INSERT' THEN 'Registro aberto' ELSE NEW.next_action END, auth.uid());
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_acj_learning_audit ON public.acj_learning_entries;
CREATE TRIGGER trg_acj_learning_audit AFTER INSERT OR UPDATE ON public.acj_learning_entries FOR EACH ROW EXECUTE FUNCTION public.acj_learning_audit();

-- Hipóteses rejeitadas/inconclusivas não são apagadas pelo app (memória sem apego).
CREATE OR REPLACE FUNCTION public.acj_learning_no_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'Registros do Registro Vivo não são apagados; encerre como rejeitado ou inconclusivo.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS trg_acj_learning_no_delete ON public.acj_learning_entries;
CREATE TRIGGER trg_acj_learning_no_delete BEFORE DELETE ON public.acj_learning_entries FOR EACH ROW EXECUTE FUNCTION public.acj_learning_no_delete();

-- ---------------------------------------------------------------------------
-- updated_at + RLS (dono = auth.uid())
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['acj_campaign_plans','acj_content_contracts','post_comments','acj_learning_entries'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_updated ON public.%1$s', t);
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated BEFORE UPDATE ON public.%1$s FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['acj_campaign_plans','acj_cycle_plans','acj_content_contracts','post_comments','acj_signal_readings','acj_learning_entries','acj_learning_evidence','acj_learning_decisions'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_all_own ON public.%1$s', t);
    EXECUTE format('CREATE POLICY %1$s_all_own ON public.%1$s TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- Resultado por peça com a ACJ vigente na execução (Template Operacional §9).
CREATE OR REPLACE VIEW public.acj_piece_results WITH (security_invoker = true) AS
SELECT p.id AS post_id, p.user_id, p.campaign_id, p.cycle_id, p.content_id, p.platform, p.account_id, p.status,
       p.published_at, p.acj_primary, p.acj_secondary, p.acj_status, p.acj_frozen_at, p.acj_snapshot,
       m.reach, m.likes, m.comments, m.saves, m.shares, m.engagement_rate, m.captured_at,
       (SELECT count(*) FROM public.post_comments c WHERE c.post_id = p.id AND NOT c.is_own) AS audience_comments
  FROM public.user_posts p
  LEFT JOIN LATERAL (
    SELECT * FROM public.post_metrics pm WHERE pm.post_id = p.id ORDER BY pm.captured_at DESC LIMIT 1
  ) m ON true;
GRANT SELECT ON public.acj_piece_results TO authenticated;

COMMIT;
