-- Integracoes de publicacao direta (LinkedIn + Instagram).
-- - user_settings ganha campos pros tokens e IDs por plataforma
-- - user_posts ganha campos de tracking do estado de publicacao
--
-- Tokens armazenados em texto plano. RLS protege por user_id.
-- Pra uso interno apenas. Se evoluir pra multi-tenant publico, mover pra Vault.

-- --------- USER_SETTINGS — credenciais de publicacao ---------

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS linkedin_author_urn TEXT,
  ADD COLUMN IF NOT EXISTS instagram_access_token TEXT,
  ADD COLUMN IF NOT EXISTS instagram_business_account_id TEXT;

COMMENT ON COLUMN public.user_settings.linkedin_token IS 'LinkedIn OAuth access_token (60d valid). Use scope w_member_social.';
COMMENT ON COLUMN public.user_settings.linkedin_author_urn IS 'URN pra postar: urn:li:person:{member_id} ou urn:li:organization:{page_id}';
COMMENT ON COLUMN public.user_settings.instagram_access_token IS 'Page Access Token long-lived (sem expiracao se gerado via System User).';
COMMENT ON COLUMN public.user_settings.instagram_business_account_id IS 'IG Business Account ID — pega via GET /{page_id}?fields=instagram_business_account';

-- --------- USER_POSTS — tracking de publish ---------

ALTER TABLE public.user_posts
  ADD COLUMN IF NOT EXISTS published_url TEXT,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS publish_error TEXT,
  ADD COLUMN IF NOT EXISTS publish_attempts INT DEFAULT 0;

COMMENT ON COLUMN public.user_posts.published_url IS 'URL do post publicado na plataforma (ex: linkedin.com/posts/...).';
COMMENT ON COLUMN public.user_posts.published_at IS 'Timestamp da publicacao bem-sucedida.';
COMMENT ON COLUMN public.user_posts.publish_error IS 'Ultima mensagem de erro de publicacao (para debug).';
COMMENT ON COLUMN public.user_posts.publish_attempts IS 'Quantas tentativas de publicacao foram feitas.';
