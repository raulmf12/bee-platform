-- Estabilização E3 — aprovação durável e agenda (doc 02 §4–§13).
--   merge_post_review  — grava decisões de revisão MESCLANDO no servidor (nunca o metadata inteiro de uma cópia
--                        antiga) e confere que o texto aprovado é o mesmo que está gravado
--   approve_piece      — "Aprovar peça" (imagem única/vídeo): confirma o visual APRESENTADO e pronto; não tira
--                        a peça da agenda
--   invalidate_on_edit — editar uma peça aprovada volta a pendente SÓ o componente alterado (decisão de 18/10)
--   schedule_plans     — plano em lote durável (resultado por linha sobrevive a recarregar a página)
--   ai_measurement_events — medição da IA recuperável, fora do caminho da aprovação
BEGIN;

CREATE OR REPLACE FUNCTION public.sha256_text(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(extensions.digest(convert_to(COALESCE(t, ''), 'UTF8'), 'sha256'), 'hex')
$$;

-- Texto de cada componente revisável (mesma leitura no cliente).
CREATE OR REPLACE FUNCTION public.review_component_text(p public.user_posts, comp text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT CASE comp WHEN 'titulo' THEN COALESCE(p.carousel_text->>'quote', p.title, '') WHEN 'legenda' THEN COALESCE(p.caption, '') END
$$;

-- p_patch: campos de revisão a mesclar (ex.: {"titulo_status":"approved"}). p_expect: {componente: sha256 do texto
-- apresentado} — se o texto mudou (outra aba, autosave), recusa em vez de aprovar a versão nova por acidente.
CREATE OR REPLACE FUNCTION public.merge_post_review(p_post uuid, p_patch jsonb, p_expect jsonb DEFAULT '{}'::jsonb) RETURNS public.user_posts
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE p public.user_posts%ROWTYPE; k text; allowed text[] := ARRAY['titulo_status', 'legenda_status', 'review_stage', 'imagem_status'];
BEGIN
  SELECT * INTO p FROM public.user_posts WHERE id = p_post FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Peça não encontrada.' USING ERRCODE = 'PT404'; END IF;
  FOR k IN SELECT jsonb_object_keys(p_patch) LOOP
    IF NOT (k = ANY (allowed)) THEN RAISE EXCEPTION 'Campo de revisão desconhecido: %', k USING ERRCODE = 'PT422'; END IF;
  END LOOP;
  FOR k IN SELECT jsonb_object_keys(COALESCE(p_expect, '{}'::jsonb)) LOOP
    IF public.sha256_text(public.review_component_text(p, k)) IS DISTINCT FROM p_expect->>k THEN
      RAISE EXCEPTION 'O texto % mudou enquanto você aprovava. Revise a versão atual.', CASE k WHEN 'titulo' THEN 'da frase' ELSE 'da legenda' END USING ERRCODE = 'PT409';
    END IF;
  END LOOP;
  UPDATE public.user_posts SET metadata = COALESCE(metadata, '{}'::jsonb) || p_patch
     || CASE WHEN COALESCE(p_expect, '{}'::jsonb) = '{}'::jsonb THEN '{}'::jsonb
             ELSE jsonb_build_object('review_evidence', COALESCE(metadata->'review_evidence', '{}'::jsonb) || (
               SELECT jsonb_object_agg(e.key, jsonb_build_object('sha256', e.value, 'at', now())) FROM jsonb_each_text(p_expect) e)) END
   WHERE id = p_post RETURNING * INTO p;
  RETURN p;
END $$;
GRANT EXECUTE ON FUNCTION public.merge_post_review(uuid, jsonb, jsonb) TO authenticated, service_role;

-- Aprovar a peça completa (imagem única/vídeo; sequência usa approve_sequence). p_rendered = arquivo que o
-- produtor estava vendo: se o render mudou desde então, recusa (não aprova visual que não foi apresentado).
-- p_approve_ai: aprovar a peça na revisão inclui a imagem de IA apresentada (mesma regra da revisão do ciclo).
CREATE OR REPLACE FUNCTION public.approve_piece(p_post uuid, p_rendered text DEFAULT NULL, p_approve_ai boolean DEFAULT false) RETURNS public.user_posts
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE p public.user_posts%ROWTYPE; rd jsonb; variant text;
BEGIN
  SELECT * INTO p FROM public.user_posts WHERE id = p_post FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Peça não encontrada.' USING ERRCODE = 'PT404'; END IF;
  IF p.format IN ('carousel', 'story') THEN RAISE EXCEPTION 'Sequências são aprovadas na revisão da sequência.' USING ERRCODE = 'PT422'; END IF;
  IF p_rendered IS NOT NULL AND split_part(COALESCE(p.rendered_slides->>'slide1', ''), '?', 1) IS DISTINCT FROM split_part(p_rendered, '?', 1) THEN
    RAISE EXCEPTION 'A imagem mudou desde que você abriu a peça. Revise a versão atual antes de aprovar.' USING ERRCODE = 'PT409';
  END IF;
  variant := p.visual_decision->>'variant';
  IF p_approve_ai AND (variant IN ('M01-D', 'M01-E') OR variant LIKE 'M02-%') THEN
    UPDATE public.user_posts SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"bg_approved":true}'::jsonb WHERE id = p_post RETURNING * INTO p;
  END IF;
  rd := public.piece_readiness(p_post, 'approve_piece');
  IF NOT (rd->>'ready')::boolean THEN
    RAISE EXCEPTION 'A peça ainda não pode ser aprovada: %', (SELECT string_agg(m->>'reason', ' ') FROM jsonb_array_elements(rd->'missing') m) USING ERRCODE = 'PT422';
  END IF;
  UPDATE public.user_posts SET
    status = CASE WHEN status = 'scheduled' THEN 'scheduled' ELSE 'approved' END,       -- nunca desagenda (02/T25)
    image_approved = true, image_status = 'approved', text_approved = true, approved_version = version,
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('titulo_status', 'approved', 'legenda_status', 'approved', 'review_stage', 'done',
      'review_evidence', COALESCE(metadata->'review_evidence', '{}'::jsonb) || jsonb_build_object(
        'peca', jsonb_build_object('rendered', p.rendered_slides->>'slide1', 'caption_sha256', public.sha256_text(p.caption),
                                   'quote_sha256', public.sha256_text(public.review_component_text(p, 'titulo')), 'at', now())))
   WHERE id = p_post RETURNING * INTO p;
  RETURN p;
END $$;
GRANT EXECUTE ON FUNCTION public.approve_piece(uuid, text, boolean) TO authenticated, service_role;

-- Editar depois de aprovar (02 §13): só o componente alterado volta a pendente; a peça deixa de estar
-- "aprovada" até nova aprovação. Agendada: continua agendada (o pacote programado não muda) e fica marcada
-- com "alterações fora do agendamento". Escritores que mexem explicitamente em status/aprovação (aprovar,
-- refazer visual pela Hive) não são reinterpretados aqui.
CREATE OR REPLACE FUNCTION public.invalidate_on_edit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE txt boolean; cap boolean; img boolean;
BEGIN
  IF OLD.status NOT IN ('approved', 'scheduled') OR OLD.format IN ('carousel', 'story') THEN RETURN NEW; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status OR NEW.image_approved IS DISTINCT FROM OLD.image_approved
     OR NEW.approved_version IS DISTINCT FROM OLD.approved_version THEN RETURN NEW; END IF;
  txt := COALESCE(NEW.carousel_text->>'quote', '') IS DISTINCT FROM COALESCE(OLD.carousel_text->>'quote', '');
  cap := COALESCE(NEW.caption, '') IS DISTINCT FROM COALESCE(OLD.caption, '');
  img := split_part(COALESCE(NEW.rendered_slides->>'slide1', ''), '?', 1) IS DISTINCT FROM split_part(COALESCE(OLD.rendered_slides->>'slide1', ''), '?', 1)
         OR NEW.carousel_fabric_json IS DISTINCT FROM OLD.carousel_fabric_json
         OR NEW.visual_decision IS DISTINCT FROM OLD.visual_decision;
  IF NOT (txt OR cap OR img) THEN RETURN NEW; END IF;
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb)
    || CASE WHEN txt THEN '{"titulo_status":"pending"}'::jsonb ELSE '{}'::jsonb END
    || CASE WHEN cap THEN '{"legenda_status":"pending"}'::jsonb ELSE '{}'::jsonb END
    || CASE WHEN OLD.status = 'scheduled' THEN '{"scheduled_outdated":true}'::jsonb ELSE '{}'::jsonb END;
  IF img THEN NEW.image_approved := false; NEW.image_status := 'pending'; END IF;
  IF OLD.status = 'approved' THEN NEW.status := 'pending_approval'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_posts_invalidate_on_edit ON public.user_posts;
