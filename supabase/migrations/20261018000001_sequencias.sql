-- Fase 4 · Conteúdos sequenciais — Etapa A (docs/identidade/Hive_Conteudos_Sequenciais_v1.md):
-- plano de peças por conteúdo-mãe, peça com páginas de ID estável (post_units = fonte canônica;
-- rendered_slides/carousel_fabric_json viram projeção de compatibilidade), roteiro aprovado antes
-- do visual, invalidação por página, aprovação final só com a sequência completa, candidatos por
-- página/sequência (serviço comum de ajustes) e capacidades por plataforma/formato em configuração.
BEGIN;

-- Capacidades por plataforma/formato (verificadas com data; nada fixo no modelo).
CREATE TABLE IF NOT EXISTS public.format_capabilities (
  platform text NOT NULL, format text NOT NULL,
  min_units integer NOT NULL DEFAULT 1, max_units integer NOT NULL DEFAULT 1, recommended_units int4range,
  width integer NOT NULL DEFAULT 1080, height integer NOT NULL DEFAULT 1350,
  export_kind text NOT NULL CHECK (export_kind IN ('image', 'images', 'pdf', 'video')),
  auto_publish boolean NOT NULL DEFAULT false,
  notes text, version integer NOT NULL DEFAULT 1, verified_at date NOT NULL,
  PRIMARY KEY (platform, format)
);
ALTER TABLE public.format_capabilities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS format_capabilities_read ON public.format_capabilities;
CREATE POLICY format_capabilities_read ON public.format_capabilities FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.format_capabilities TO authenticated;
GRANT ALL ON public.format_capabilities TO service_role;
INSERT INTO public.format_capabilities (platform, format, min_units, max_units, recommended_units, export_kind, auto_publish, notes, verified_at) VALUES
  ('instagram', 'image', 1, 1, '[1,1]', 'image', true, 'Publicação automática (Graph API, JPEG).', '2026-10-14'),
  ('linkedin', 'image', 1, 1, '[1,1]', 'image', true, 'Publicação automática (Posts API).', '2026-10-14'),
  ('instagram', 'carousel', 2, 10, '[5,8]', 'images', false, 'Etapa A: exportação das imagens em ordem; publicação automática de carrossel entra na etapa B.', '2026-10-14'),
  ('linkedin', 'carousel', 2, 20, '[6,10]', 'pdf', false, 'Etapa A: documento PDF exportado; publicação automática de documento entra na etapa B.', '2026-10-14')
ON CONFLICT (platform, format) DO NOTHING;

-- Plano de peças: cada desdobramento com ID próprio (retomada sem omitir nem duplicar).
CREATE TABLE IF NOT EXISTS public.content_piece_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content_id uuid NOT NULL REFERENCES public.contents(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE,
  cycle_id uuid REFERENCES public.campaign_cycles(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.social_accounts(id) ON DELETE SET NULL,
  platform text NOT NULL CHECK (platform IN ('linkedin', 'instagram')),
  format text NOT NULL CHECK (format IN ('image', 'carousel', 'story', 'reel')),
  approach text,                       -- abordagem (ex.: "dinâmica organizacional")
  purpose text,                        -- por que esta peça (explicação curta da Hive)
  architecture text,                   -- arquitetura narrativa sugerida (sequências)
  origin text NOT NULL DEFAULT 'user' CHECK (origin IN ('default', 'hive', 'user')),
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'produced', 'removed')),
  post_id uuid UNIQUE REFERENCES public.user_posts(id) ON DELETE SET NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_piece_plans_content ON public.content_piece_plans (content_id, position);

-- Peça: vínculo com o plano, roteiro, direção visual do conjunto, aprovação por versão, exportação.
ALTER TABLE public.user_posts
  ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES public.content_piece_plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS narrative_architecture text,
  ADD COLUMN IF NOT EXISTS script_status text CHECK (script_status IS NULL OR script_status IN ('draft', 'approved')),
  ADD COLUMN IF NOT EXISTS visual_direction jsonb,
  ADD COLUMN IF NOT EXISTS approved_version integer,
  ADD COLUMN IF NOT EXISTS export_package jsonb,
  ADD COLUMN IF NOT EXISTS source_content_at timestamptz;

