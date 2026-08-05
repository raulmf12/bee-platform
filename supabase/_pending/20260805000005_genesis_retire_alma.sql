-- =====================================================================
-- GENESIS — Fase 3: aposenta o modelo da "Alma" (a psique)
-- =====================================================================
-- O Genesis agora governa o agente (Camada 0 do generate-content) e o
-- frontend /genesis substituiu a página /alma. Estas tabelas ficaram órfãs.
--
-- MANTÉM public.alma_eventos: é o barramento de eventos, ainda usado por
-- almaApi.emitEvento (que agora move genesis_dimensoes) e pela edge function
-- generate-content (emitAlmaEvent). Só o namespace da PSIQUE sai.
--
-- ⚠️ COORDENAÇÃO: rodar SOMENTE depois que o frontend com a página /genesis
-- estiver publicado (Netlify). A /alma antiga lê estas tabelas; dropar antes
-- do deploy quebra aquela página ao vivo. É idempotente (IF EXISTS).
--
-- Dados perdidos = apenas seed (recriável). CASCADE remove as policies/constraints.
-- =====================================================================

DROP TABLE IF EXISTS public.alma_crencas   CASCADE;  -- crenças/complexos
DROP TABLE IF EXISTS public.alma_sombra    CASCADE;  -- mecanismos de defesa
DROP TABLE IF EXISTS public.alma_pulsoes   CASCADE;  -- pulsões (o "Isso")
DROP TABLE IF EXISTS public.alma_objetivo  CASCADE;  -- objetivo vivo → genesis_core.missao
DROP TABLE IF EXISTS public.alma_estado    CASCADE;  -- humor/estado singleton
DROP TABLE IF EXISTS public.alma_dimensoes CASCADE;  -- 6 dimensões → genesis_dimensoes
