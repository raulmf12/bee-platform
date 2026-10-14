-- Fase 2 · Ajustes e alternativas de peças (docs/identidade/Hive_Ajustes_e_Alternativas_de_Pecas_v1.md).
-- Toda mudança vira CANDIDATO sobre uma versão-base; só ao APLICAR a peça ativa muda.
-- A aplicação valida no banco: versão-base (conflito), componentes preservados (texto exato,
-- mesmo recurso de imagem) e invalida só as aprovações afetadas. Agendada fica presa à
-- versão programada até atualização explícita.
BEGIN;

ALTER TABLE public.user_posts
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS scheduled_version integer;

-- Pacote congelado de cada versão (histórico, restauração e publicação da versão programada).
CREATE TABLE IF NOT EXISTS public.piece_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.user_posts(id) ON DELETE CASCADE,
  version integer NOT NULL,
  components jsonb NOT NULL,           -- quote, caption, carousel_text, carousel_fabric_json, rendered_slides, visual_decision, image_ref
  approvals jsonb NOT NULL DEFAULT '{}'::jsonb,
  action text,
  candidate_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, version)
);

CREATE TABLE IF NOT EXISTS public.piece_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.user_posts(id) ON DELETE CASCADE,
  operation_id text NOT NULL,          -- idempotência: o mesmo pedido não duplica
  base_version integer NOT NULL,
  base_candidate_id uuid REFERENCES public.piece_candidates(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('adjust_text', 'swap_image', 'swap_template', 'explore_visual', 'other_approach', 'vary_both', 'restore')),
  mutable_paths text[] NOT NULL,       -- quote | caption | image | visual
  scope text NOT NULL DEFAULT 'piece' CHECK (scope IN ('piece', 'caption', 'units', 'sequence')),
  unit_ids text[] NOT NULL DEFAULT '{}',
  field_paths text[] NOT NULL DEFAULT '{}',
  instruction text,
  selected_template_id text,
  selected_asset jsonb,
  preserved jsonb NOT NULL,            -- valores/refs congelados dos componentes preservados
  proposal jsonb,                      -- novos valores SÓ dos componentes mutáveis
  diff jsonb,
  affected_components text[] NOT NULL DEFAULT '{}',
  impact text,                         -- impacto explícito (ex.: template novo exige imagem)
  status text NOT NULL DEFAULT 'generating' CHECK (status IN ('generating', 'ready', 'applied', 'discarded', 'failed', 'conflict', 'rejected')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz,
  UNIQUE (user_id, operation_id)
);
CREATE INDEX IF NOT EXISTS idx_piece_candidates_post ON public.piece_candidates (post_id, created_at DESC);

-- Referência do recurso de imagem ativo (identidade, não aparência): decisão visual ou 1ª imagem não-espiral.
CREATE OR REPLACE FUNCTION public.piece_image_ref(vd jsonb, fabric jsonb) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(
    vd->>'image_ref',
    vd->'asset'->>'url',
    (SELECT o->>'src' FROM jsonb_array_elements(COALESCE(fabric->0->'objects', '[]'::jsonb)) o
      WHERE o->>'type' IN ('Image', 'image') AND COALESCE(o->>'src', '') NOT ILIKE '%espiral%' AND COALESCE(o->>'src', '') NOT ILIKE '%spiral%'
      LIMIT 1)
  )
$$;

CREATE OR REPLACE FUNCTION public.piece_components(p public.user_posts) RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'quote', p.carousel_text->>'quote', 'caption', p.caption, 'carousel_text', p.carousel_text,
    'carousel_fabric_json', p.carousel_fabric_json, 'rendered_slides', p.rendered_slides, 'visual_decision', p.visual_decision,
    'image_ref', public.piece_image_ref(p.visual_decision, p.carousel_fabric_json),
    'variant', p.visual_decision->>'variant')
$$;

CREATE OR REPLACE FUNCTION public.apply_piece_candidate(cand_id uuid) RETURNS public.user_posts
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  c public.piece_candidates%ROWTYPE;
  p public.user_posts%ROWTYPE;
  cur jsonb; prop jsonb; m text[];
  quote_changed boolean; caption_changed boolean; image_changed boolean; visual_changed boolean;
  meta jsonb;
