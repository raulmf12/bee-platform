BEGIN;
DROP TRIGGER IF EXISTS trg_posts_protect_published ON public.user_posts;
DROP FUNCTION IF EXISTS public.protect_published();
COMMIT;
