-- =====================================================================
-- RAG INFRASTRUCTURE — pgvector + knowledge_documents + knowledge_chunks
-- =====================================================================

-- 1. Habilita extensao vector (pgvector)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Documentos ingeridos (metadata)
CREATE TABLE IF NOT EXISTS public.knowledge_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  source_type   TEXT,
  source_size   INT,
  chunk_count   INT DEFAULT 0,
  is_global     BOOLEAN DEFAULT FALSE,
  metadata      JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Chunks de cada documento (com embeddings)
CREATE TABLE IF NOT EXISTS public.knowledge_chunks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   UUID REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  chunk_index   INT NOT NULL,
  content       TEXT NOT NULL,
  tokens        INT,
  embedding     VECTOR(1536),
  metadata      JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chunks_user ON public.knowledge_chunks(user_id);
CREATE INDEX IF NOT EXISTS idx_chunks_doc  ON public.knowledge_chunks(document_id);

-- Indice vetorial pra busca semantica (cosine similarity)
-- Usa ivfflat com 100 listas (bom pra ate 100k chunks).
CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON public.knowledge_chunks
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- 4. Funcao RPC pra busca semantica
CREATE OR REPLACE FUNCTION public.match_knowledge(
  query_embedding   VECTOR(1536),
  match_count       INT DEFAULT 5,
  match_threshold   FLOAT DEFAULT 0.3,
  filter_user_id    UUID DEFAULT NULL
)
RETURNS TABLE (
  id          UUID,
  document_id UUID,
  document_title TEXT,
  content     TEXT,
  similarity  FLOAT,
  metadata    JSONB
)
LANGUAGE sql STABLE AS $$
  SELECT
    kc.id,
    kc.document_id,
    kd.title AS document_title,
    kc.content,
    (1 - (kc.embedding <=> query_embedding))::FLOAT AS similarity,
    kc.metadata
  FROM public.knowledge_chunks kc
  JOIN public.knowledge_documents kd ON kd.id = kc.document_id
  WHERE
    (filter_user_id IS NULL OR kc.user_id = filter_user_id OR kd.is_global = TRUE)
    AND 1 - (kc.embedding <=> query_embedding) > match_threshold
  ORDER BY kc.embedding <=> query_embedding ASC
  LIMIT match_count;
$$;

-- 5. RLS
ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_chunks    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kb_docs_select"     ON public.knowledge_documents;
DROP POLICY IF EXISTS "kb_docs_insert_own" ON public.knowledge_documents;
DROP POLICY IF EXISTS "kb_docs_update_own" ON public.knowledge_documents;
DROP POLICY IF EXISTS "kb_docs_delete_own" ON public.knowledge_documents;

CREATE POLICY "kb_docs_select"     ON public.knowledge_documents FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR is_global = TRUE);
CREATE POLICY "kb_docs_insert_own" ON public.knowledge_documents FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "kb_docs_update_own" ON public.knowledge_documents FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "kb_docs_delete_own" ON public.knowledge_documents FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "kb_chunks_select"     ON public.knowledge_chunks;
DROP POLICY IF EXISTS "kb_chunks_insert_own" ON public.knowledge_chunks;
DROP POLICY IF EXISTS "kb_chunks_delete_own" ON public.knowledge_chunks;

CREATE POLICY "kb_chunks_select"     ON public.knowledge_chunks FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "kb_chunks_insert_own" ON public.knowledge_chunks FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "kb_chunks_delete_own" ON public.knowledge_chunks FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- 6. Trigger updated_at
DROP TRIGGER IF EXISTS trg_knowledge_documents_updated ON public.knowledge_documents;
CREATE TRIGGER trg_knowledge_documents_updated
  BEFORE UPDATE ON public.knowledge_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
