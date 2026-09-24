-- Código BEE-DDMMAA-G{global}-D{dia} gerado NO BANCO quando a peça chega sem código.
-- Motivo: a produção de campanhas insere peças em paralelo; calcular no cliente
-- (contar posts e somar 1) gerava códigos DUPLICADOS. Aqui um advisory lock por
-- usuário serializa a contagem dentro da transação do INSERT → sequência única.
-- Quem já manda o código (fluxo antigo) não é afetado.
CREATE OR REPLACE FUNCTION public.user_posts_fill_codigo() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_global int;
  v_day int;
BEGIN
  IF NEW.codigo IS NOT NULL AND NEW.codigo <> '' THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('user_posts_codigo:' || NEW.user_id::text));
  SELECT count(*) + 1 INTO v_global FROM public.user_posts WHERE user_id = NEW.user_id;
  SELECT count(*) + 1 INTO v_day FROM public.user_posts
    WHERE user_id = NEW.user_id AND (created_at AT TIME ZONE 'America/Sao_Paulo')::date = v_today;
  NEW.codigo := 'BEE-' || to_char(v_today, 'DDMMYY') || '-G' || v_global || '-D' || v_day;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_posts_fill_codigo ON public.user_posts;
CREATE TRIGGER trg_user_posts_fill_codigo BEFORE INSERT ON public.user_posts
  FOR EACH ROW EXECUTE FUNCTION public.user_posts_fill_codigo();
