-- Memória anti-repetição: o que JÁ foi dito (posts publicados/programados/aprovados,
-- importados do Instagram e do LinkedIn) vira embedding. A pauta e a escrita consultam
-- por SIGNIFICADO, não por título — e sem janela de 90 dias.
-- Poucas centenas/milhares de linhas por usuário: busca exata (sem índice aproximado).
BEGIN;

CREATE TABLE IF NOT EXISTS public.content_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id uuid UNIQUE REFERENCES public.user_posts(id) ON DELETE CASCADE,
  platform text,
  origin text NOT NULL DEFAULT 'platform' CHECK (origin IN ('platform', 'instagram_import', 'linkedin_import')),
  text text NOT NULL,
  said_at timestamptz,
  text_hash text NOT NULL,
  embedding vector(1536) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_content_memory_user ON public.content_memory (user_id, said_at DESC);

ALTER TABLE public.content_memory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS content_memory_all_own ON public.content_memory;
CREATE POLICY content_memory_all_own ON public.content_memory TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_memory TO authenticated;
GRANT ALL ON public.content_memory TO service_role;

-- Vizinhos mais próximos do que já foi dito (cosseno), excluindo o próprio post.
CREATE OR REPLACE FUNCTION public.match_content_memory(query_embedding vector, filter_user_id uuid, match_count integer DEFAULT 5, exclude_post uuid DEFAULT NULL)
RETURNS TABLE(post_id uuid, platform text, origin text, text text, said_at timestamptz, similarity double precision)
LANGUAGE sql STABLE AS $$
  SELECT m.post_id, m.platform, m.origin, m.text, m.said_at, (1 - (m.embedding <=> query_embedding))::float AS similarity
    FROM public.content_memory m
   WHERE m.user_id = filter_user_id AND (exclude_post IS NULL OR m.post_id IS DISTINCT FROM exclude_post)
   ORDER BY m.embedding <=> query_embedding ASC
   LIMIT match_count
$$;
GRANT EXECUTE ON FUNCTION public.match_content_memory(vector, uuid, integer, uuid) TO authenticated, service_role;

COMMIT;

-- Ideia que o guardião ainda achou parecida com algo publicado (aviso na pauta).
ALTER TABLE public.ideas ADD COLUMN IF NOT EXISTS repeat_of jsonb;