CREATE TRIGGER trg_posts_invalidate_on_edit BEFORE UPDATE OF caption, carousel_text, rendered_slides, carousel_fabric_json, visual_decision
  ON public.user_posts FOR EACH ROW EXECUTE FUNCTION public.invalidate_on_edit();

-- Plano em lote durável (02 §10): linhas com o comando de cada uma; o resultado vem de schedule_commands.
CREATE TABLE IF NOT EXISTS public.schedule_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  summary text,
  rows jsonb NOT NULL,                       -- [{post_id, date, time, reason, command_id, result?}]
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_schedule_plans_open ON public.schedule_plans(user_id, created_at DESC) WHERE status = 'open';
ALTER TABLE public.schedule_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS schedule_plans_all_own ON public.schedule_plans;
CREATE POLICY schedule_plans_all_own ON public.schedule_plans TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Medição da IA fora do caminho da aprovação (02 §12): chave única por evento → sem duplicar; falha fica pendente.
CREATE TABLE IF NOT EXISTS public.ai_measurement_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.user_posts(id) ON DELETE CASCADE,
  event_key text NOT NULL,                   -- ex.: 'review:v1:<sha caption+quote>'
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, event_key)
);
CREATE INDEX IF NOT EXISTS idx_ai_measurement_pending ON public.ai_measurement_events(user_id) WHERE status <> 'done';
ALTER TABLE public.ai_measurement_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_measurement_events_all_own ON public.ai_measurement_events;
CREATE POLICY ai_measurement_events_all_own ON public.ai_measurement_events TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

COMMIT;
