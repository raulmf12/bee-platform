-- Campanhas F4: metadata do conteúdo-mãe (ids da geração/variação pristina da IA
-- pro ciclo de aprendizado, rodadas de ajuste, QA). Aditivo.
ALTER TABLE public.contents ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
