-- Cron diário: renova os tokens longos do Instagram antes de vencer.
SELECT cron.unschedule('instagram-refresh') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'instagram-refresh');
SELECT cron.schedule(
  'instagram-refresh',
  '17 4 * * *',
  $$
  SELECT net.http_post(
    url := 'https://djlorvdehedcupeykyes.supabase.co/functions/v1/instagram-refresh',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || coalesce(current_setting('app.service_role_key', true), '')),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
