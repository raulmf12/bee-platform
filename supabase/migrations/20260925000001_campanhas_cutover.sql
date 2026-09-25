-- CUTOVER da estrutura de Campanhas (docs/PLANO-CAMPANHAS.md §6, fase F9).
-- Idempotente e transacional. Aplicada via SQL (mesmo caminho das migrações desde
-- 20260812 — o histórico remoto da CLI não as registra; NÃO usar `db push`).
-- Rollback: supabase/rollback/20260925000001_campanhas_cutover_rollback.sql
--
-- 1. Contas principais "via Integrações": cada usuário com credenciais em
--    user_settings ganha a conta de LinkedIn/Instagram SEM copiar token (a
--    publicação lê de user_settings — fonte única, renovada pelo instagram-refresh).
-- 2. Histórico vira conteúdo "Sem campanha" (D14): 1 conteúdo por grupo lógico
--    (reaproveitamento metadata.reused_from / companion_post_id), peças mantêm
--    status, agendamento e conta (account_id NÃO é tocado: publicação idêntica).
-- 3. Linhas editoriais encerradas (dados preservados, status anterior guardado);
--    cron editorial-line-tick sai; entram campaign-tick e metrics-ingest.

BEGIN;

CREATE SCHEMA IF NOT EXISTS cutover;  -- fora do PostgREST (não exposto)
REVOKE ALL ON SCHEMA cutover FROM anon, authenticated;

-- ---------------------------------------------------------------- 1. contas
INSERT INTO public.social_accounts (user_id, platform, label, is_default, status, linkedin_author_urn, metadata)
SELECT s.user_id, 'linkedin', COALESCE(NULLIF(split_part(p.name, ' ', 1), ''), 'Principal'),
       NOT EXISTS (SELECT 1 FROM public.social_accounts x WHERE x.user_id = s.user_id AND x.platform = 'linkedin' AND x.is_default),
       'connected', s.linkedin_author_urn, jsonb_build_object('source', 'integrations', 'created_by', 'cutover-20260925')
FROM public.user_settings s LEFT JOIN public.profiles p ON p.id = s.user_id
WHERE s.linkedin_token IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.social_accounts x WHERE x.user_id = s.user_id AND x.platform = 'linkedin' AND x.metadata->>'source' = 'integrations');

INSERT INTO public.social_accounts (user_id, platform, label, is_default, status, instagram_business_account_id, metadata)
SELECT s.user_id, 'instagram', COALESCE(NULLIF(split_part(p.name, ' ', 1), ''), 'Principal'),
       NOT EXISTS (SELECT 1 FROM public.social_accounts x WHERE x.user_id = s.user_id AND x.platform = 'instagram' AND x.is_default),
       'connected', s.instagram_business_account_id, jsonb_build_object('source', 'integrations', 'created_by', 'cutover-20260925')
FROM public.user_settings s LEFT JOIN public.profiles p ON p.id = s.user_id
WHERE s.instagram_access_token IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.social_accounts x WHERE x.user_id = s.user_id AND x.platform = 'instagram' AND x.metadata->>'source' = 'integrations');

-- Rótulo = nome da persona (o perfil de login do Marcos é o e-mail do operador).
-- Aplicado em 2026-09-25 logo após o cutover:
--   update social_accounts set label='Marcos' where user_id='dfa11979-…' and metadata->>'created_by'='cutover-20260925';

