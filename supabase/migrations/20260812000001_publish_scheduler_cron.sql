-- Agendador de publicação: cron que publica os posts agendados vencidos.
-- Chama a edge function publish-scheduler a cada 2 minutos. A função roda com
-- a service_role e publica SÓ o que já venceu (status='scheduled' e
-- scheduled_date <= now, em UTC).
--
-- IMPORTANTE (bug corrigido em 2026-09-01): o gateway do Supabase EXIGE um JWT
-- válido no header Authorization (retorna 401 UNAUTHORIZED_INVALID_JWT_FORMAT
-- se vier 'Bearer ' vazio) — a função NÃO está realmente como --no-verify-jwt.
-- A versão antiga lia current_setting('app.service_role_key'), que nunca foi
-- setado (ALTER DATABASE é negado pro role do cron), então TODO post agendado
-- falhava silenciosamente. Agora lemos a service_role key do Vault.
--
-- Pré-requisito (feito fora da migration, pois a chave não pode ir pro repo):
--   select vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key', 'pg_cron -> edge functions');
-- Sem esse secret no Vault, o cron volta a mandar 'Bearer ' vazio e falha.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('publish-scheduler')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'publish-scheduler');

SELECT cron.schedule(
  'publish-scheduler',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://djlorvdehedcupeykyes.supabase.co/functions/v1/publish-scheduler',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
