-- ============================================================================
-- Campanhas — modelo de dados (F1). Ver docs/PLANO-CAMPANHAS.md §3.
-- 100% ADITIVO: tabelas novas + colunas nulas em user_posts/user_settings.
-- O app antigo continua funcionando sem saber que isto existe.
-- ============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- Contas sociais (multi-conta). A publicação lê as credenciais da conta da
-- peça (user_posts.account_id) com fallback em user_settings.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.social_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('linkedin', 'instagram')),
  label text NOT NULL,
  handle text,
  is_default boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'disconnected', 'expired')),
  linkedin_token text,
  linkedin_author_urn text,
  instagram_access_token text,
  instagram_business_account_id text,
  instagram_token_expires_at timestamptz,
  scopes text[],
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_social_accounts_user ON public.social_accounts (user_id, platform);

-- ---------------------------------------------------------------------------
-- Campanhas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'organica' CHECK (type IN ('organica', 'vendas')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'ended')),
  intent text,
  moment jsonb,
  strategy jsonb,
  duration_weeks smallint CHECK (duration_weeks IS NULL OR duration_weeks BETWEEN 1 AND 52),
  start_date date,
  end_date date,
  product_id uuid REFERENCES public.bee_products(id) ON DELETE SET NULL,
  color text,
  account_ids uuid[] NOT NULL DEFAULT '{}',
  cadence jsonb NOT NULL DEFAULT '{}'::jsonb,
  activated_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_campaigns_user ON public.campaigns (user_id, status);

-- ---------------------------------------------------------------------------
-- Ciclos (semanais) de uma campanha
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.campaign_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idx smallint NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN (
    'not_started', 'planned', 'pauta_ready', 'pauta_approved', 'developing', 'producing', 'ready', 'done')),
  plan jsonb,
  review_due date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, idx)
);
CREATE INDEX IF NOT EXISTS idx_cycles_user ON public.campaign_cycles (user_id, start_date);

-- ---------------------------------------------------------------------------
-- Ideias: pauta de um ciclo OU backlog vivo (cycle_id nulo)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ideas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE,
  cycle_id uuid REFERENCES public.campaign_cycles(id) ON DELETE SET NULL,
  title text NOT NULL,
  summary text,
  strategic_function text CHECK (strategic_function IS NULL OR strategic_function IN (
    'presenca', 'posicionamento', 'autoridade', 'relacionamento', 'produtos')),
  editorial_slug text,
  channels jsonb NOT NULL DEFAULT '[]'::jsonb,
  suggested_pieces smallint NOT NULL DEFAULT 1,
  origin text NOT NULL DEFAULT 'hive' CHECK (origin IN ('hive', 'user', 'result')),
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('backlog', 'proposed', 'approved', 'discarded', 'developed')),
  position smallint NOT NULL DEFAULT 0,
  rationale text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ideas_user ON public.ideas (user_id, status);
CREATE INDEX IF NOT EXISTS idx_ideas_cycle ON public.ideas (cycle_id);
CREATE INDEX IF NOT EXISTS idx_ideas_campaign ON public.ideas (campaign_id);

-- ---------------------------------------------------------------------------
-- Conteúdo-mãe (channel free, validado no formato preferencial do produtor)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idea_id uuid REFERENCES public.ideas(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  cycle_id uuid REFERENCES public.campaign_cycles(id) ON DELETE SET NULL,
  title text NOT NULL,
  strategic_function text CHECK (strategic_function IS NULL OR strategic_function IN (
    'presenca', 'posicionamento', 'autoridade', 'relacionamento', 'produtos')),
  editorial_slug text,
  validation_format text NOT NULL DEFAULT 'linkedin_frase_texto',
  body jsonb NOT NULL DEFAULT '{}'::jsonb,
  considered jsonb,
  status text NOT NULL DEFAULT 'developing' CHECK (status IN ('developing', 'pending_validation', 'validated', 'discarded')),
  versions jsonb NOT NULL DEFAULT '[]'::jsonb,
  position smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contents_user ON public.contents (user_id, status);
CREATE INDEX IF NOT EXISTS idx_contents_cycle ON public.contents (cycle_id);
CREATE INDEX IF NOT EXISTS idx_contents_campaign ON public.contents (campaign_id);
CREATE INDEX IF NOT EXISTS idx_contents_idea ON public.contents (idea_id);

-- ---------------------------------------------------------------------------
-- Métricas de desempenho por peça (última leitura por fonte)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.post_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.user_posts(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.social_accounts(id) ON DELETE SET NULL,
  source text NOT NULL CHECK (source IN ('instagram_api', 'manual')),
  captured_at timestamptz NOT NULL DEFAULT now(),
  reach integer,
  impressions integer,
  likes integer,
  comments integer,
  saves integer,
  shares integer,
  engagement_rate numeric,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, source)
);
CREATE INDEX IF NOT EXISTS idx_post_metrics_user ON public.post_metrics (user_id, captured_at DESC);

-- ---------------------------------------------------------------------------
-- user_posts = PEÇA. Colunas novas, todas nulas/neutras por padrão.
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_posts
  ADD COLUMN IF NOT EXISTS content_id uuid REFERENCES public.contents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cycle_id uuid REFERENCES public.campaign_cycles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.social_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS piece_role text CHECK (piece_role IS NULL OR piece_role IN ('validation', 'unfold')),
  ADD COLUMN IF NOT EXISTS alternative_group uuid,
  ADD COLUMN IF NOT EXISTS alternative_rank smallint,
  ADD COLUMN IF NOT EXISTS is_recommended boolean,
  ADD COLUMN IF NOT EXISTS schedule_priority smallint,
  ADD COLUMN IF NOT EXISTS suggested_start date,
  ADD COLUMN IF NOT EXISTS suggested_end date;
CREATE INDEX IF NOT EXISTS idx_posts_content ON public.user_posts (content_id);
CREATE INDEX IF NOT EXISTS idx_posts_campaign ON public.user_posts (campaign_id);
CREATE INDEX IF NOT EXISTS idx_posts_cycle ON public.user_posts (cycle_id);
CREATE INDEX IF NOT EXISTS idx_posts_account ON public.user_posts (account_id);
CREATE INDEX IF NOT EXISTS idx_posts_alt_group ON public.user_posts (alternative_group) WHERE alternative_group IS NOT NULL;

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS validation_format text NOT NULL DEFAULT 'linkedin_frase_texto';

-- ---------------------------------------------------------------------------
-- updated_at + RLS (padrão do projeto: dono = auth.uid())
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['social_accounts','campaigns','campaign_cycles','ideas','contents','post_metrics'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_updated ON public.%1$s', t);
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated BEFORE UPDATE ON public.%1$s FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_all_own ON public.%1$s', t);
    EXECUTE format('CREATE POLICY %1$s_all_own ON public.%1$s TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

COMMIT;
