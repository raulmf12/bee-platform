-- ROLLBACK do cutover de Campanhas (20260925000001). Volta o banco ao estado
-- anterior SEM perder o que foi criado depois nas tabelas novas por uso real
-- (só desfaz o que o cutover marcou). Transacional.
BEGIN;

-- 3. crons e linhas editoriais
SELECT cron.unschedule('campaign-tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'campaign-tick');
SELECT cron.unschedule('metrics-ingest') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'metrics-ingest');
SELECT cron.schedule(jobname, schedule, command) FROM cutover.cron_jobs WHERE jobname = 'editorial-line-tick'
  AND NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'editorial-line-tick');
UPDATE public.editorial_lines e SET status = b.status FROM cutover.editorial_lines_status b WHERE b.id = e.id;

-- 2. conteúdos do histórico: peças voltam a não ter conteúdo; os conteúdos marcados saem
UPDATE public.user_posts p SET content_id = NULL
FROM public.contents c
WHERE p.content_id = c.id AND c.metadata->>'backfill' = 'cutover-20260925';
DELETE FROM public.contents WHERE metadata->>'backfill' = 'cutover-20260925';

-- 1. contas "via Integrações" criadas pelo cutover (peças que já as usam ficam sem conta
--    → publicam por user_settings, exatamente como antes)
DELETE FROM public.social_accounts WHERE metadata->>'created_by' = 'cutover-20260925';

COMMIT;
