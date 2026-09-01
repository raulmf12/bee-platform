-- Cron diário: renova os tokens longos do Instagram antes de vencer.
SELECT cron.unschedule('instagram-refresh') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'instagram-refresh');
SELECT cron.schedule(
  'instagram-refresh',
  '17 4 * * *',
  $$
  SELECT net.http_post(
    url := 'https://djlorvdehedcupeykyes.supabase.co/functions/v1/instagram-refresh',
    -- lê a service_role key do Vault (ver 20260812000001_publish_scheduler_cron.sql).
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
