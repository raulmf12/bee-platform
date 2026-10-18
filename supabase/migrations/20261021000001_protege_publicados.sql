-- Estabilização E1-A (doc 01 §4.1 · HIVE-EST-01): uma peça publicada permanece no histórico.
-- Nenhum caminho (agenda, editor, aba desatualizada, chamada direta) a devolve para aprovado/rascunho/agendado
-- nem muda a data dela. Arquivar continua permitido (decisão de 18/10: preserva o histórico e não reabre envio).
-- A regra lê o registro PERSISTIDO (OLD), não o que o navegador acha.
BEGIN;

CREATE OR REPLACE FUNCTION public.protect_published() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'published' OR (OLD.status = 'archived' AND OLD.published_at IS NOT NULL) THEN
    IF NEW.status NOT IN ('published', 'archived') THEN
      RAISE EXCEPTION 'Este conteúdo já foi publicado e permanece no histórico.' USING ERRCODE = 'PT409';
    END IF;
    IF NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date THEN
      RAISE EXCEPTION 'Este conteúdo já foi publicado e permanece no histórico: a data não pode ser alterada.' USING ERRCODE = 'PT409';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_posts_protect_published ON public.user_posts;
CREATE TRIGGER trg_posts_protect_published BEFORE UPDATE OF status, scheduled_date ON public.user_posts
  FOR EACH ROW EXECUTE FUNCTION public.protect_published();

COMMIT;
