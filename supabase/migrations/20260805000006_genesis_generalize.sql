-- =====================================================================
-- GENESIS — Generalização (rumo ao multi-nicho / Fase 4)
-- =====================================================================
-- Torna os nomes agnósticos de empresa: o que era específico da Bee vira
-- container plugável que qualquer expert preenche.
--   • genesis_dimensoes  → genesis_lentes  ("as 6 Dimensões Sistêmicas" da Bee
--     viram apenas UM preenchimento de "Lentes"; outro expert define as suas).
--   • genesis_paradigmas → genesis_tensoes ("Javé/Cristo" viram apenas UMA
--     tensão; cada expert nomeia as suas polaridades).
-- Princípios: mantêm o nome; a generalização das categorias é só de rótulo
-- (feita no app/prompt), sem mexer nos slugs internos.
--
-- Idempotente (renomeia só se ainda não foi renomeado).
-- =====================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='genesis_dimensoes')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='genesis_lentes') THEN
    ALTER TABLE public.genesis_dimensoes RENAME TO genesis_lentes;
    RAISE NOTICE '[genesis] genesis_dimensoes → genesis_lentes';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='genesis_paradigmas')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='genesis_tensoes') THEN
    ALTER TABLE public.genesis_paradigmas RENAME TO genesis_tensoes;
    RAISE NOTICE '[genesis] genesis_paradigmas → genesis_tensoes';
  END IF;
END $$;
