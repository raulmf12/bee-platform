-- Retorno do E3: remove a invalidação automática e os comandos de aprovação. Planos e medições ficam.
BEGIN;
DROP TRIGGER IF EXISTS trg_posts_invalidate_on_edit ON public.user_posts;
DROP FUNCTION IF EXISTS public.invalidate_on_edit();
DROP FUNCTION IF EXISTS public.approve_piece(uuid, text, boolean);
DROP FUNCTION IF EXISTS public.merge_post_review(uuid, jsonb, jsonb);
COMMIT;
