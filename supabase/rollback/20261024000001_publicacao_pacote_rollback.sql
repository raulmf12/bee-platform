-- Retorno do E4 (banco): volta update_scheduled_package ao comportamento antigo. As funções novas de
-- publicação NÃO devem ser revertidas para o publicador antigo enquanto houver agendamentos com
-- scheduled_package_id (doc 03 §21): suspender o envio em vez disso.
BEGIN;
CREATE OR REPLACE FUNCTION public.update_scheduled_package(pid uuid) RETURNS public.user_posts
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE p public.user_posts%ROWTYPE;
BEGIN
  UPDATE public.user_posts SET scheduled_version = version, metadata = COALESCE(metadata, '{}'::jsonb) - 'scheduled_outdated'
   WHERE id = pid RETURNING * INTO p;
  RETURN p;
END $$;
COMMIT;
