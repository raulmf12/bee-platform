-- ---------------------------------------------------------------------
-- METODOLOGIA VIVA: lifecycle no arsenal/exemplos + fila de sugestoes
-- ---------------------------------------------------------------------
-- Torna bee_arsenal e bee_example_posts "vivos":
--   - is_active: liga/desliga sem apagar
--   - usage_count / last_used_at: a geracao rotaciona o material e evita
--     repetir (mesma ideia do flag `used` das analogias, generalizada)
--   - performance_score: sinal de feedback (favorito/publicado/edicao)
--   - source_type / source_id: proveniencia (de onde o item nasceu)
-- E cria bee_suggestions: a FILA DE CURADORIA. Material minerado pela IA
-- (de cortes de podcast, docs, posts) entra aqui como 'pending' e so vira
-- arsenal/exemplo/analogia DE VERDADE quando um humano aprova.
-- ---------------------------------------------------------------------

-- 1. Lifecycle no ARSENAL ----------------------------------------------
ALTER TABLE public.bee_arsenal
  ADD COLUMN IF NOT EXISTS is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS usage_count       INT         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_used_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS performance_score NUMERIC     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_type       TEXT,
  ADD COLUMN IF NOT EXISTS source_id         UUID;

CREATE INDEX IF NOT EXISTS idx_arsenal_rotation
  ON public.bee_arsenal(editorial_slug, is_active, last_used_at NULLS FIRST);

-- 2. Lifecycle nos EXAMPLE_POSTS ---------------------------------------
ALTER TABLE public.bee_example_posts
  ADD COLUMN IF NOT EXISTS is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS usage_count       INT         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_used_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS performance_score NUMERIC     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_type       TEXT,
  ADD COLUMN IF NOT EXISTS source_id         UUID,
  ADD COLUMN IF NOT EXISTS created_at        TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_examples_rotation
  ON public.bee_example_posts(editorial_slug, is_active, last_used_at NULLS FIRST);

-- 3. FILA DE SUGESTOES (curadoria humana) ------------------------------
CREATE TABLE IF NOT EXISTS public.bee_suggestions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- o que esta sendo sugerido
  kind              TEXT NOT NULL CHECK (kind IN ('arsenal','example_post','analogy')),
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected')),
  editorial_slug    TEXT REFERENCES public.bee_editorials(slug) ON DELETE SET NULL,
  -- conteudo do candidato (forma depende do kind) — editavel antes de aprovar
  payload           JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- proveniencia
  source_type       TEXT,                       -- podcast_clip | document | post | manual
  source_id         UUID,
  source_excerpt    TEXT,                        -- trecho que originou (contexto p/ revisor)
  confidence        NUMERIC DEFAULT 0,           -- 0..1, palpite da IA
  -- ciclo de revisao
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at       TIMESTAMPTZ,
  approved_target_id UUID,                       -- id do registro criado ao aprovar
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suggestions_status ON public.bee_suggestions(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_suggestions_editorial ON public.bee_suggestions(editorial_slug);
-- Evita reprocessar o mesmo trecho da mesma fonte virando sugestao duplicada.
CREATE UNIQUE INDEX IF NOT EXISTS idx_suggestions_dedup
  ON public.bee_suggestions(kind, source_type, source_id, md5(coalesce(source_excerpt,'')))
  WHERE source_id IS NOT NULL;

-- 4. RLS ---------------------------------------------------------------
-- Tabelas globais (metodologia compartilhada pelo time). Ferramenta interna
-- -> qualquer authenticated le e gerencia (mesmo padrao de bee_editorials).
ALTER TABLE public.bee_suggestions ENABLE ROW LEVEL SECURITY;

-- arsenal: ja tinha _read; abre escrita.
DROP POLICY IF EXISTS "bee_arsenal_insert" ON public.bee_arsenal;
CREATE POLICY "bee_arsenal_insert" ON public.bee_arsenal FOR INSERT TO authenticated WITH CHECK (TRUE);
DROP POLICY IF EXISTS "bee_arsenal_update" ON public.bee_arsenal;
CREATE POLICY "bee_arsenal_update" ON public.bee_arsenal FOR UPDATE TO authenticated USING (TRUE) WITH CHECK (TRUE);
DROP POLICY IF EXISTS "bee_arsenal_delete" ON public.bee_arsenal;
CREATE POLICY "bee_arsenal_delete" ON public.bee_arsenal FOR DELETE TO authenticated USING (TRUE);

-- example_posts: idem.
DROP POLICY IF EXISTS "bee_example_posts_insert" ON public.bee_example_posts;
CREATE POLICY "bee_example_posts_insert" ON public.bee_example_posts FOR INSERT TO authenticated WITH CHECK (TRUE);
DROP POLICY IF EXISTS "bee_example_posts_update" ON public.bee_example_posts;
CREATE POLICY "bee_example_posts_update" ON public.bee_example_posts FOR UPDATE TO authenticated USING (TRUE) WITH CHECK (TRUE);
DROP POLICY IF EXISTS "bee_example_posts_delete" ON public.bee_example_posts;
CREATE POLICY "bee_example_posts_delete" ON public.bee_example_posts FOR DELETE TO authenticated USING (TRUE);

-- analogies: abre escrita (aprovar sugestao de analogia + marcar used).
DROP POLICY IF EXISTS "bee_analogies_insert" ON public.bee_analogies;
CREATE POLICY "bee_analogies_insert" ON public.bee_analogies FOR INSERT TO authenticated WITH CHECK (TRUE);
DROP POLICY IF EXISTS "bee_analogies_update" ON public.bee_analogies;
CREATE POLICY "bee_analogies_update" ON public.bee_analogies FOR UPDATE TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- suggestions: leitura + gestao pra authenticated.
DROP POLICY IF EXISTS "bee_suggestions_all" ON public.bee_suggestions;
CREATE POLICY "bee_suggestions_all" ON public.bee_suggestions FOR ALL TO authenticated
  USING (TRUE) WITH CHECK (TRUE);

-- 5. Helper: incrementa uso de um item (chamado pela geracao) ----------
CREATE OR REPLACE FUNCTION public.bump_arsenal_usage(p_id UUID)
RETURNS VOID AS $$
  UPDATE public.bee_arsenal
  SET usage_count = usage_count + 1, last_used_at = NOW()
  WHERE id = p_id;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION public.bump_example_usage(p_id UUID)
RETURNS VOID AS $$
  UPDATE public.bee_example_posts
  SET usage_count = usage_count + 1, last_used_at = NOW()
  WHERE id = p_id;
$$ LANGUAGE sql;