-- Página/cena (fonte canônica da sequência). ID estável; posição separada da identidade.
CREATE TABLE IF NOT EXISTS public.post_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.user_posts(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position >= 1),
  function text,                       -- função narrativa (situação, descoberta, síntese…)
  title text,
  body text,
  visual_direction text,               -- direção visual da página
  layout text NOT NULL DEFAULT 'text' CHECK (layout IN ('cover', 'text', 'closing')),
  media_type text NOT NULL DEFAULT 'static_image' CHECK (media_type IN ('static_image', 'photo', 'video')),
  assets jsonb NOT NULL DEFAULT '{}'::jsonb,   -- recursos usados (foto/fundo/decisão da capa)
  fabric_json jsonb,
  rendered_url text,
  text_version integer NOT NULL DEFAULT 1,
  rendered_text_version integer,
  visual_status text NOT NULL DEFAULT 'pending' CHECK (visual_status IN ('pending', 'rendering', 'ready', 'failed', 'stale')),
  review_status text NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'approved', 'needs_review')),
  error text,
  -- Evolução (opcionais, não exigidos em peças estáticas): vídeo/Stories/interações.
  duration_ms integer, narration text, subtitles text, audio jsonb, transition text, alt_text text, interaction jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_post_units_position UNIQUE (post_id, position) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX IF NOT EXISTS idx_post_units_post ON public.post_units (post_id, position);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['content_piece_plans', 'post_units'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_all_own ON public.%1$s', t);
    EXECUTE format('CREATE POLICY %1$s_all_own ON public.%1$s TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- Regras por página NO BANCO: texto alterado → visual derivado fica desatualizado e a página volta
-- para revisão (reacomodar o texto NÃO autoriza outra imagem: os recursos da página são preservados).
-- Posição alterada → só refaz o visual se a direção usa numeração (elemento dependente da posição).
CREATE OR REPLACE FUNCTION public.post_units_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE numbering boolean;
BEGIN
  NEW.updated_at := now();
  IF NEW.title IS DISTINCT FROM OLD.title OR NEW.body IS DISTINCT FROM OLD.body THEN
    NEW.text_version := OLD.text_version + 1;
    NEW.review_status := 'pending';
    IF NEW.rendered_url IS NOT DISTINCT FROM OLD.rendered_url AND OLD.visual_status IN ('ready', 'failed') THEN NEW.visual_status := 'stale'; END IF;
  END IF;
  IF NEW.position IS DISTINCT FROM OLD.position AND NEW.rendered_url IS NOT DISTINCT FROM OLD.rendered_url AND OLD.visual_status = 'ready' THEN
    SELECT COALESCE((visual_direction->>'numbering')::boolean, false) INTO numbering FROM public.user_posts WHERE id = NEW.post_id;
    IF numbering THEN NEW.visual_status := 'stale'; NEW.review_status := 'pending'; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_post_units_guard ON public.post_units;
CREATE TRIGGER trg_post_units_guard BEFORE UPDATE ON public.post_units FOR EACH ROW EXECUTE FUNCTION public.post_units_guard();

-- Qualquer mudança nas páginas invalida a aprovação FINAL da peça (componentes idênticos mantêm a sua);
-- peça agendada não muda em silêncio: o pacote programado fica marcado como desatualizado.
CREATE OR REPLACE FUNCTION public.post_units_touch_post() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE pid uuid := COALESCE(NEW.post_id, OLD.post_id);
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.title IS NOT DISTINCT FROM OLD.title AND NEW.body IS NOT DISTINCT FROM OLD.body
     AND NEW.position IS NOT DISTINCT FROM OLD.position AND NEW.rendered_url IS NOT DISTINCT FROM OLD.rendered_url THEN
    RETURN NULL;                                     -- só estado de revisão/render: não invalida a peça
  END IF;
  UPDATE public.user_posts SET status = 'pending_approval', approved_version = NULL, image_approved = false
   WHERE id = pid AND status = 'approved';
  UPDATE public.user_posts SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"scheduled_outdated": true}'::jsonb
   WHERE id = pid AND status = 'scheduled';
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_post_units_touch_post ON public.post_units;
CREATE TRIGGER trg_post_units_touch_post AFTER INSERT OR UPDATE OR DELETE ON public.post_units FOR EACH ROW EXECUTE FUNCTION public.post_units_touch_post();

-- Pacote de uma versão passa a incluir as páginas (histórico, agendamento e exportação = mesmo pacote).
CREATE OR REPLACE FUNCTION public.piece_components(p public.user_posts) RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'quote', p.carousel_text->>'quote', 'caption', p.caption, 'carousel_text', p.carousel_text,
    'carousel_fabric_json', p.carousel_fabric_json, 'rendered_slides', p.rendered_slides, 'visual_decision', p.visual_decision,
    'image_ref', public.piece_image_ref(p.visual_decision, p.carousel_fabric_json),
    'variant', p.visual_decision->>'variant',
    'visual_direction', p.visual_direction,
    'units', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', u.id, 'position', u.position, 'function', u.function, 'title', u.title, 'body', u.body,
                         'layout', u.layout, 'assets', u.assets, 'rendered_url', u.rendered_url, 'text_version', u.text_version) ORDER BY u.position)
                       FROM public.post_units u WHERE u.post_id = p.id), '[]'::jsonb))
