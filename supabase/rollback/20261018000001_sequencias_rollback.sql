-- Rollback da Fase 4 (sequências). Peças de carrossel criadas continuam em user_posts (format='carousel').
BEGIN;
DROP TRIGGER IF EXISTS trg_contents_flag_derived ON public.contents;
DROP FUNCTION IF EXISTS public.flag_derived_pieces();
DROP FUNCTION IF EXISTS public.approve_sequence(uuid);
DROP FUNCTION IF EXISTS public.apply_unit_candidate(uuid);
DROP FUNCTION IF EXISTS public.reorder_units(uuid, uuid[]);
DROP FUNCTION IF EXISTS public.sync_unit_projection(uuid);
DROP TABLE IF EXISTS public.post_units;
DROP FUNCTION IF EXISTS public.post_units_guard();
DROP FUNCTION IF EXISTS public.post_units_touch_post();
ALTER TABLE public.user_posts DROP COLUMN IF EXISTS plan_id, DROP COLUMN IF EXISTS narrative_architecture, DROP COLUMN IF EXISTS script_status,
  DROP COLUMN IF EXISTS visual_direction, DROP COLUMN IF EXISTS approved_version, DROP COLUMN IF EXISTS export_package, DROP COLUMN IF EXISTS source_content_at;
DROP TABLE IF EXISTS public.content_piece_plans;
DROP TABLE IF EXISTS public.format_capabilities;
-- piece_components volta à versão da Fase 2 (reaplicar 20261016000001_ajustes_pecas.sql, função piece_components).
COMMIT;
