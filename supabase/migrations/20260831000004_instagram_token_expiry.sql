-- Botão Conectar Instagram + refresh: guarda a validade do token longo.
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS instagram_token_expires_at TIMESTAMPTZ;
