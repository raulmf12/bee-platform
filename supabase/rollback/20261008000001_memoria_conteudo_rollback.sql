BEGIN;
DROP FUNCTION IF EXISTS public.match_content_memory(vector, uuid, integer, uuid);
DROP TABLE IF EXISTS public.content_memory;
ALTER TABLE public.ideas DROP COLUMN IF EXISTS repeat_of;
COMMIT;
