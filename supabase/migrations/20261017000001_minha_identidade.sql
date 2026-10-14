-- Fase 3 · Minha identidade (docs/identidade/Hive_Guia_Implementacao_Setup_e_Recalibracao_v1.md §3–§10).
-- Sessões de setup/revisão/recalibração com propostas por bloco; nada muda na configuração
-- ativa até a ATIVAÇÃO explícita (activate_setup_session), que grava nova versão por perfil
-- afetado e o alcance da adoção. Recalibrar um perfil não altera os outros (cópia do que é
-- compartilhado) e peças agendadas seguem com o snapshot/versão que já tinham.
BEGIN;

-- Editorias com propósito/território/perguntas/material/exemplo e frente (null = todas).
ALTER TABLE public.bee_editorials
  ADD COLUMN IF NOT EXISTS front_id uuid REFERENCES public.business_fronts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS territorio text,
  ADD COLUMN IF NOT EXISTS perguntas text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS material text,
  ADD COLUMN IF NOT EXISTS exemplo text,
  ADD COLUMN IF NOT EXISTS curation_status text NOT NULL DEFAULT 'approved' CHECK (curation_status IN ('testing', 'approved', 'archived'));

-- Campanha presa a uma versão do perfil ("só novas criações adotam a versão nova").
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS profile_version integer;

-- Sessão: revisões por bloco, calibrações e quando foi ativada.
ALTER TABLE public.setup_sessions
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS reviews jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS calibrations jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS activated_at timestamptz;
DROP TRIGGER IF EXISTS trg_setup_sessions_updated ON public.setup_sessions;
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
CREATE TRIGGER trg_setup_sessions_updated BEFORE UPDATE ON public.setup_sessions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Composição congelada de um perfil (o que a versão significa): perfil + emissor + frente + públicos + ofertas.
CREATE OR REPLACE FUNCTION public.profile_composition(pid uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'profile', to_jsonb(p) - 'created_at' - 'updated_at',
    'emitter', (SELECT to_jsonb(e) - 'created_at' - 'updated_at' FROM public.emitters e WHERE e.id = p.emitter_id),
    'front', (SELECT to_jsonb(f) - 'created_at' - 'updated_at' FROM public.business_fronts f WHERE f.id = p.front_id),
    'audiences', COALESCE((SELECT jsonb_agg(to_jsonb(a) - 'created_at' - 'updated_at') FROM public.audiences a
                            WHERE a.id = p.primary_audience_id OR a.id = ANY(p.secondary_audience_ids)), '[]'::jsonb),
    'offers', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'promessa', o.promessa)) FROM public.bee_products o
                         WHERE o.id = ANY(p.offer_ids)), '[]'::jsonb))
  FROM public.communication_profiles p WHERE p.id = pid
$$;

-- Versões existentes passam a carregar a composição completa (pinagem fiel).
UPDATE public.communication_profile_versions v
   SET data = v.data || public.profile_composition(v.profile_id)
 WHERE NOT (v.data ? 'emitter');

