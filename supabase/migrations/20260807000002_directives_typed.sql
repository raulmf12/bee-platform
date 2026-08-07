-- =====================================================================
-- DIRETRIZES TIPADAS — cada diretriz ganha um TIPO com função no prompt.
-- Deixa de ser texto plano: o gerador trata cada tipo diferente e a tela
-- renderiza cada um com forma própria (Do/Don't, fluxo numerado, checklist).
--
--   regra       — regra dura (pode ser inviolável)
--   evitar      — proibição explícita → DON'T duro
--   fortalecer  — o que priorizar → preferência
--   fluxo       — passo ordenado da estrutura
--   criterio    — critério de excelência → alimenta a AUTOCHECAGEM (QA)
--   parametro   — valor concreto (reservado; UI ainda não construída)
--
-- Aditiva + idempotente. Backfill classifica o seed atual pelo título.
-- =====================================================================

ALTER TABLE public.bee_directives
  ADD COLUMN IF NOT EXISTS tipo       TEXT NOT NULL DEFAULT 'regra',
  ADD COLUMN IF NOT EXISTS inviolavel BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bee_directives_tipo_chk') THEN
    ALTER TABLE public.bee_directives
      ADD CONSTRAINT bee_directives_tipo_chk
      CHECK (tipo IN ('regra', 'evitar', 'fortalecer', 'fluxo', 'criterio', 'parametro'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS bee_directives_tipo_idx
  ON public.bee_directives (scope, scope_ref, tipo, ordem);

-- ---------------------------------------------------------------------
-- Backfill: classifica o seed pelo título (determinístico, re-executável).
-- Ordem importa pouco (títulos são disjuntos), mas mantemos específico→geral.
-- ---------------------------------------------------------------------
UPDATE public.bee_directives SET tipo = 'evitar'
  WHERE titulo ILIKE '%evitar%';

UPDATE public.bee_directives SET tipo = 'fortalecer'
  WHERE titulo ILIKE '%fortalecer%';

UPDATE public.bee_directives SET tipo = 'fluxo'
  WHERE titulo ILIKE '%fluxo%' OR titulo ILIKE '%estrutura%';

UPDATE public.bee_directives SET tipo = 'criterio'
  WHERE titulo ILIKE '%critério%' OR titulo ILIKE '%criterio%';
