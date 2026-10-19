-- Estabilização E4 — publicação exclusiva e versão programada (docs 01 §5, 03 §9–§12).
--   * editar depois de aprovar marca `edited_after_approval`; agendar/trocar o pacote exige aprovar a edição
--     antes (a prontidão passa a enxergar isso); aprovar limpa a marca
--   * update_scheduled_package (antigo, só trocava o número) dá lugar ao comando replace_package (pacote novo)
BEGIN;

CREATE OR REPLACE FUNCTION public.invalidate_on_edit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE txt boolean; cap boolean; img boolean;
BEGIN
  IF OLD.status NOT IN ('approved', 'scheduled') OR OLD.format IN ('carousel', 'story') THEN RETURN NEW; END IF;
  -- Escritores explícitos não são reinterpretados: aprovar (status/aprovação) e aplicar uma proposta comparada
  -- (apply_piece_candidate avança a versão e cuida das próprias aprovações — Fase 2).
  IF NEW.status IS DISTINCT FROM OLD.status OR NEW.image_approved IS DISTINCT FROM OLD.image_approved
     OR NEW.approved_version IS DISTINCT FROM OLD.approved_version OR NEW.version IS DISTINCT FROM OLD.version THEN RETURN NEW; END IF;
  txt := COALESCE(NEW.carousel_text->>'quote', '') IS DISTINCT FROM COALESCE(OLD.carousel_text->>'quote', '');
  cap := COALESCE(NEW.caption, '') IS DISTINCT FROM COALESCE(OLD.caption, '');
  img := split_part(COALESCE(NEW.rendered_slides->>'slide1', ''), '?', 1) IS DISTINCT FROM split_part(COALESCE(OLD.rendered_slides->>'slide1', ''), '?', 1)
         OR NEW.carousel_fabric_json IS DISTINCT FROM OLD.carousel_fabric_json
         OR NEW.visual_decision IS DISTINCT FROM OLD.visual_decision;
  IF NOT (txt OR cap OR img) THEN RETURN NEW; END IF;
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb) || '{"edited_after_approval":true}'::jsonb
    || CASE WHEN txt THEN '{"titulo_status":"pending"}'::jsonb ELSE '{}'::jsonb END
    || CASE WHEN cap THEN '{"legenda_status":"pending"}'::jsonb ELSE '{}'::jsonb END
    || CASE WHEN OLD.status = 'scheduled' THEN '{"scheduled_outdated":true}'::jsonb ELSE '{}'::jsonb END;
  IF img THEN NEW.image_approved := false; NEW.image_status := 'pending'; END IF;
  IF OLD.status = 'approved' THEN NEW.status := 'pending_approval'; END IF;
  RETURN NEW;
END $$;

-- approve_piece: além de aprovar, limpa a marca de edição pendente (o pacote programado NÃO muda).
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
    status = CASE WHEN status = 'scheduled' THEN 'scheduled' ELSE 'approved' END,
    image_approved = true, image_status = 'approved', text_approved = true, approved_version = version,
    metadata = (COALESCE(metadata, '{}'::jsonb) - 'edited_after_approval') || jsonb_build_object('titulo_status', 'approved', 'legenda_status', 'approved', 'review_stage', 'done',
      'review_evidence', COALESCE(metadata->'review_evidence', '{}'::jsonb) || jsonb_build_object(
        'peca', jsonb_build_object('rendered', p.rendered_slides->>'slide1', 'caption_sha256', public.sha256_text(p.caption),
                                   'quote_sha256', public.sha256_text(public.review_component_text(p, 'titulo')), 'at', now())))
   WHERE id = p_post RETURNING * INTO p;
  RETURN p;
END $$;

-- Prontidão: edição ainda não aprovada impede agendar/trocar o pacote/publicar agora.
CREATE OR REPLACE FUNCTION public.piece_readiness_base(p_post uuid, p_scope text) RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{}'::jsonb $$;
DO $$
DECLARE src text;
BEGIN
  SELECT pg_get_functiondef('public.piece_readiness(uuid, text)'::regprocedure) INTO src;
  IF position('edited_after_approval' IN src) = 0 THEN
    src := replace(src,
      $q$  IF p_scope IN ('schedule', 'publish') THEN
    IF p.status NOT IN ('approved', 'scheduled') THEN$q$,
      $q$  IF p_scope IN ('schedule', 'publish') THEN
    IF (p.metadata->>'edited_after_approval') = 'true' THEN miss := miss || jsonb_build_object('component', 'aprovacao', 'reason', 'Há alterações ainda não aprovadas: aprove a peça antes.'); END IF;
    IF p.status NOT IN ('approved', 'scheduled') THEN$q$);
    IF position('edited_after_approval' IN src) = 0 THEN RAISE EXCEPTION 'piece_readiness: ponto de inserção não encontrado'; END IF;
    EXECUTE src;
  END IF;
END $$;
DROP FUNCTION IF EXISTS public.piece_readiness_base(uuid, text);

-- O "Atualizar agendamento" antigo trocava só o número da versão: agora é o comando replace_package
-- (schedule-piece), que fecha um pacote novo aprovado. Mantido como recusa explícita para clientes antigos.
CREATE OR REPLACE FUNCTION public.update_scheduled_package(pid uuid) RETURNS public.user_posts
LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  RAISE EXCEPTION 'Atualize o conteúdo programado pela peça (o pacote é fechado de novo com a versão aprovada).' USING ERRCODE = 'PT409';
END $$;

COMMIT;