$$;

-- Projeção de compatibilidade: rendered_slides (slide1..N) e carousel_fabric_json na ordem atual.
CREATE OR REPLACE FUNCTION public.sync_unit_projection(pid uuid) RETURNS void LANGUAGE sql AS $$
  UPDATE public.user_posts p SET
    rendered_slides = COALESCE((SELECT jsonb_object_agg('slide' || u.position, u.rendered_url) FROM public.post_units u WHERE u.post_id = pid AND u.rendered_url IS NOT NULL), '{}'::jsonb),
    carousel_fabric_json = COALESCE((SELECT jsonb_agg(u.fabric_json ORDER BY u.position) FROM public.post_units u WHERE u.post_id = pid AND u.fabric_json IS NOT NULL), '[]'::jsonb)
  WHERE p.id = pid AND p.format = 'carousel'
$$;

-- Reordenar: IDs e recursos preservados; posição muda; versão nova; aprovação final invalidada.
CREATE OR REPLACE FUNCTION public.reorder_units(pid uuid, unit_ids uuid[]) RETURNS public.user_posts
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE p public.user_posts%ROWTYPE; n int;
BEGIN
  SELECT * INTO p FROM public.user_posts WHERE id = pid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Peça não encontrada' USING ERRCODE = 'PT404'; END IF;
  IF p.status = 'published' THEN RAISE EXCEPTION 'Peça publicada: o histórico não muda.' USING ERRCODE = 'PT409'; END IF;
  SELECT count(*) INTO n FROM public.post_units WHERE post_id = pid;
  IF n <> COALESCE(array_length(unit_ids, 1), 0) OR EXISTS (SELECT 1 FROM public.post_units u WHERE u.post_id = pid AND NOT u.id = ANY(unit_ids)) THEN
    RAISE EXCEPTION 'A nova ordem precisa conter exatamente as páginas atuais.' USING ERRCODE = 'PT400';
  END IF;
  INSERT INTO public.piece_versions (user_id, post_id, version, components, action) VALUES (p.user_id, p.id, p.version, public.piece_components(p), 'base')
  ON CONFLICT (post_id, version) DO NOTHING;
  UPDATE public.post_units u SET position = x.ord FROM unnest(unit_ids) WITH ORDINALITY AS x(uid, ord) WHERE u.id = x.uid AND u.post_id = pid AND u.position <> x.ord;
  PERFORM public.sync_unit_projection(pid);
  UPDATE public.user_posts SET version = version + 1, metadata = COALESCE(metadata, '{}'::jsonb) || '{"coherence_review": true}'::jsonb WHERE id = pid RETURNING * INTO p;
  INSERT INTO public.piece_versions (user_id, post_id, version, components, action) VALUES (p.user_id, p.id, p.version, public.piece_components(p), 'reorder');
  RETURN p;
END $$;
GRANT EXECUTE ON FUNCTION public.reorder_units(uuid, uuid[]) TO authenticated, service_role;

