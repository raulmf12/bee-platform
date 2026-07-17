-- =====================================================================
-- F2+F3+F4: bee_products + editorial_lines + editorial_line_runs + pg_cron
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. BEE_PRODUCTS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bee_products (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  slug                TEXT NOT NULL,
  name                TEXT NOT NULL,
  description         TEXT,
  type                TEXT,
  -- ciclo de lancamento
  pre_launch_start    DATE,
  launch_date         DATE,
  post_launch_end     DATE,
  -- estado
  status              TEXT DEFAULT 'evergreen'
                      CHECK (status IN ('em_construcao','pre_launch','launching','post_launch','evergreen','archived')),
  -- contexto pra IA
  promessa            TEXT,
  pillars             TEXT[],
  cta_text            TEXT,
  cta_link            TEXT,
  metadata            JSONB DEFAULT '{}'::jsonb,
  is_system           BOOLEAN DEFAULT FALSE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_products_user ON public.bee_products(user_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON public.bee_products(status);

-- Seed dos produtos Bee oficiais (user_id NULL = system, visivel pra todos)
INSERT INTO public.bee_products (user_id, slug, name, description, type, status, promessa, pillars, is_system) VALUES
(NULL, 'fls', 'FLS — Formacao em Lideranca Sistemica',
 'Programa de formacao em lideranca sistemica baseado nas 6 Dimensoes (Essencialidade, Integralidade, Totalidade, Maturidade, Potencialidade, Vivacidade). 12 aulas + acompanhamento.',
 'curso', 'evergreen',
 'Liderar com mais sentido, menos esforco e mais impacto.',
 ARRAY['6-dimensoes', 'lideranca-sistemica', 'autorresponsabilidade', 'TACC', 'cocriacao'],
 TRUE),
(NULL, 'masterclass-6d', 'Masterclass — Desvendando as 6 Dimensoes Sistemicas',
 'Masterclass de 90min que apresenta o framework das 6 Dimensoes e o conceito de TACC. Porta de entrada pra FLS.',
 'masterclass', 'evergreen',
 'A chave para liderar na complexidade.',
 ARRAY['6-dimensoes', 'TACC', 'paradigma-sistemico'],
 TRUE)
ON CONFLICT (user_id, slug) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. EDITORIAL_LINES (campanhas editoriais recorrentes)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.editorial_lines (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id              UUID REFERENCES public.bee_products(id) ON DELETE SET NULL,
  name                    TEXT NOT NULL,
  description             TEXT,
  -- editoriais em rotacao (slugs do bee_editorials)
  editorial_slugs         TEXT[] NOT NULL,
  rotation_cursor         INT DEFAULT 0,
  -- alvo
  target_avatar           TEXT DEFAULT 'ambos',
  platforms               TEXT[] DEFAULT ARRAY['linkedin']::TEXT[],
  campaign_phase          TEXT DEFAULT 'free'
                          CHECK (campaign_phase IN ('free','pre_launch','launch','post_launch')),
  -- frequencia
  frequency_type          TEXT DEFAULT 'weekly'
                          CHECK (frequency_type IN ('weekly','daily','custom_days','manual')),
  frequency_days          INT[],
  preferred_hour          INT DEFAULT 8 CHECK (preferred_hour >= 0 AND preferred_hour <= 23),
  -- periodo
  start_date              DATE,
  end_date                DATE,
  -- contexto persistente
  briefing_base           TEXT,
  theme                   TEXT,
  -- estado
  status                  TEXT DEFAULT 'active'
                          CHECK (status IN ('active','paused','ended','draft')),
  next_run_at             TIMESTAMPTZ,
  last_run_at             TIMESTAMPTZ,
  posts_generated_count   INT DEFAULT 0,
  metadata                JSONB DEFAULT '{}'::jsonb,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lines_user ON public.editorial_lines(user_id);
CREATE INDEX IF NOT EXISTS idx_lines_next_run ON public.editorial_lines(next_run_at) WHERE status = 'active';

-- ---------------------------------------------------------------------
-- 3. EDITORIAL_LINE_RUNS (historico de execucoes)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.editorial_line_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_id         UUID NOT NULL REFERENCES public.editorial_lines(id) ON DELETE CASCADE,
  post_id         UUID REFERENCES public.user_posts(id) ON DELETE SET NULL,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform        TEXT,
  editorial_slug  TEXT,
  status          TEXT CHECK (status IN ('success','failed','skipped')),
  error_message   TEXT,
  scheduled_for   TIMESTAMPTZ,
  run_at          TIMESTAMPTZ DEFAULT NOW(),
  duration_ms     INT,
  metadata        JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_runs_line ON public.editorial_line_runs(line_id, run_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_user ON public.editorial_line_runs(user_id, run_at DESC);

-- ---------------------------------------------------------------------
-- 4. TRIGGER: calcula next_run_at quando uma linha eh criada/editada
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calc_next_run_at(
  freq_type TEXT,
  freq_days INT[],
  hour INT,
  last_run TIMESTAMPTZ,
  start_dt DATE
) RETURNS TIMESTAMPTZ AS $$
DECLARE
  base_time TIMESTAMPTZ := COALESCE(last_run, NOW());
  candidate TIMESTAMPTZ;
  i INT;
BEGIN
  -- se nao tem frequencia automatica, retorna null
  IF freq_type = 'manual' THEN RETURN NULL; END IF;
  -- daily: proximo dia as Xh
  IF freq_type = 'daily' THEN
    candidate := date_trunc('day', base_time) + INTERVAL '1 day' + (hour || ' hours')::INTERVAL;
    IF start_dt IS NOT NULL AND candidate::DATE < start_dt THEN
      candidate := start_dt + (hour || ' hours')::INTERVAL;
    END IF;
    RETURN candidate;
  END IF;
  -- weekly ou custom_days: proximo dia da semana em freq_days (1=seg, 7=dom)
  IF freq_days IS NULL OR array_length(freq_days, 1) IS NULL THEN
    RETURN base_time + INTERVAL '7 days';
  END IF;
  FOR i IN 1..14 LOOP
    candidate := date_trunc('day', base_time + (i || ' days')::INTERVAL) + (hour || ' hours')::INTERVAL;
    IF EXTRACT(ISODOW FROM candidate)::INT = ANY(freq_days) THEN
      IF start_dt IS NULL OR candidate::DATE >= start_dt THEN
        RETURN candidate;
      END IF;
    END IF;
  END LOOP;
  RETURN base_time + INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.editorial_line_set_next_run()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'active' AND (TG_OP = 'INSERT' OR OLD.status <> 'active' OR
     NEW.frequency_type <> OLD.frequency_type OR NEW.frequency_days IS DISTINCT FROM OLD.frequency_days OR
     NEW.preferred_hour <> OLD.preferred_hour OR NEW.start_date IS DISTINCT FROM OLD.start_date) THEN
    NEW.next_run_at := public.calc_next_run_at(
      NEW.frequency_type, NEW.frequency_days, NEW.preferred_hour,
      NEW.last_run_at, NEW.start_date
    );
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_editorial_lines_next_run ON public.editorial_lines;
CREATE TRIGGER trg_editorial_lines_next_run
  BEFORE INSERT OR UPDATE ON public.editorial_lines
  FOR EACH ROW EXECUTE FUNCTION public.editorial_line_set_next_run();

-- ---------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------
ALTER TABLE public.bee_products          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.editorial_lines       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.editorial_line_runs   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products_select"      ON public.bee_products;
DROP POLICY IF EXISTS "products_insert_own"  ON public.bee_products;
DROP POLICY IF EXISTS "products_update_own"  ON public.bee_products;
DROP POLICY IF EXISTS "products_delete_own"  ON public.bee_products;

CREATE POLICY "products_select"     ON public.bee_products FOR SELECT TO authenticated
  USING (user_id IS NULL OR is_system = TRUE OR user_id = auth.uid());
CREATE POLICY "products_insert_own" ON public.bee_products FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "products_update_own" ON public.bee_products FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "products_delete_own" ON public.bee_products FOR DELETE TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "lines_all_own" ON public.editorial_lines;
CREATE POLICY "lines_all_own" ON public.editorial_lines FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "line_runs_all_own" ON public.editorial_line_runs;
CREATE POLICY "line_runs_all_own" ON public.editorial_line_runs FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- 6. TRIGGER updated_at
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_products_updated ON public.bee_products;
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON public.bee_products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- 7. user_posts: novo campo editorial_line_id + companion_post_id
-- ---------------------------------------------------------------------
ALTER TABLE public.user_posts
  ADD COLUMN IF NOT EXISTS editorial_line_id UUID REFERENCES public.editorial_lines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS companion_post_id UUID REFERENCES public.user_posts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES public.bee_products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_user_posts_line ON public.user_posts(editorial_line_id);
CREATE INDEX IF NOT EXISTS idx_user_posts_companion ON public.user_posts(companion_post_id);
CREATE INDEX IF NOT EXISTS idx_user_posts_product ON public.user_posts(product_id);

-- ---------------------------------------------------------------------
-- 8. ATIVAR pg_cron + pg_net (necessario chamar edge function via http)
-- ---------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ---------------------------------------------------------------------
-- 9. SCHEDULE: chamar edge function editorial-line-tick a cada 1h
-- (a edge function pega o JWT do header e identifica como service-role)
-- NOTE: substituir o token abaixo pela SERVICE_ROLE_KEY no Supabase dashboard
--       OU usar o helper supabase.functions.invoke via SQL
-- ---------------------------------------------------------------------
-- Remove agendamento antigo se houver
SELECT cron.unschedule('editorial-line-tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'editorial-line-tick');

-- agendamento (usa http_post de pg_net)
-- voce precisa configurar a service_role key como variavel — ver passo manual abaixo
SELECT cron.schedule(
  'editorial-line-tick',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://djlorvdehedcupeykyes.supabase.co/functions/v1/editorial-line-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
