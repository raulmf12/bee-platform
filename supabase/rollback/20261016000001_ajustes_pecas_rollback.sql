BEGIN;
DROP TRIGGER IF EXISTS trg_posts_pin_scheduled ON public.user_posts;
DROP FUNCTION IF EXISTS public.pin_scheduled_version(), public.update_scheduled_package(uuid), public.apply_piece_candidate(uuid),
  public.piece_components(public.user_posts), public.piece_image_ref(jsonb, jsonb);
DROP TABLE IF EXISTS public.piece_candidates, public.piece_versions;
ALTER TABLE public.user_posts DROP COLUMN IF EXISTS scheduled_version, DROP COLUMN IF EXISTS version;
COMMIT;
