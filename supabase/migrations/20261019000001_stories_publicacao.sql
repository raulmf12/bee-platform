-- Fase 5 · Conteúdos sequenciais — Etapa B (Stories e distribuição): Stories Instagram, publicação
-- automática por formato (carrossel IG, documento PDF no LinkedIn, Stories IG) e registro de
-- publicação por VERSÃO e DESTINO, com resultado por unidade para Stories (retomada ordenada).
BEGIN;

-- Capacidades verificadas (2026-10-14): carrossel IG até 10 itens via contêineres; documento no
-- LinkedIn (Documents API + Posts API); Stories IG por imagem (media_type=STORIES), uma por vez.
UPDATE public.format_capabilities SET auto_publish = true, version = version + 1, verified_at = '2026-10-14',
  notes = 'Publicação automática: um contêiner por página + contêiner CAROUSEL (Graph API). Exportação das imagens continua disponível.'
 WHERE platform = 'instagram' AND format = 'carousel';
UPDATE public.format_capabilities SET auto_publish = true, version = version + 1, verified_at = '2026-10-14',
  notes = 'Publicação automática como documento PDF (Documents API + Posts API, exige w_member_social). O PDF publicado é o mesmo pacote exportado.'
 WHERE platform = 'linkedin' AND format = 'carousel';
INSERT INTO public.format_capabilities (platform, format, min_units, max_units, recommended_units, width, height, export_kind, auto_publish, notes, verified_at) VALUES
  ('instagram', 'story', 1, 10, '[3,6]', 1080, 1920, 'images', true,
   'Stories por imagem (media_type=STORIES), publicados um a um na ordem. Figurinhas/enquetes não existem na API: interação planejada é executada manualmente.', '2026-10-14')
ON CONFLICT (platform, format) DO UPDATE SET auto_publish = EXCLUDED.auto_publish, width = EXCLUDED.width, height = EXCLUDED.height, notes = EXCLUDED.notes, verified_at = EXCLUDED.verified_at;

-- Ocorrência de distribuição: versão aprovada + destino (rede:conta). Estado e IDs externos separados dos arquivos.
CREATE TABLE IF NOT EXISTS public.post_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.user_posts(id) ON DELETE CASCADE,
  version integer NOT NULL,
  destination text NOT NULL,
  platform text NOT NULL, account_id uuid, format text NOT NULL,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'published', 'partial', 'failed')),
  units_total integer NOT NULL DEFAULT 1, units_published integer NOT NULL DEFAULT 0,
  external_id text, url text, error text,
  started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
  UNIQUE (post_id, version, destination)
);
-- Resultado por unidade (Stories): ordem preservada; retomada não repete as publicadas.
CREATE TABLE IF NOT EXISTS public.post_unit_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id uuid NOT NULL REFERENCES public.post_publications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.user_posts(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL,
  position integer NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'failed')),
  external_id text, error text, published_at timestamptz,
  UNIQUE (publication_id, unit_id)
);
CREATE INDEX IF NOT EXISTS idx_post_publications_post ON public.post_publications (post_id, started_at DESC);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['post_publications', 'post_unit_publications'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_read_own ON public.%1$s', t);
    -- Leitura pelo dono; escrita só pelo publicador (service role).
    EXECUTE format('CREATE POLICY %1$s_read_own ON public.%1$s FOR SELECT TO authenticated USING (auth.uid() = user_id)', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- Stories: unidades 9:16 (capa/encerramento compostos pelo mesmo sistema visual).
ALTER TABLE public.content_piece_plans DROP CONSTRAINT IF EXISTS content_piece_plans_format_check;
ALTER TABLE public.content_piece_plans ADD CONSTRAINT content_piece_plans_format_check CHECK (format IN ('image', 'carousel', 'story', 'reel'));

-- Aprovação final: Stories sem legenda.
CREATE OR REPLACE FUNCTION public.approve_sequence(pid uuid) RETURNS public.user_posts
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE p public.user_posts%ROWTYPE; cap public.format_capabilities%ROWTYPE; n int; bad int;
BEGIN
  SELECT * INTO p FROM public.user_posts WHERE id = pid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Peça não encontrada' USING ERRCODE = 'PT404'; END IF;
  IF p.script_status IS DISTINCT FROM 'approved' THEN RAISE EXCEPTION 'Aprove o roteiro antes.' USING ERRCODE = 'PT422'; END IF;
  SELECT * INTO cap FROM public.format_capabilities WHERE platform = p.platform AND format = p.format;
  SELECT count(*), count(*) FILTER (WHERE visual_status <> 'ready' OR rendered_url IS NULL OR review_status <> 'approved') INTO n, bad FROM public.post_units WHERE post_id = pid;
  IF n = 0 OR (cap.platform IS NOT NULL AND (n < cap.min_units OR n > cap.max_units)) THEN
    RAISE EXCEPTION 'Sequência incompleta: % página(s) (permitido % a %).', n, cap.min_units, cap.max_units USING ERRCODE = 'PT422';
  END IF;
  IF bad > 0 THEN RAISE EXCEPTION 'Peça incompleta: % página(s) sem visual pronto ou sem aprovação.', bad USING ERRCODE = 'PT422'; END IF;
  -- Stories não têm legenda; as demais sequências exigem.
  IF p.format <> 'story' AND COALESCE(trim(p.caption), '') = '' THEN RAISE EXCEPTION 'Peça incompleta: falta a legenda.' USING ERRCODE = 'PT422'; END IF;
  PERFORM public.sync_unit_projection(pid);
  UPDATE public.user_posts SET status = 'approved', approved_version = version, image_status = 'approved', image_approved = true, text_approved = true,
         metadata = COALESCE(metadata, '{}'::jsonb) - 'coherence_review' || '{"review_stage":"done","legenda_status":"approved"}'::jsonb
   WHERE id = pid RETURNING * INTO p;
  INSERT INTO public.piece_versions (user_id, post_id, version, components, action) VALUES (p.user_id, p.id, p.version, public.piece_components(p), 'approve')
  ON CONFLICT (post_id, version) DO UPDATE SET components = EXCLUDED.components, action = 'approve';
  RETURN p;
END $$;

COMMIT;