-- ------------------------------------------------------ 2. histórico → conteúdos
CREATE TEMP TABLE _cut_roots ON COMMIT DROP AS
WITH RECURSIVE base AS (
  SELECT p.id, p.user_id,
    COALESCE(CASE WHEN p.metadata->>'reused_from' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                  THEN (p.metadata->>'reused_from')::uuid END, p.companion_post_id) AS parent
  FROM public.user_posts p
  WHERE p.status <> 'archived' AND p.content_id IS NULL AND p.cycle_id IS NULL
), walk AS (
  SELECT b.id, b.user_id, b.id AS cur, b.parent, 0 AS depth FROM base b
  UNION ALL
  SELECT w.id, w.user_id, b.id, b.parent, w.depth + 1
  FROM walk w JOIN base b ON b.id = w.parent AND b.user_id = w.user_id
  WHERE w.depth < 20
), terminal AS (
  SELECT DISTINCT ON (w.id) w.id, w.cur FROM walk w
  WHERE w.parent IS NULL OR NOT EXISTS (SELECT 1 FROM base b WHERE b.id = w.parent)
  ORDER BY w.id, w.depth
)
SELECT b.id, b.user_id, COALESCE(t.cur, (SELECT min(w.cur::text)::uuid FROM walk w WHERE w.id = b.id)) AS root
FROM base b LEFT JOIN terminal t ON t.id = b.id;

INSERT INTO public.contents (user_id, title, editorial_slug, body, status, metadata, created_at, updated_at)
SELECT r.user_id,
       COALESCE(NULLIF(rp.carousel_text->>'quote', ''), NULLIF(rp.title, ''), left(rp.caption, 90), 'Post'),
       rp.metadata->>'editorial_slug',
       jsonb_strip_nulls(jsonb_build_object('frase', NULLIF(rp.carousel_text->>'quote', ''), 'texto', rp.caption)),
       CASE WHEN bool_or(p.status IN ('approved', 'scheduled', 'published')) THEN 'validated' ELSE 'pending_validation' END,
       jsonb_build_object('backfill', 'cutover-20260925', 'root_post_id', r.root, 'source_posts', jsonb_agg(p.id ORDER BY p.created_at)),
       min(p.created_at), now()
FROM _cut_roots r
JOIN public.user_posts p ON p.id = r.id
JOIN public.user_posts rp ON rp.id = r.root
GROUP BY r.user_id, r.root, rp.carousel_text, rp.title, rp.caption, rp.metadata;

UPDATE public.user_posts p SET content_id = c.id
FROM _cut_roots r
JOIN public.contents c ON c.metadata->>'backfill' = 'cutover-20260925' AND (c.metadata->>'root_post_id')::uuid = r.root AND c.user_id = r.user_id
WHERE p.id = r.id AND p.content_id IS NULL;

-- ------------------------------------------ 3. linhas editoriais + crons
CREATE TABLE IF NOT EXISTS cutover.editorial_lines_status (id uuid PRIMARY KEY, status text NOT NULL, saved_at timestamptz NOT NULL DEFAULT now());
INSERT INTO cutover.editorial_lines_status (id, status)
SELECT id, status FROM public.editorial_lines WHERE status <> 'ended'
ON CONFLICT (id) DO NOTHING;
UPDATE public.editorial_lines SET status = 'ended' WHERE status IN ('active', 'paused', 'draft');

CREATE TABLE IF NOT EXISTS cutover.cron_jobs (jobname text PRIMARY KEY, schedule text NOT NULL, command text NOT NULL, saved_at timestamptz NOT NULL DEFAULT now());
INSERT INTO cutover.cron_jobs (jobname, schedule, command)
SELECT jobname, schedule, command FROM cron.job WHERE jobname = 'editorial-line-tick'
ON CONFLICT (jobname) DO NOTHING;
SELECT cron.unschedule('editorial-line-tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'editorial-line-tick');

-- 06:00 e 06:30 de Brasília. Mesmo padrão de auth dos crons existentes (Vault).
SELECT cron.schedule('campaign-tick', '0 9 * * *', $cmd$
  select net.http_post(url := 'https://djlorvdehedcupeykyes.supabase.co/functions/v1/campaign-tick',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='service_role_key')),
    body := '{}'::jsonb, timeout_milliseconds := 150000);
$cmd$);
SELECT cron.schedule('metrics-ingest', '30 9 * * *', $cmd$
  select net.http_post(url := 'https://djlorvdehedcupeykyes.supabase.co/functions/v1/metrics-ingest',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='service_role_key')),
    body := '{}'::jsonb, timeout_milliseconds := 60000);
$cmd$);

COMMIT;
