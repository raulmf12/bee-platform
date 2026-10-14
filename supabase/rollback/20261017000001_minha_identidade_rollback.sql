-- Rollback da Fase 3 (Minha identidade). Não desfaz versões/perfis criados por sessões ativadas.
BEGIN;
DROP FUNCTION IF EXISTS public.activate_setup_session(uuid, text);
DROP FUNCTION IF EXISTS public._setup_ref(jsonb, text);
DROP FUNCTION IF EXISTS public._setup_arr(jsonb);
DROP FUNCTION IF EXISTS public.profile_composition(uuid);
DROP TRIGGER IF EXISTS trg_setup_sessions_updated ON public.setup_sessions;
ALTER TABLE public.setup_sessions DROP COLUMN IF EXISTS title, DROP COLUMN IF EXISTS reviews, DROP COLUMN IF EXISTS calibrations, DROP COLUMN IF EXISTS activated_at;
ALTER TABLE public.campaigns DROP COLUMN IF EXISTS profile_version;
ALTER TABLE public.bee_editorials DROP COLUMN IF EXISTS front_id, DROP COLUMN IF EXISTS territorio, DROP COLUMN IF EXISTS perguntas,
  DROP COLUMN IF EXISTS material, DROP COLUMN IF EXISTS exemplo, DROP COLUMN IF EXISTS curation_status;
COMMIT;
