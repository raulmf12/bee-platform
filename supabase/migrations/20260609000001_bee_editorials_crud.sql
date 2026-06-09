-- ---------------------------------------------------------------------
-- bee_editorials: CRUD pela UI (gerenciar os 8 pilares + criar novos)
-- ---------------------------------------------------------------------
-- Ate aqui bee_editorials era read-only (seed via migration, gravacao so
-- via service-role). Esta migration:
--   1. Adiciona is_system pra marcar os 8 editoriais oficiais (seedados).
--   2. Abre policies de INSERT/UPDATE pra authenticated.
--   3. Abre DELETE apenas pra editoriais NAO-oficiais (is_system = false),
--      protegendo os 8 originais (apagar faz CASCADE em bee_arsenal e
--      bee_example_posts).
-- ---------------------------------------------------------------------

-- 1. Coluna is_system -----------------------------------------------------
ALTER TABLE public.bee_editorials
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE;

-- Marca os 8 editoriais oficiais como sistema (protegidos contra delete).
UPDATE public.bee_editorials
SET is_system = TRUE
WHERE slug IN (
  'diagnostico-sistemico',
  'historia-pessoal-vulneravel',
  'depoimento-narrativizado',
  'case-anonimizado',
  'provocacao-de-crenca',
  'bastidor-da-bee',
  'reflexao-filosofica-curta',
  'trecho-livro-contextualizado'
);

-- 2. Policies de gravacao -------------------------------------------------
-- Tabela global (sem user_id): conteudo editorial compartilhado pelo time.
-- Ferramenta interna -> qualquer authenticated gerencia.
DROP POLICY IF EXISTS "bee_editorials_insert" ON public.bee_editorials;
CREATE POLICY "bee_editorials_insert" ON public.bee_editorials
  FOR INSERT TO authenticated
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS "bee_editorials_update" ON public.bee_editorials;
CREATE POLICY "bee_editorials_update" ON public.bee_editorials
  FOR UPDATE TO authenticated
  USING (TRUE)
  WITH CHECK (TRUE);

-- DELETE so para editoriais criados pelo usuario (nao-oficiais).
DROP POLICY IF EXISTS "bee_editorials_delete" ON public.bee_editorials;
CREATE POLICY "bee_editorials_delete" ON public.bee_editorials
  FOR DELETE TO authenticated
  USING (is_system = FALSE);