BEGIN
  SELECT * INTO c FROM public.piece_candidates WHERE id = cand_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proposta não encontrada' USING ERRCODE = 'no_data_found'; END IF;
  IF c.status = 'applied' THEN SELECT * INTO p FROM public.user_posts WHERE id = c.post_id; RETURN p; END IF; -- idempotente
  IF c.status <> 'ready' THEN RAISE EXCEPTION 'Proposta não está pronta (%)', c.status USING ERRCODE = 'check_violation'; END IF;
  SELECT * INTO p FROM public.user_posts WHERE id = c.post_id FOR UPDATE;
  IF p.version <> c.base_version THEN
    UPDATE public.piece_candidates SET status = 'conflict', error = format('A peça mudou (v%s) depois desta proposta (base v%s).', p.version, c.base_version) WHERE id = c.id;
    RAISE EXCEPTION 'Conflito: a peça foi alterada depois desta proposta. Compare com a versão atual.' USING ERRCODE = 'PT409'; -- 40001 faz o PostgREST repetir em laço
  END IF;
  cur := public.piece_components(p);
  prop := COALESCE(c.proposal, '{}'::jsonb);
  m := c.mutable_paths;

  -- Preservação NO BANCO (não só no prompt): componente fora de mutable_paths não pode mudar.
  IF NOT ('quote' = ANY(m)) AND prop ? 'quote' AND (prop->>'quote') IS DISTINCT FROM (cur->>'quote') THEN
    UPDATE public.piece_candidates SET status = 'rejected', error = 'A proposta alterou o texto, que deveria ser preservado.' WHERE id = c.id;
    RAISE EXCEPTION 'Proposta rejeitada: alterou o texto preservado.' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT ('caption' = ANY(m)) AND prop ? 'caption' AND (prop->>'caption') IS DISTINCT FROM (cur->>'caption') THEN
    UPDATE public.piece_candidates SET status = 'rejected', error = 'A proposta alterou a legenda, que deveria ser preservada.' WHERE id = c.id;
    RAISE EXCEPTION 'Proposta rejeitada: alterou a legenda preservada.' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT ('image' = ANY(m)) AND prop ? 'image_ref' AND (prop->>'image_ref') IS DISTINCT FROM (cur->>'image_ref') THEN
    UPDATE public.piece_candidates SET status = 'rejected', error = 'A proposta trocou a imagem, que deveria ser preservada.' WHERE id = c.id;
    RAISE EXCEPTION 'Proposta rejeitada: trocou a imagem preservada.' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT ('visual' = ANY(m)) AND NOT ('quote' = ANY(m)) AND NOT ('image' = ANY(m)) AND prop ? 'variant' AND (prop->>'variant') IS DISTINCT FROM (cur->>'variant') THEN
    UPDATE public.piece_candidates SET status = 'rejected', error = 'A proposta trocou o template, que deveria ser preservado.' WHERE id = c.id;
    RAISE EXCEPTION 'Proposta rejeitada: trocou o template preservado.' USING ERRCODE = 'check_violation';
  END IF;

  -- Guarda a versão atual (histórico/restauração/publicação programada).
  INSERT INTO public.piece_versions (user_id, post_id, version, components, approvals, action)
  VALUES (p.user_id, p.id, p.version, cur,
          jsonb_build_object('text', p.text_approved, 'image', p.image_approved, 'image_status', p.image_status, 'status', p.status,
                             'titulo', p.metadata->>'titulo_status', 'legenda', p.metadata->>'legenda_status'), 'base')
  ON CONFLICT (post_id, version) DO NOTHING;

  quote_changed := prop ? 'quote' AND (prop->>'quote') IS DISTINCT FROM (cur->>'quote');
  caption_changed := prop ? 'caption' AND (prop->>'caption') IS DISTINCT FROM (cur->>'caption');
  image_changed := prop ? 'image_ref' AND (prop->>'image_ref') IS DISTINCT FROM (cur->>'image_ref');
  visual_changed := prop ? 'rendered_slides' AND (prop->'rendered_slides') IS DISTINCT FROM (cur->'rendered_slides');

  meta := COALESCE(p.metadata, '{}'::jsonb);
  IF quote_changed THEN meta := meta || '{"titulo_status":"pending"}'::jsonb; END IF;
  IF caption_changed THEN meta := meta || '{"legenda_status":"pending"}'::jsonb; END IF;
  IF image_changed THEN meta := meta || '{"bg_approved":false}'::jsonb; END IF;
  IF p.status = 'scheduled' AND (quote_changed OR caption_changed OR visual_changed) THEN
    meta := meta || '{"scheduled_outdated":true}'::jsonb;   -- o pacote programado continua o anterior
  END IF;
  meta := meta || jsonb_build_object('last_operation', jsonb_build_object('action', c.action, 'candidate_id', c.id, 'at', now()));

  UPDATE public.user_posts SET
    carousel_text = CASE WHEN quote_changed THEN jsonb_set(COALESCE(carousel_text, '{}'::jsonb), '{quote}', to_jsonb(prop->>'quote')) ELSE carousel_text END,
    caption = CASE WHEN caption_changed THEN prop->>'caption' ELSE caption END,
    carousel_fabric_json = CASE WHEN prop ? 'carousel_fabric_json' THEN prop->'carousel_fabric_json' ELSE carousel_fabric_json END,
    rendered_slides = CASE WHEN prop ? 'rendered_slides' THEN prop->'rendered_slides' ELSE rendered_slides END,
    visual_decision = CASE WHEN prop ? 'visual_decision' THEN prop->'visual_decision' ELSE visual_decision END,
    -- Aprovação por componente: só o que mudou volta para revisão.
    text_approved = CASE WHEN quote_changed OR caption_changed THEN false ELSE text_approved END,
    image_approved = CASE WHEN image_changed THEN false ELSE image_approved END,
    image_status = CASE WHEN image_changed OR visual_changed THEN 'pending' ELSE image_status END,
    status = CASE WHEN status = 'approved' AND (quote_changed OR caption_changed OR visual_changed) THEN 'pending_approval' ELSE status END,
    scheduled_version = CASE WHEN status = 'scheduled' THEN COALESCE(scheduled_version, version) ELSE scheduled_version END,
    version = version + 1,
    metadata = meta
  WHERE id = p.id
  RETURNING * INTO p;

  INSERT INTO public.piece_versions (user_id, post_id, version, components, approvals, action, candidate_id)
  VALUES (p.user_id, p.id, p.version, public.piece_components(p),
          jsonb_build_object('text', p.text_approved, 'image', p.image_approved, 'image_status', p.image_status, 'status', p.status), c.action, c.id)
  ON CONFLICT (post_id, version) DO NOTHING;
  UPDATE public.piece_candidates SET status = 'applied', applied_at = now(), error = NULL WHERE id = c.id;
  RETURN p;
