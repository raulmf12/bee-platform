-- TRÁFEGO PAGO (Meta Ads) — guardado agora para uso futuro (sem telas ainda).
-- Ao conectar o Facebook, a plataforma traz: Business Managers, contas de
-- anúncio (próprias, de clientes e pessoais), campanhas, conjuntos, anúncios e o
-- desempenho DIÁRIO de cada anúncio (até 37 meses, o limite da Meta). A edge
-- `meta-ads-sync` preenche e mantém atualizado. Aditiva e idempotente.
-- Aplicada via SQL (Management API), como as demais desde 20260812.

-- Conexão (token longo do usuário do Facebook) + estado da sincronização.
CREATE TABLE IF NOT EXISTS public.meta_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fb_user_id text,
  fb_user_name text,
  access_token text NOT NULL,
  token_expires_at timestamptz,
  scopes text[],
  status text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'no_ads_permission', 'expired', 'error')),
  sync_state jsonb NOT NULL DEFAULT '{}'::jsonb,   -- fila de trabalho do histórico + último erro
  last_synced_at timestamptz,
  history_complete_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS public.meta_businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fb_business_id text NOT NULL,
  name text,
  verification_status text,
  raw jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, fb_business_id)
);

CREATE TABLE IF NOT EXISTS public.meta_ad_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fb_account_id text NOT NULL,                    -- 'act_123…'
  fb_business_id text,
  ownership text CHECK (ownership IN ('owned', 'client', 'personal')),
  name text,
  currency text,
  timezone_name text,
  account_status integer,
  amount_spent numeric,                           -- total histórico (centavos na moeda da conta, como a Meta devolve)
  created_time timestamptz,
  raw jsonb,
  insights_error text,                            -- ex.: sem permissão nesta conta
  history_since date,                             -- até onde o histórico diário já foi trazido
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, fb_account_id)
);

CREATE TABLE IF NOT EXISTS public.meta_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fb_account_id text NOT NULL,
  fb_campaign_id text NOT NULL,
  name text, objective text, status text, effective_status text, buying_type text,
  daily_budget numeric, lifetime_budget numeric,
  start_time timestamptz, stop_time timestamptz, created_time timestamptz,
  raw jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, fb_campaign_id)
);

CREATE TABLE IF NOT EXISTS public.meta_adsets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fb_account_id text NOT NULL,
  fb_campaign_id text,
  fb_adset_id text NOT NULL,
  name text, status text, effective_status text, optimization_goal text, billing_event text,
  daily_budget numeric, lifetime_budget numeric,
  start_time timestamptz, end_time timestamptz, created_time timestamptz,
  targeting jsonb,
  raw jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, fb_adset_id)
);

CREATE TABLE IF NOT EXISTS public.meta_ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fb_account_id text NOT NULL,
  fb_campaign_id text,
  fb_adset_id text,
  fb_ad_id text NOT NULL,
  name text, status text, effective_status text, created_time timestamptz,
  creative jsonb,                                  -- título, texto, imagem, post do Instagram impulsionado…
  ig_media_id text,                                -- liga o anúncio ao post do Instagram (user_posts.metadata.ig_media_id)
  raw jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, fb_ad_id)
);

-- Desempenho diário por anúncio (nível mais fino; campanha/conjunto/conta = soma).
CREATE TABLE IF NOT EXISTS public.meta_ad_insights_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fb_account_id text NOT NULL,
  fb_campaign_id text, campaign_name text,
  fb_adset_id text, adset_name text,
  fb_ad_id text NOT NULL, ad_name text,
  date date NOT NULL,
  spend numeric, impressions bigint, reach bigint, frequency numeric,
  clicks bigint, inline_link_clicks bigint, ctr numeric, cpc numeric, cpm numeric,
  actions jsonb, action_values jsonb, cost_per_action_type jsonb,
  raw jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, fb_ad_id, date)
);
CREATE INDEX IF NOT EXISTS idx_meta_insights_account_date ON public.meta_ad_insights_daily (user_id, fb_account_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_meta_insights_campaign ON public.meta_ad_insights_daily (user_id, fb_campaign_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_meta_ads_ig_media ON public.meta_ads (user_id, ig_media_id) WHERE ig_media_id IS NOT NULL;

-- RLS: só o dono (padrão do projeto).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['meta_connections','meta_businesses','meta_ad_accounts','meta_campaigns','meta_adsets','meta_ads','meta_ad_insights_daily'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_owner', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)', t || '_owner', t);
  END LOOP;
END $$;

-- Resumo pro status em Contas (e pra quem for usar os dados depois).
CREATE OR REPLACE FUNCTION public.meta_ads_summary(p_user uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'businesses', (SELECT count(*) FROM public.meta_businesses WHERE user_id = p_user),
    'ad_accounts', (SELECT count(*) FROM public.meta_ad_accounts WHERE user_id = p_user),
    'campaigns', (SELECT count(*) FROM public.meta_campaigns WHERE user_id = p_user),
    'adsets', (SELECT count(*) FROM public.meta_adsets WHERE user_id = p_user),
    'ads', (SELECT count(*) FROM public.meta_ads WHERE user_id = p_user),
    'insight_rows', (SELECT count(*) FROM public.meta_ad_insights_daily WHERE user_id = p_user),
    'date_min', (SELECT min(date) FROM public.meta_ad_insights_daily WHERE user_id = p_user),
    'date_max', (SELECT max(date) FROM public.meta_ad_insights_daily WHERE user_id = p_user),
    'spend', (SELECT coalesce(jsonb_object_agg(currency, total), '{}'::jsonb) FROM (
      SELECT a.currency, round(sum(i.spend)::numeric, 2) total FROM public.meta_ad_insights_daily i
      JOIN public.meta_ad_accounts a ON a.user_id = i.user_id AND a.fb_account_id = i.fb_account_id
      WHERE i.user_id = p_user GROUP BY a.currency) s)
  );
$$;

-- Sincronização: a cada 30 min continua o histórico pendente; uma vez por dia
-- reprocessa os últimos 7 dias (a Meta ajusta números retroativamente).
SELECT cron.unschedule('meta-ads-sync') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'meta-ads-sync');
SELECT cron.schedule('meta-ads-sync', '*/30 * * * *', $cmd$
  select net.http_post(url := 'https://djlorvdehedcupeykyes.supabase.co/functions/v1/meta-ads-sync',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='service_role_key')),
    body := '{}'::jsonb, timeout_milliseconds := 150000);
$cmd$);