-- Candidato de páginas/sequência/legenda: só as páginas listadas e os componentes autorizados mudam.
-- proposal = { units: [{ id, title?, body?, fabric_json?, rendered_url?, assets? }], caption?, visual_direction? }
CREATE OR REPLACE FUNCTION public.apply_unit_candidate(cand_id uuid) RETURNS public.user_posts
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  c public.piece_candidates%ROWTYPE; p public.user_posts%ROWTYPE; u jsonb; cur public.post_units%ROWTYPE; m text[];
BEGIN
  SELECT * INTO c FROM public.piece_candidates WHERE id = cand_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proposta não encontrada' USING ERRCODE = 'PT404'; END IF;
  IF c.status = 'applied' THEN SELECT * INTO p FROM public.user_posts WHERE id = c.post_id; RETURN p; END IF;
  IF c.status <> 'ready' THEN RAISE EXCEPTION 'Proposta não está pronta (%)', c.status USING ERRCODE = 'PT409'; END IF;
  SELECT * INTO p FROM public.user_posts WHERE id = c.post_id FOR UPDATE;
  IF p.version <> c.base_version THEN
    RAISE EXCEPTION 'Conflito: a peça foi alterada depois desta proposta. Compare com a versão atual.' USING ERRCODE = 'PT409';
  END IF;
  m := c.mutable_paths;
  -- Validação de escopo e preservação (no banco, não só no prompt).
  FOR u IN SELECT * FROM jsonb_array_elements(COALESCE(c.proposal->'units', '[]'::jsonb)) LOOP
    IF NOT (u->>'id') = ANY(c.unit_ids) THEN RAISE EXCEPTION 'Proposta rejeitada: alterou página fora da seleção.' USING ERRCODE = 'PT422'; END IF;
    SELECT * INTO cur FROM public.post_units WHERE id = (u->>'id')::uuid AND post_id = p.id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Proposta rejeitada: página inexistente.' USING ERRCODE = 'PT422'; END IF;
    IF NOT ('text' = ANY(m)) AND ((u ? 'title' AND (u->>'title') IS DISTINCT FROM cur.title) OR (u ? 'body' AND (u->>'body') IS DISTINCT FROM cur.body)) THEN
      RAISE EXCEPTION 'Proposta rejeitada: alterou o texto preservado.' USING ERRCODE = 'PT422';
    END IF;
    IF NOT ('image' = ANY(m)) AND u ? 'assets' AND (u->'assets'->>'image_ref') IS DISTINCT FROM (cur.assets->>'image_ref') THEN
      RAISE EXCEPTION 'Proposta rejeitada: trocou a imagem preservada.' USING ERRCODE = 'PT422';
    END IF;
  END LOOP;
  IF NOT ('caption' = ANY(m)) AND c.proposal ? 'caption' AND (c.proposal->>'caption') IS DISTINCT FROM p.caption THEN
    RAISE EXCEPTION 'Proposta rejeitada: alterou a legenda preservada.' USING ERRCODE = 'PT422';
  END IF;

  INSERT INTO public.piece_versions (user_id, post_id, version, components, action) VALUES (p.user_id, p.id, p.version, public.piece_components(p), 'base')
  ON CONFLICT (post_id, version) DO NOTHING;
  FOR u IN SELECT * FROM jsonb_array_elements(COALESCE(c.proposal->'units', '[]'::jsonb)) LOOP
    UPDATE public.post_units x SET
      title = CASE WHEN u ? 'title' THEN u->>'title' ELSE x.title END,
      body = CASE WHEN u ? 'body' THEN u->>'body' ELSE x.body END,
      assets = CASE WHEN u ? 'assets' THEN u->'assets' ELSE x.assets END,
      fabric_json = CASE WHEN u ? 'fabric_json' THEN u->'fabric_json' ELSE x.fabric_json END,
      rendered_url = CASE WHEN u ? 'rendered_url' THEN u->>'rendered_url' ELSE x.rendered_url END,
      rendered_text_version = CASE WHEN u ? 'rendered_url' THEN x.text_version + CASE WHEN (u ? 'title' AND (u->>'title') IS DISTINCT FROM x.title) OR (u ? 'body' AND (u->>'body') IS DISTINCT FROM x.body) THEN 1 ELSE 0 END ELSE x.rendered_text_version END,
      visual_status = CASE WHEN u ? 'rendered_url' THEN 'ready' ELSE x.visual_status END,
      review_status = 'pending'
    WHERE x.id = (u->>'id')::uuid;
  END LOOP;
  PERFORM public.sync_unit_projection(p.id);
  UPDATE public.user_posts SET
    caption = CASE WHEN c.proposal ? 'caption' THEN c.proposal->>'caption' ELSE caption END,
    visual_direction = CASE WHEN c.proposal ? 'visual_direction' THEN c.proposal->'visual_direction' ELSE visual_direction END,
    metadata = COALESCE(metadata, '{}'::jsonb) || CASE WHEN c.proposal ? 'caption' THEN '{"legenda_status":"pending"}'::jsonb ELSE '{}'::jsonb END
              || CASE WHEN 'text' = ANY(m) THEN '{"coherence_review": true}'::jsonb ELSE '{}'::jsonb END,
    status = CASE WHEN status = 'approved' THEN 'pending_approval' ELSE status END,
    approved_version = CASE WHEN status = 'approved' THEN NULL ELSE approved_version END,
    version = version + 1, updated_at = now()
  WHERE id = p.id RETURNING * INTO p;
  IF p.status = 'scheduled' THEN UPDATE public.user_posts SET metadata = metadata || '{"scheduled_outdated": true}'::jsonb WHERE id = p.id RETURNING * INTO p; END IF;
  INSERT INTO public.piece_versions (user_id, post_id, version, components, action, candidate_id) VALUES (p.user_id, p.id, p.version, public.piece_components(p), c.action, c.id);
  UPDATE public.piece_candidates SET status = 'applied', applied_at = now(), error = NULL WHERE id = c.id;
  RETURN p;
