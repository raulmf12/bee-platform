-- Agendador de publicação: cron que publica os posts agendados vencidos.
-- Chama a edge function publish-scheduler a cada 2 minutos. A função roda com
-- a service_role e publica SÓ o que já venceu (status='scheduled' e
-- scheduled_date <= now, em UTC). publish-scheduler é deployada com
-- --no-verify-jwt pra o pg_net conseguir chamar (mesmo padrão do
-- editorial-line-tick). O Authorization abaixo é opcional (a função não exige),
-- mas mantemos por consistência caso app.service_role_key esteja setado.

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
      'Authorization', 'Bearer ' || coalesce(current_setting('app.service_role_key', true), '')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
