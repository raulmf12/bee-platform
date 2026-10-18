-- Retorno da fundação E2. ATENÇÃO (doc 01 §10 / 03 §21): não executar enquanto houver agendamentos com
-- scheduled_package_id ou operações em post_publications com stage reserved/sending/unknown — conferir antes.
-- Pacotes e resultados de publicação NÃO são apagados (as tabelas ficam; só as funções novas saem).
BEGIN;
DROP FUNCTION IF EXISTS public.commit_schedule(uuid, uuid, uuid, text, timestamptz, uuid, integer, text, uuid);
DROP FUNCTION IF EXISTS public.acquire_publication(uuid, uuid, uuid, text, uuid, integer);
DROP FUNCTION IF EXISTS public.mark_publication_sending(uuid, uuid);
DROP FUNCTION IF EXISTS public.confirm_publication(uuid, text, text, integer);
DROP FUNCTION IF EXISTS public.fail_publication(uuid, boolean, text, text, integer);
DROP FUNCTION IF EXISTS public.reconcile_publication(uuid, boolean, text);
DROP FUNCTION IF EXISTS public.register_manual_publication(uuid, text);
DROP FUNCTION IF EXISTS public.expire_publication_leases();
DROP FUNCTION IF EXISTS public.piece_readiness(uuid, text);
DROP TRIGGER IF EXISTS trg_piece_versions_append_only ON public.piece_versions;
DROP FUNCTION IF EXISTS public.piece_versions_append_only();
DROP INDEX IF EXISTS public.uq_post_publications_active;
COMMIT;