END $$;
GRANT EXECUTE ON FUNCTION public.apply_piece_candidate(uuid) TO authenticated, service_role;

-- "Atualizar o agendamento": a versão atual passa a ser a programada (ação explícita).
CREATE OR REPLACE FUNCTION public.update_scheduled_package(pid uuid) RETURNS public.user_posts
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE p public.user_posts%ROWTYPE;
BEGIN
  UPDATE public.user_posts SET scheduled_version = version, metadata = COALESCE(metadata, '{}'::jsonb) - 'scheduled_outdated'
   WHERE id = pid RETURNING * INTO p;
  RETURN p;
END $$;
GRANT EXECUTE ON FUNCTION public.update_scheduled_package(uuid) TO authenticated, service_role;

-- Agendar fixa o pacote programado; sair do agendamento solta.
CREATE OR REPLACE FUNCTION public.pin_scheduled_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'scheduled' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'scheduled') THEN
    NEW.scheduled_version := NEW.version;
    NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb) - 'scheduled_outdated';
  ELSIF NEW.status NOT IN ('scheduled', 'published') AND TG_OP = 'UPDATE' AND OLD.status = 'scheduled' THEN
    NEW.scheduled_version := NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_posts_pin_scheduled ON public.user_posts;
CREATE TRIGGER trg_posts_pin_scheduled BEFORE INSERT OR UPDATE OF status ON public.user_posts FOR EACH ROW EXECUTE FUNCTION public.pin_scheduled_version();
-- Agendadas existentes: fixa a versão atual.
ALTER TABLE public.user_posts DISABLE TRIGGER trg_user_posts_updated;
UPDATE public.user_posts SET scheduled_version = version WHERE status = 'scheduled' AND scheduled_version IS NULL;
ALTER TABLE public.user_posts ENABLE TRIGGER trg_user_posts_updated;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['piece_versions','piece_candidates'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_all_own ON public.%1$s', t);
    EXECUTE format('CREATE POLICY %1$s_all_own ON public.%1$s TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;
DROP TRIGGER IF EXISTS trg_piece_candidates_updated ON public.piece_candidates;
CREATE TRIGGER trg_piece_candidates_updated BEFORE UPDATE ON public.piece_candidates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMIT;