END $$;
GRANT EXECUTE ON FUNCTION public.apply_unit_candidate(uuid) TO authenticated, service_role;

-- Aprovação final: só com roteiro aprovado, TODAS as páginas prontas e aprovadas e legenda.
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
  IF COALESCE(trim(p.caption), '') = '' THEN RAISE EXCEPTION 'Peça incompleta: falta a legenda.' USING ERRCODE = 'PT422'; END IF;
  PERFORM public.sync_unit_projection(pid);
  UPDATE public.user_posts SET status = 'approved', approved_version = version, image_status = 'approved', image_approved = true, text_approved = true,
         metadata = COALESCE(metadata, '{}'::jsonb) - 'coherence_review' || '{"review_stage":"done","legenda_status":"approved"}'::jsonb
   WHERE id = pid RETURNING * INTO p;
  INSERT INTO public.piece_versions (user_id, post_id, version, components, action) VALUES (p.user_id, p.id, p.version, public.piece_components(p), 'approve')
  ON CONFLICT (post_id, version) DO UPDATE SET components = EXCLUDED.components, action = 'approve';
  RETURN p;
END $$;
GRANT EXECUTE ON FUNCTION public.approve_sequence(uuid) TO authenticated, service_role;

-- Conteúdo-mãe alterado depois do desdobramento: sinaliza as peças derivadas (sem sobrescrever).
CREATE OR REPLACE FUNCTION public.flag_derived_pieces() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.body IS DISTINCT FROM OLD.body THEN
    UPDATE public.user_posts SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"source_outdated": true}'::jsonb
     WHERE content_id = NEW.id AND piece_role = 'unfold' AND status NOT IN ('published', 'archived') AND source_content_at IS NOT NULL AND source_content_at < now();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_contents_flag_derived ON public.contents;
CREATE TRIGGER trg_contents_flag_derived AFTER UPDATE OF body ON public.contents FOR EACH ROW EXECUTE FUNCTION public.flag_derived_pieces();

-- Exportação de sequências: o bucket de mídia passa a aceitar o pacote (PDF do LinkedIn, ZIP de imagens).
UPDATE storage.buckets SET allowed_mime_types = ARRAY['image/*', 'video/*', 'application/pdf', 'application/zip']
 WHERE id = 'media' AND NOT ('application/pdf' = ANY(COALESCE(allowed_mime_types, '{}')));

COMMIT;