-- ref de proposta → uuid: "new:<chave>" ou id já copiado (fork) vem do mapa; senão é o próprio id.
CREATE OR REPLACE FUNCTION public._setup_ref(refs jsonb, x text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN x IS NULL OR x = '' THEN NULL WHEN refs ? x THEN (refs->>x)::uuid WHEN x LIKE 'new:%' THEN NULL ELSE x::uuid END
$$;
CREATE OR REPLACE FUNCTION public._setup_arr(j jsonb) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN j IS NULL OR jsonb_typeof(j) <> 'array' THEN NULL ELSE ARRAY(SELECT jsonb_array_elements_text(j)) END
$$;

CREATE OR REPLACE FUNCTION public.activate_setup_session(sid uuid, adoption text DEFAULT 'future')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.setup_sessions%ROWTYPE;
  b uuid; refs jsonb := '{}'::jsonb; it jsonb; nid uuid; oid uuid; k text; v text;
  inplace_e uuid[] := '{}'; inplace_f uuid[] := '{}'; inplace_a uuid[] := '{}';
  created_p uuid[] := '{}'; updated_p uuid[] := '{}'; touched uuid[]; pid uuid;
  forks jsonb := '[]'::jsonb; versions jsonb := '[]'::jsonb; eds jsonb := '[]'::jsonb; learned int := 0;
  oldv int; newv int; pst text; v_slug text; n int; recal boolean; offers uuid[]; pinned int := 0; cal jsonb; r public.communication_profiles%ROWTYPE;
  blk text;
BEGIN
  IF adoption NOT IN ('future', 'all') THEN RAISE EXCEPTION 'Alcance de adoção inválido' USING ERRCODE = 'PT400'; END IF;
  SELECT * INTO s FROM public.setup_sessions WHERE id = sid FOR UPDATE;
  IF NOT FOUND OR s.user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Sessão não encontrada' USING ERRCODE = 'PT404'; END IF;
  IF s.status = 'done' THEN RETURN s.result; END IF;
  b := s.brand_id;
  IF b IS NULL OR NOT public.is_brand_member(b) THEN RAISE EXCEPTION 'Sem acesso a esta marca' USING ERRCODE = 'PT403'; END IF;
  recal := s.mode = 'recalibrate';

  -- Versão-base: o perfil não pode ter mudado por outra sessão desde o início desta.
  FOR k, v IN SELECT key, value FROM jsonb_each_text(s.base_versions) LOOP
    IF (SELECT version FROM public.communication_profiles WHERE id = k::uuid) IS DISTINCT FROM v::int THEN
      RAISE EXCEPTION 'Conflito: o perfil foi alterado depois do início desta sessão. Revise antes de ativar.' USING ERRCODE = 'PT409';
    END IF;
  END LOOP;

  -- Marca (núcleo): só a natureza da contribuição; Genesis segue na edição detalhada.
  IF s.proposals->'brand'->>'status' = 'accepted' AND s.proposals->'brand' ? 'essence' THEN
    UPDATE public.brands SET essence = s.proposals->'brand'->>'essence', updated_at = now() WHERE id = b;
  END IF;

  -- Emissores
  IF s.proposals->'emitters'->>'status' = 'accepted' THEN
    FOR it IN SELECT * FROM jsonb_array_elements(COALESCE(s.proposals->'emitters'->'items', '[]')) LOOP
      IF it->>'action' = 'create' THEN
        INSERT INTO public.emitters (brand_id, kind, name, voice, authority, first_person, speaking_rules, facts_status)
        VALUES (b, COALESCE(it->>'kind', 'person'), it->>'name', it->>'voice', it->>'authority', COALESCE((it->>'first_person')::boolean, (it->>'kind') <> 'institutional'),
                it->>'speaking_rules', COALESCE(it->>'facts_status', 'to_confirm')) RETURNING id INTO nid;
        refs := refs || jsonb_build_object(it->>'ref', nid);
      ELSIF it->>'action' = 'update' THEN
        oid := (it->>'ref')::uuid;
        IF recal AND EXISTS (SELECT 1 FROM public.communication_profiles cp WHERE cp.brand_id = b AND cp.status <> 'archived' AND cp.emitter_id = oid AND NOT cp.id = ANY(s.target_profile_ids)) THEN
          INSERT INTO public.emitters (brand_id, kind, name, voice, authority, first_person, speaking_rules, photo_profile, facts_status)
          SELECT b, e.kind, COALESCE(it->>'name', e.name), COALESCE(it->>'voice', e.voice), COALESCE(it->>'authority', e.authority), COALESCE((it->>'first_person')::boolean, e.first_person),
                 COALESCE(it->>'speaking_rules', e.speaking_rules), e.photo_profile, COALESCE(it->>'facts_status', e.facts_status) FROM public.emitters e WHERE e.id = oid AND e.brand_id = b
          RETURNING id INTO nid;
          refs := refs || jsonb_build_object(oid::text, nid); forks := forks || jsonb_build_object('kind', 'emitter', 'from', oid, 'to', nid);
        ELSE
          UPDATE public.emitters e SET name = COALESCE(it->>'name', e.name), voice = COALESCE(it->>'voice', e.voice), authority = COALESCE(it->>'authority', e.authority),
                 first_person = COALESCE((it->>'first_person')::boolean, e.first_person), speaking_rules = COALESCE(it->>'speaking_rules', e.speaking_rules),
                 facts_status = COALESCE(it->>'facts_status', e.facts_status), updated_at = now()
           WHERE e.id = oid AND e.brand_id = b;
          IF NOT FOUND THEN RAISE EXCEPTION 'Emissor fora desta marca' USING ERRCODE = 'PT403'; END IF;
          inplace_e := inplace_e || oid;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- Frentes
  IF s.proposals->'fronts'->>'status' = 'accepted' THEN
    FOR it IN SELECT * FROM jsonb_array_elements(COALESCE(s.proposals->'fronts'->'items', '[]')) LOOP
      offers := CASE WHEN jsonb_typeof(it->'offers') = 'array' THEN ARRAY(SELECT id FROM public.bee_products WHERE slug = ANY(public._setup_arr(it->'offers'))) END;
      IF it->>'action' = 'create' THEN
        v_slug := trim(both '-' from regexp_replace(translate(lower(COALESCE(NULLIF(it->>'slug', ''), it->>'name')), 'áàâãéêíóôõúç', 'aaaaeeiooouc'), '[^a-z0-9]+', '-', 'g'));
        WHILE EXISTS (SELECT 1 FROM public.business_fronts f WHERE f.brand_id = b AND f.slug = v_slug) LOOP v_slug := v_slug || '-2'; END LOOP;
        INSERT INTO public.business_fronts (brand_id, name, slug, description, territories, offer_ids)
        VALUES (b, it->>'name', v_slug, it->>'description', COALESCE(public._setup_arr(it->'territories'), '{}'), COALESCE(offers, '{}')) RETURNING id INTO nid;
        refs := refs || jsonb_build_object(it->>'ref', nid);
      ELSIF it->>'action' = 'update' THEN
        oid := (it->>'ref')::uuid;
        IF recal AND EXISTS (SELECT 1 FROM public.communication_profiles cp WHERE cp.brand_id = b AND cp.status <> 'archived' AND cp.front_id = oid AND NOT cp.id = ANY(s.target_profile_ids)) THEN
          -- Frente compartilhada com perfil fora do alvo: a recalibração NÃO mexe nela (o perfil-alvo guarda as diferenças).
          forks := forks || jsonb_build_object('kind', 'front', 'from', oid, 'to', NULL, 'note', 'frente compartilhada mantida; diferença registrada no perfil');
        ELSE
          UPDATE public.business_fronts f SET name = COALESCE(it->>'name', f.name), description = COALESCE(it->>'description', f.description),
                 territories = COALESCE(public._setup_arr(it->'territories'), f.territories), offer_ids = COALESCE(offers, f.offer_ids), updated_at = now()
           WHERE f.id = oid AND f.brand_id = b;
          IF NOT FOUND THEN RAISE EXCEPTION 'Frente fora desta marca' USING ERRCODE = 'PT403'; END IF;
          inplace_f := inplace_f || oid;
        END IF;
      ELSIF it->>'action' = 'archive' AND NOT recal THEN
        UPDATE public.business_fronts SET status = 'archived', updated_at = now() WHERE id = (it->>'ref')::uuid AND brand_id = b;
      END IF;
    END LOOP;
  END IF;

  -- Públicos (pessoas/papéis/situações — não estado do interlocutor)
  IF s.proposals->'audiences'->>'status' = 'accepted' THEN
    FOR it IN SELECT * FROM jsonb_array_elements(COALESCE(s.proposals->'audiences'->'items', '[]')) LOOP
      IF it->>'action' = 'create' THEN
        INSERT INTO public.audiences (brand_id, front_id, name, definition, situations, needs, language_notes, status, notes)
        VALUES (b, public._setup_ref(refs, it->>'front_ref'), it->>'name', it->>'definition', COALESCE(public._setup_arr(it->'situations'), '{}'),
                COALESCE(public._setup_arr(it->'needs'), '{}'), it->>'language_notes', COALESCE(it->>'status', 'hypothesis'), it->>'notes') RETURNING id INTO nid;
        refs := refs || jsonb_build_object(it->>'ref', nid);
      ELSIF it->>'action' = 'update' THEN
        oid := (it->>'ref')::uuid;
        IF recal AND EXISTS (SELECT 1 FROM public.communication_profiles cp WHERE cp.brand_id = b AND cp.status <> 'archived' AND NOT cp.id = ANY(s.target_profile_ids)
                              AND (cp.primary_audience_id = oid OR oid = ANY(cp.secondary_audience_ids))) THEN
          INSERT INTO public.audiences (brand_id, front_id, name, definition, situations, needs, language_notes, roles, status, notes)
          SELECT b, a.front_id, COALESCE(it->>'name', a.name), COALESCE(it->>'definition', a.definition), COALESCE(public._setup_arr(it->'situations'), a.situations),
                 COALESCE(public._setup_arr(it->'needs'), a.needs), COALESCE(it->>'language_notes', a.language_notes), a.roles, COALESCE(it->>'status', a.status), COALESCE(it->>'notes', a.notes)
            FROM public.audiences a WHERE a.id = oid AND a.brand_id = b RETURNING id INTO nid;
          refs := refs || jsonb_build_object(oid::text, nid); forks := forks || jsonb_build_object('kind', 'audience', 'from', oid, 'to', nid);
        ELSE
          UPDATE public.audiences a SET name = COALESCE(it->>'name', a.name), definition = COALESCE(it->>'definition', a.definition),
                 situations = COALESCE(public._setup_arr(it->'situations'), a.situations), needs = COALESCE(public._setup_arr(it->'needs'), a.needs),
                 language_notes = COALESCE(it->>'language_notes', a.language_notes), status = COALESCE(it->>'status', a.status), notes = COALESCE(it->>'notes', a.notes), updated_at = now()
           WHERE a.id = oid AND a.brand_id = b;
          IF NOT FOUND THEN RAISE EXCEPTION 'Público fora desta marca' USING ERRCODE = 'PT403'; END IF;
          inplace_a := inplace_a || oid;
        END IF;
      ELSIF it->>'action' = 'archive' AND NOT recal THEN
        UPDATE public.audiences SET status = 'archived', updated_at = now() WHERE id = (it->>'ref')::uuid AND brand_id = b;
      END IF;
    END LOOP;
  END IF;

  -- Perfis
  IF s.proposals->'profiles'->>'status' = 'accepted' THEN
    FOR it IN SELECT * FROM jsonb_array_elements(COALESCE(s.proposals->'profiles'->'items', '[]')) LOOP
      offers := CASE WHEN jsonb_typeof(it->'offers') = 'array' THEN ARRAY(SELECT id FROM public.bee_products WHERE slug = ANY(public._setup_arr(it->'offers'))) END;
      IF it->>'action' = 'create' THEN
        INSERT INTO public.communication_profiles (brand_id, emitter_id, front_id, primary_audience_id, secondary_audience_ids, name, positioning, expression, cta_policy, offer_ids, status, needs_recalibration, version)
        VALUES (b, public._setup_ref(refs, it->>'emitter_ref'), public._setup_ref(refs, it->>'front_ref'), public._setup_ref(refs, it->>'primary_audience_ref'),
                COALESCE(ARRAY(SELECT public._setup_ref(refs, x) FROM jsonb_array_elements_text(COALESCE(it->'secondary_audience_refs', '[]')) x WHERE public._setup_ref(refs, x) IS NOT NULL), '{}'),
                it->>'name', it->>'positioning', it->>'expression', COALESCE(it->>'cta_policy', 'by_intent'), COALESCE(offers, '{}'), COALESCE(it->>'status', 'draft'), it->>'needs_recalibration', 0)
        RETURNING id INTO nid;
        refs := refs || jsonb_build_object(it->>'ref', nid); created_p := created_p || nid;
      ELSIF it->>'action' = 'update' THEN
        oid := (it->>'ref')::uuid;
        IF recal AND NOT oid = ANY(s.target_profile_ids) THEN CONTINUE; END IF;   -- recalibração toca só os perfis-alvo
        UPDATE public.communication_profiles p SET
               emitter_id = COALESCE(public._setup_ref(refs, it->>'emitter_ref'), p.emitter_id), front_id = COALESCE(public._setup_ref(refs, it->>'front_ref'), p.front_id),
               primary_audience_id = CASE WHEN it ? 'primary_audience_ref' THEN public._setup_ref(refs, it->>'primary_audience_ref') ELSE p.primary_audience_id END,
               secondary_audience_ids = CASE WHEN it ? 'secondary_audience_refs' THEN COALESCE(ARRAY(SELECT public._setup_ref(refs, x) FROM jsonb_array_elements_text(it->'secondary_audience_refs') x WHERE public._setup_ref(refs, x) IS NOT NULL), '{}') ELSE p.secondary_audience_ids END,
               name = COALESCE(it->>'name', p.name), positioning = COALESCE(it->>'positioning', p.positioning), expression = COALESCE(it->>'expression', p.expression),
               cta_policy = COALESCE(it->>'cta_policy', p.cta_policy), offer_ids = COALESCE(offers, p.offer_ids), status = COALESCE(it->>'status', p.status),
               needs_recalibration = CASE WHEN it ? 'needs_recalibration' THEN NULLIF(it->>'needs_recalibration', '') ELSE p.needs_recalibration END, updated_at = now()
         WHERE p.id = oid AND p.brand_id = b;
        IF NOT FOUND THEN RAISE EXCEPTION 'Perfil fora desta marca' USING ERRCODE = 'PT403'; END IF;
        updated_p := updated_p || oid;
      ELSIF it->>'action' = 'archive' AND NOT recal THEN
        UPDATE public.communication_profiles SET status = 'archived', is_default = false, updated_at = now() WHERE id = (it->>'ref')::uuid AND brand_id = b;
      END IF;
    END LOOP;
  END IF;

  -- Perfis-alvo passam a apontar para as cópias (fork) do que era compartilhado.
  FOR r IN SELECT * FROM public.communication_profiles WHERE id = ANY(s.target_profile_ids) AND brand_id = b LOOP
    UPDATE public.communication_profiles p SET
      emitter_id = COALESCE(public._setup_ref(refs, p.emitter_id::text), p.emitter_id),
      primary_audience_id = CASE WHEN p.primary_audience_id IS NULL THEN NULL ELSE COALESCE(public._setup_ref(refs, p.primary_audience_id::text), p.primary_audience_id) END,
      secondary_audience_ids = ARRAY(SELECT COALESCE(public._setup_ref(refs, x::text), x) FROM unnest(p.secondary_audience_ids) x)
     WHERE p.id = r.id AND (refs ? p.emitter_id::text OR refs ? COALESCE(p.primary_audience_id::text, '-') OR EXISTS (SELECT 1 FROM unnest(p.secondary_audience_ids) x WHERE refs ? x::text));
    IF FOUND AND NOT r.id = ANY(updated_p) THEN updated_p := updated_p || r.id; END IF;
  END LOOP;

  -- Perfis afetados: criados, atualizados e os que usam o que mudou no lugar.
  touched := ARRAY(SELECT DISTINCT x FROM unnest(created_p || updated_p || ARRAY(
    SELECT cp.id FROM public.communication_profiles cp WHERE cp.brand_id = b AND cp.status <> 'archived'
       AND (cp.emitter_id = ANY(inplace_e) OR cp.front_id = ANY(inplace_f) OR cp.primary_audience_id = ANY(inplace_a) OR cp.secondary_audience_ids && inplace_a))) x);

  FOREACH pid IN ARRAY touched LOOP
    SELECT version, status INTO oldv, pst FROM public.communication_profiles WHERE id = pid;
    newv := oldv + 1;
    UPDATE public.communication_profiles SET version = newv, updated_at = now() WHERE id = pid;
    UPDATE public.communication_profile_versions SET status = 'superseded' WHERE profile_id = pid AND status IN ('active', 'reviewed');
    INSERT INTO public.communication_profile_versions (profile_id, version, status, data, reason, created_by, activated_at)
    VALUES (pid, newv, CASE WHEN pst = 'active' THEN 'active' ELSE 'reviewed' END, public.profile_composition(pid),
            COALESCE(s.title, 'Sessão Minha identidade') || ' (' || s.mode || ')', auth.uid(), CASE WHEN pst = 'active' THEN now() END);
    -- Alcance: "só novas criações" prende as campanhas em andamento na versão anterior.
    IF adoption = 'future' AND oldv > 0 THEN
      UPDATE public.campaigns SET profile_version = oldv WHERE profile_id = pid AND profile_version IS NULL AND status IN ('draft', 'active', 'paused');
      GET DIAGNOSTICS n = ROW_COUNT; pinned := pinned + n;
    END IF;
    versions := versions || jsonb_build_object('profile_id', pid, 'name', (SELECT name FROM public.communication_profiles WHERE id = pid), 'from', oldv, 'to', newv, 'created', pid = ANY(created_p));
  END LOOP;
  -- Perfil padrão: se nenhum ativo for padrão, o primeiro ativo vira padrão.
  IF NOT EXISTS (SELECT 1 FROM public.communication_profiles WHERE brand_id = b AND is_default AND status = 'active') THEN
    UPDATE public.communication_profiles SET is_default = false WHERE brand_id = b AND is_default;
    UPDATE public.communication_profiles SET is_default = true WHERE id = (SELECT id FROM public.communication_profiles WHERE brand_id = b AND status = 'active' ORDER BY created_at LIMIT 1);
  END IF;

  -- Editorias (curadoria: nunca apaga; arquivar = inativar)
  IF s.proposals->'editorials'->>'status' = 'accepted' THEN
    FOR it IN SELECT * FROM jsonb_array_elements(COALESCE(s.proposals->'editorials'->'items', '[]')) LOOP
      IF it->>'action' = 'create' THEN
        v_slug := trim(both '-' from regexp_replace(translate(lower(COALESCE(NULLIF(it->>'slug', ''), it->>'name')), 'áàâãéêíóôõúç', 'aaaaeeiooouc'), '[^a-z0-9]+', '-', 'g'));
        WHILE EXISTS (SELECT 1 FROM public.bee_editorials e WHERE e.slug = v_slug) LOOP v_slug := v_slug || '-2'; END LOOP;
        INSERT INTO public.bee_editorials (slug, name, description, objetivo, territorio, perguntas, material, exemplo, front_id, brand_id, is_active, is_system, curation_status, position, temas)
        VALUES (v_slug, it->>'name', COALESCE(it->>'description', it->>'objetivo'), it->>'objetivo', it->>'territorio', COALESCE(public._setup_arr(it->'perguntas'), '{}'), it->>'material', it->>'exemplo',
                public._setup_ref(refs, it->>'front_ref'), b, true, false, COALESCE(it->>'curation_status', 'testing'),
                COALESCE((SELECT max(position) FROM public.bee_editorials), 0) + 1, COALESCE(public._setup_arr(it->'temas'), '{}'))
        RETURNING id INTO nid;
        eds := eds || jsonb_build_object('action', 'create', 'slug', v_slug, 'name', it->>'name');
      ELSIF it->>'action' = 'update' THEN
        UPDATE public.bee_editorials e SET name = COALESCE(it->>'name', e.name), objetivo = COALESCE(it->>'objetivo', e.objetivo), territorio = COALESCE(it->>'territorio', e.territorio),
               perguntas = COALESCE(public._setup_arr(it->'perguntas'), e.perguntas), material = COALESCE(it->>'material', e.material), exemplo = COALESCE(it->>'exemplo', e.exemplo),
               front_id = CASE WHEN it ? 'front_ref' THEN public._setup_ref(refs, it->>'front_ref') ELSE e.front_id END,
               curation_status = COALESCE(it->>'curation_status', e.curation_status), updated_at = now()
         WHERE e.id = (it->>'ref')::uuid AND e.brand_id = b;
        IF FOUND THEN eds := eds || jsonb_build_object('action', 'update', 'name', it->>'name'); END IF;
      ELSIF it->>'action' = 'archive' THEN
        UPDATE public.bee_editorials SET is_active = false, curation_status = 'archived', updated_at = now() WHERE id = (it->>'ref')::uuid AND brand_id = b AND NOT is_system;
        IF FOUND THEN eds := eds || jsonb_build_object('action', 'archive', 'name', it->>'name'); END IF;
      END IF;
    END LOOP;
  END IF;

  -- Feedback da calibração marcado para aprender → lição com o escopo do perfil (não vira norma global).
  learned := 0;
  FOR cal IN SELECT * FROM jsonb_array_elements(s.calibrations) LOOP
    IF (cal->'feedback'->>'learn')::boolean IS TRUE AND COALESCE(cal->'feedback'->>'lesson', '') <> '' THEN
      pid := public._setup_ref(refs, cal->>'profile_ref');
      INSERT INTO public.ai_learnings (user_id, texto, categoria, evidencias, ativo, origem, facet, brand_id, front_id, emitter_id, profile_id)
      SELECT s.user_id, cal->'feedback'->>'lesson', 'calibracao', 1, true, 'conversa', 'texto', b, p.front_id, NULL, p.id
        FROM public.communication_profiles p WHERE p.id = pid;
      learned := learned + 1;
    END IF;
  END LOOP;

  UPDATE public.setup_sessions SET status = 'done', step = 'done', activated_at = now(),
         result = jsonb_build_object('versions', versions, 'forks', forks, 'editorials', eds, 'learnings', learned, 'adoption', adoption, 'pinned_campaigns', pinned, 'activated_at', now())
   WHERE id = sid RETURNING result INTO it;
  RETURN it;
END $$;
REVOKE ALL ON FUNCTION public.activate_setup_session(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.activate_setup_session(uuid, text) TO authenticated, service_role;

-- Sessão inaugural da Bee (Guia §5): perguntas de abertura guardadas como dado da marca.
UPDATE public.brands SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('setup_seed_questions', '[{"id": "bee-q1", "text": "O que do Genesis e da voz atual continua representando a Bee, e o que ficou preso ao foco anterior da Academy?", "why": "Separa o núcleo da marca do que era específico do foco anterior, antes de configurar as frentes.", "targets": ["identidade", "voz_visual", "posicionamento"], "blocks": ["brand", "emitters"]}, {"id": "bee-q2", "text": "Entre as pessoas que atuam em transformação, quem você quer priorizar primeiro e que situação elas vivem?", "why": "A Academy passa a priorizar transformadores; o núcleo inicial desse público ainda não foi definido.", "targets": ["publico", "frente"], "blocks": ["audiences", "profiles"]}, {"id": "bee-q3", "text": "Na Consulting, com quais interlocutores e questões organizacionais você quer conversar primeiro?", "why": "Os interlocutores da Consulting hoje são só uma hipótese ampla; sem isso a Hive não sabe para quem escrever.", "targets": ["publico", "frente"], "blocks": ["audiences", "fronts", "profiles"]}, {"id": "bee-q4", "text": "Em quais situações a Consulting fala como Marcos e em quais fala institucionalmente?", "why": "Define o lugar de fala: a voz institucional existe, mas quando usá-la é decisão sua.", "targets": ["identidade", "voz_visual", "frente"], "blocks": ["emitters", "profiles"]}, {"id": "bee-q5", "text": "Quais textos ou casos atuais representam bem cada frente?", "why": "Referências atuais calibram a voz de cada frente sem misturar com o histórico.", "targets": ["voz_visual", "frente", "publico", "posicionamento", "identidade", "oferta"], "blocks": ["profiles", "editorials"]}]'::jsonb)
 WHERE id = '0b000000-0000-4000-8000-000000000002';

COMMIT;
