-- TRÁFEGO PAGO · atribuição anúncio → conta do Instagram (aditiva).
-- Os anúncios vivem nas CONTAS DE ANÚNCIO (LS6D…), não nas contas do IG. A edge
-- `meta-ads-attribution` descobre a conta do Instagram de cada anúncio pelo
-- criativo (instagram_user_id; senão a Página que veiculou → IG dessa Página) e
-- grava aqui, pra tela de comparativo não depender de chamadas à Graph API.
ALTER TABLE public.meta_ads
  ADD COLUMN IF NOT EXISTS ig_account_id text,         -- id da conta IG (instagram_business_account_id)
  ADD COLUMN IF NOT EXISTS ig_username text,           -- @ atual da conta
  ADD COLUMN IF NOT EXISTS fb_page_id text,            -- Página que veiculou (actor)
  ADD COLUMN IF NOT EXISTS attribution_source text,    -- creative_instagram_user | page_instagram | unresolved
  ADD COLUMN IF NOT EXISTS attributed_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_meta_ads_ig_account ON public.meta_ads (user_id, ig_account_id);
