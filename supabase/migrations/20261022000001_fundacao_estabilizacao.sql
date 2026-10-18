-- Estabilização E2 — fundação comum (docs 00 §6, 01 §5, 02 §7/§9, 03 §5–§7).
-- Um contrato por tema, sem mecanismos paralelos:
--   C1 publication_packages — pacote IMUTÁVEL do que vai ao ar (textos, arquivos com SHA-256, ordem, destino)
--   C2 piece_readiness      — prontidão por formato, avaliada no servidor
--   C4 schedule_commands    — comando idempotente de agendamento (commit_schedule)
--   C5 post_publications    — operação de publicação com reserva exclusiva, estágios e conferência
-- Nada aqui muda o comportamento atual sozinho: os escritores/leitores passam a usar estes contratos no E3/E4.
BEGIN;

-- Fuso da operação (02 §9.3): instante em UTC no banco; apresentação no fuso do produtor.
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/Sao_Paulo';

-- ============================================================================
-- C1 · Pacote imutável de publicação
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.publication_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.user_posts(id) ON DELETE CASCADE,
  schema_version integer NOT NULL DEFAULT 1,
  source_version integer NOT NULL,
  platform text NOT NULL,
  format text NOT NULL,
  account_id uuid,
  destination text NOT NULL,              -- identidade resolvida: 'linkedin:<urn>' | 'instagram:<ig business id>'
  manifest jsonb NOT NULL,                -- textos, arquivos (path/url/mime/bytes/sha256), unidades, aprovações, notas de planejamento
  manifest_sha256 text NOT NULL,
  origin text NOT NULL CHECK (origin IN ('schedule', 'publish_now', 'legacy_confirmed')),
  command_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_publication_packages_post ON public.publication_packages(post_id, created_at DESC);

-- Imutável: nem o dono nem a credencial de serviço alteram um pacote fechado. Só some junto com a peça.
CREATE OR REPLACE FUNCTION public.publication_packages_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Pacote de publicação é imutável: crie outro pacote.' USING ERRCODE = 'PT409';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_posts WHERE id = OLD.post_id) THEN
    RAISE EXCEPTION 'Pacote de publicação é imutável: só é removido junto com a peça.' USING ERRCODE = 'PT409';
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS trg_publication_packages_immutable ON public.publication_packages;
CREATE TRIGGER trg_publication_packages_immutable BEFORE UPDATE OR DELETE ON public.publication_packages
  FOR EACH ROW EXECUTE FUNCTION public.publication_packages_immutable();

ALTER TABLE public.publication_packages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS publication_packages_read_own ON public.publication_packages;
CREATE POLICY publication_packages_read_own ON public.publication_packages FOR SELECT TO authenticated USING (auth.uid() = user_id);
-- (sem INSERT/UPDATE/DELETE para authenticated: só o coordenador no servidor fecha pacotes)

ALTER TABLE public.user_posts ADD COLUMN IF NOT EXISTS scheduled_package_id uuid REFERENCES public.publication_packages(id) ON DELETE SET NULL;

-- Arquivos do pacote: bucket próprio. Leitura pública (as redes baixam pela URL; caminhos com o UUID do
-- pacote), escrita SÓ pela credencial de serviço — nenhum caminho do app sobrescreve, apaga ou limpa.
INSERT INTO storage.buckets (id, name, public) VALUES ('packages', 'packages', true) ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS packages_public_read ON storage.objects;
CREATE POLICY packages_public_read ON storage.objects FOR SELECT USING (bucket_id = 'packages');

-- O histórico editorial deixa de ser reescrito: aprovar a sequência registra a versão uma vez só.
CREATE OR REPLACE FUNCTION public.piece_versions_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.components IS DISTINCT FROM NEW.components THEN
    RAISE EXCEPTION 'Versão % da peça já registrada: o histórico não é reescrito.', OLD.version USING ERRCODE = 'PT409';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_piece_versions_append_only ON public.piece_versions;
CREATE TRIGGER trg_piece_versions_append_only BEFORE UPDATE ON public.piece_versions FOR EACH ROW EXECUTE FUNCTION public.piece_versions_append_only();

-- approve_sequence: mesma regra de antes (Stories sem legenda), mas a versão aprovada entra no histórico sem
-- sobrescrever um registro existente (ON CONFLICT DO NOTHING).
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
  IF p.format <> 'story' AND COALESCE(trim(p.caption), '') = '' THEN RAISE EXCEPTION 'Peça incompleta: falta a legenda.' USING ERRCODE = 'PT422'; END IF;
  PERFORM public.sync_unit_projection(pid);
  UPDATE public.user_posts SET status = CASE WHEN status = 'scheduled' THEN 'scheduled' ELSE 'approved' END,
         approved_version = version, image_status = 'approved', image_approved = true, text_approved = true,
         metadata = COALESCE(metadata, '{}'::jsonb) - 'coherence_review' || '{"review_stage":"done","legenda_status":"approved"}'::jsonb
   WHERE id = pid RETURNING * INTO p;
  INSERT INTO public.piece_versions (user_id, post_id, version, components, action) VALUES (p.user_id, p.id, p.version, public.piece_components(p), 'approve')
  ON CONFLICT (post_id, version) DO NOTHING;
  RETURN p;
END $$;

-- ============================================================================
-- C2 · Prontidão por formato (02 §7) — scope: approve_piece | schedule | publish
-- ============================================================================
CREATE OR REPLACE FUNCTION public.piece_readiness(p_post uuid, p_scope text DEFAULT 'schedule') RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER AS $$
DECLARE
  p public.user_posts%ROWTYPE; cap public.format_capabilities%ROWTYPE; acc record; st record;
  miss jsonb := '[]'::jsonb; n int; bad int; variant text;
BEGIN
  SELECT * INTO p FROM public.user_posts WHERE id = p_post;
  IF NOT FOUND THEN RETURN jsonb_build_object('ready', false, 'missing', jsonb_build_array(jsonb_build_object('component', 'peca', 'reason', 'Peça não encontrada.'))); END IF;
  IF p.status = 'published' OR (p.status = 'archived' AND p.published_at IS NOT NULL) THEN
    RETURN jsonb_build_object('ready', false, 'missing', jsonb_build_array(jsonb_build_object('component', 'historico', 'reason', 'Este conteúdo já foi publicado e permanece no histórico.')));
  END IF;

  IF p.format IN ('carousel', 'story') THEN
    SELECT * INTO cap FROM public.format_capabilities WHERE platform = p.platform AND format = p.format;
    IF p.script_status IS DISTINCT FROM 'approved' THEN miss := miss || jsonb_build_object('component', 'roteiro', 'reason', 'Roteiro ainda não aprovado.'); END IF;
    SELECT count(*), count(*) FILTER (WHERE visual_status <> 'ready' OR rendered_url IS NULL OR review_status <> 'approved') INTO n, bad FROM public.post_units WHERE post_id = p_post;
    IF n = 0 OR (cap.platform IS NOT NULL AND (n < cap.min_units OR n > cap.max_units)) THEN
      miss := miss || jsonb_build_object('component', 'paginas', 'reason', format('Sequência com %s página(s); o formato aceita de %s a %s.', n, cap.min_units, cap.max_units));
    END IF;
    IF bad > 0 THEN miss := miss || jsonb_build_object('component', 'paginas', 'reason', format('%s página(s) sem visual pronto ou sem aprovação.', bad)); END IF;
    IF p.format <> 'story' AND COALESCE(trim(p.caption), '') = '' THEN miss := miss || jsonb_build_object('component', 'legenda', 'reason', 'Falta a legenda.'); END IF;
    IF p_scope <> 'approve_piece' AND p.approved_version IS DISTINCT FROM p.version THEN
      miss := miss || jsonb_build_object('component', 'aprovacao', 'reason', 'A sequência completa ainda não foi aprovada nesta versão.');
    END IF;
  ELSIF p.format IN ('video', 'reel') THEN
    IF COALESCE(p.metadata->>'video_url', '') = '' THEN miss := miss || jsonb_build_object('component', 'video', 'reason', 'Vídeo não encontrado na peça.'); END IF;
    IF COALESCE(trim(p.caption), '') = '' THEN miss := miss || jsonb_build_object('component', 'legenda', 'reason', 'Falta a legenda.'); END IF;
  ELSE
    IF COALESCE(trim(p.caption), '') = '' THEN miss := miss || jsonb_build_object('component', 'legenda', 'reason', 'Falta a legenda.'); END IF;
    IF COALESCE(p.rendered_slides->>'slide1', '') = '' THEN miss := miss || jsonb_build_object('component', 'imagem', 'reason', 'Imagem final não renderizada.'); END IF;
    variant := p.visual_decision->>'variant';
    IF (variant IN ('M01-D', 'M01-E') OR variant LIKE 'M02-%') AND (p.metadata->>'bg_approved') IS DISTINCT FROM 'true' THEN
      miss := miss || jsonb_build_object('component', 'imagem_ia', 'reason', 'A imagem gerada por IA precisa ser aprovada.');
    END IF;
  END IF;

  IF p_scope IN ('schedule', 'publish') THEN
    IF p.status NOT IN ('approved', 'scheduled') THEN miss := miss || jsonb_build_object('component', 'aprovacao', 'reason', 'A peça ainda não foi aprovada.'); END IF;
    IF p.account_id IS NOT NULL THEN
      SELECT id, user_id, platform, status, label INTO acc FROM public.social_accounts WHERE id = p.account_id;
      IF acc.id IS NULL OR acc.user_id <> p.user_id THEN miss := miss || jsonb_build_object('component', 'conta', 'reason', 'A conta desta peça não existe mais. Escolha outra conta.');
      ELSIF acc.platform <> p.platform THEN miss := miss || jsonb_build_object('component', 'conta', 'reason', format('A conta "%s" é de outra rede.', acc.label));
      ELSIF acc.status <> 'connected' THEN miss := miss || jsonb_build_object('component', 'conta', 'reason', format('A conta "%s" está desconectada.', acc.label));
      END IF;
    ELSE
      SELECT linkedin_token, linkedin_author_urn, instagram_access_token, instagram_business_account_id INTO st FROM public.user_settings WHERE user_id = p.user_id;
      IF (p.platform = 'linkedin' AND (st.linkedin_token IS NULL OR st.linkedin_author_urn IS NULL))
         OR (p.platform = 'instagram' AND (st.instagram_access_token IS NULL OR st.instagram_business_account_id IS NULL)) THEN
        miss := miss || jsonb_build_object('component', 'conta', 'reason', 'Nenhuma conta conectada para esta rede.');
      END IF;
    END IF;
  END IF;
  RETURN jsonb_build_object('ready', jsonb_array_length(miss) = 0, 'missing', miss);
END $$;
GRANT EXECUTE ON FUNCTION public.piece_readiness(uuid, text) TO authenticated, service_role;

-- ============================================================================
-- C5 · Operação de publicação (01 §5) — reserva exclusiva e estágios
-- ============================================================================
ALTER TABLE public.post_publications
  ADD COLUMN IF NOT EXISTS package_id uuid REFERENCES public.publication_packages(id),
  ADD COLUMN IF NOT EXISTS attempt_id uuid,
  ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'confirmed',
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS failure_class text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
-- registros antigos: publicado = confirmado; o resto, sem prova de ausência de envio = conferir
UPDATE public.post_publications SET stage = CASE status WHEN 'published' THEN 'confirmed' WHEN 'in_progress' THEN 'unknown' ELSE 'unknown' END;
ALTER TABLE public.post_publications DROP CONSTRAINT IF EXISTS post_publications_stage_check;
ALTER TABLE public.post_publications ADD CONSTRAINT post_publications_stage_check
  CHECK (stage IN ('reserved', 'sending', 'confirmed', 'failed_before_send', 'unknown'));
ALTER TABLE public.post_publications ALTER COLUMN stage DROP DEFAULT;
-- uma única operação ativa por peça (reserva, envio em curso ou resultado a conferir)
CREATE UNIQUE INDEX IF NOT EXISTS uq_post_publications_active ON public.post_publications(post_id)
  WHERE stage IN ('reserved', 'sending', 'unknown');
ALTER TABLE public.post_unit_publications DROP CONSTRAINT IF EXISTS post_unit_publications_status_check;
ALTER TABLE public.post_unit_publications ADD CONSTRAINT post_unit_publications_status_check CHECK (status IN ('pending', 'published', 'failed', 'unknown'));

-- Reserva: decide sob bloqueio da peça quem executa. Nunca "consultar vazio → inserir → publicar".
-- Só o servidor chama (p_user já autenticado pela função); a propriedade é conferida aqui.
CREATE OR REPLACE FUNCTION public.acquire_publication(p_post uuid, p_user uuid, p_package uuid, p_destination text, p_attempt uuid, p_lease_seconds integer DEFAULT 300)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE p public.user_posts%ROWTYPE; op public.post_publications%ROWTYPE; v int; nunits int := 1;
BEGIN
  SELECT * INTO p FROM public.user_posts WHERE id = p_post FOR UPDATE;
  IF NOT FOUND OR p.user_id <> p_user THEN RAISE EXCEPTION 'Post nao encontrado' USING ERRCODE = 'PT404'; END IF;

  SELECT * INTO op FROM public.post_publications WHERE post_id = p_post AND stage = 'confirmed' ORDER BY finished_at DESC NULLS LAST LIMIT 1;
  IF FOUND THEN
    -- reparo da projeção: confirmado na rede mas a peça não ficou como publicada (01 §5.4)
    IF p.status <> 'published' THEN
      UPDATE public.user_posts SET status = 'published', published_url = COALESCE(op.url, published_url), published_at = COALESCE(published_at, op.finished_at, now()),
             published_date = COALESCE(published_date, op.finished_at, now()), publish_error = NULL WHERE id = p_post;
    END IF;
    RETURN jsonb_build_object('state', 'already_published', 'publication_id', op.id, 'url', op.url, 'external_id', op.external_id);
  END IF;
  IF p.status = 'published' THEN RETURN jsonb_build_object('state', 'already_published', 'url', p.published_url); END IF;

  SELECT * INTO op FROM public.post_publications WHERE post_id = p_post AND stage IN ('reserved', 'sending', 'unknown') FOR UPDATE;
  IF FOUND THEN
    IF op.stage = 'unknown' THEN RETURN jsonb_build_object('state', 'needs_reconciliation', 'publication_id', op.id, 'error', op.error); END IF;
    IF op.lease_expires_at > now() THEN RETURN jsonb_build_object('state', 'in_progress', 'publication_id', op.id); END IF;
    IF op.stage = 'sending' THEN
      -- o executor anterior pode ter enviado: vencer o prazo NÃO autoriza reenviar
      UPDATE public.post_publications SET stage = 'unknown', failure_class = 'lease_expired_while_sending', status = 'failed',
             error = COALESCE(error, 'A execução anterior parou durante o envio.'), updated_at = now() WHERE id = op.id;
      RETURN jsonb_build_object('state', 'needs_reconciliation', 'publication_id', op.id);
    END IF;
    -- reserva vencida sem envio iniciado: esta tentativa assume
    UPDATE public.post_publications SET attempt_id = p_attempt, lease_expires_at = now() + make_interval(secs => p_lease_seconds),
           package_id = p_package, destination = p_destination, updated_at = now() WHERE id = op.id;
    RETURN jsonb_build_object('state', 'acquired', 'publication_id', op.id, 'attempt_id', p_attempt);
  END IF;

  IF p_package IS NOT NULL THEN
    SELECT source_version, COALESCE(jsonb_array_length(manifest->'units'), 1) INTO v, nunits FROM public.publication_packages WHERE id = p_package AND post_id = p_post;
    IF v IS NULL THEN RAISE EXCEPTION 'Pacote não pertence a esta peça.' USING ERRCODE = 'PT409'; END IF;
  ELSE
    v := COALESCE(p.scheduled_version, p.version, 1);
  END IF;

  -- mesma (peça, versão, destino) que falhou comprovadamente antes do envio: nova tentativa no mesmo registro
  UPDATE public.post_publications SET stage = 'reserved', status = 'in_progress', attempt_id = p_attempt, package_id = p_package,
         lease_expires_at = now() + make_interval(secs => p_lease_seconds), error = NULL, failure_class = NULL, finished_at = NULL, updated_at = now()
   WHERE post_id = p_post AND version = v AND destination = p_destination AND stage = 'failed_before_send'
  RETURNING * INTO op;
  IF NOT FOUND THEN
    INSERT INTO public.post_publications (user_id, post_id, version, destination, platform, account_id, format, status, stage, units_total, package_id, attempt_id, lease_expires_at)
    VALUES (p.user_id, p_post, v, p_destination, p.platform, p.account_id, p.format, 'in_progress', 'reserved', GREATEST(nunits, 1), p_package, p_attempt, now() + make_interval(secs => p_lease_seconds))
    RETURNING * INTO op;
  END IF;
  RETURN jsonb_build_object('state', 'acquired', 'publication_id', op.id, 'attempt_id', p_attempt);
END $$;

-- Início do efeito externo: só quem detém a reserva passa daqui.
CREATE OR REPLACE FUNCTION public.mark_publication_sending(p_pub uuid, p_attempt uuid) RETURNS void LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  UPDATE public.post_publications SET stage = 'sending', updated_at = now(), lease_expires_at = GREATEST(lease_expires_at, now() + interval '5 minutes')
   WHERE id = p_pub AND attempt_id = p_attempt AND stage = 'reserved';
  IF NOT FOUND THEN RAISE EXCEPTION 'A reserva desta publicação não pertence mais a esta tentativa.' USING ERRCODE = 'PT409'; END IF;
END $$;

-- Resultado confirmado pela rede: grava primeiro o resultado, depois projeta na peça (mesma transação).
CREATE OR REPLACE FUNCTION public.confirm_publication(p_pub uuid, p_external_id text, p_url text, p_units integer DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE op public.post_publications%ROWTYPE;
BEGIN
  UPDATE public.post_publications SET stage = 'confirmed', status = 'published', external_id = p_external_id, url = p_url, error = NULL, failure_class = NULL,
         units_published = COALESCE(p_units, units_total), finished_at = now(), updated_at = now()
   WHERE id = p_pub RETURNING * INTO op;
  IF NOT FOUND THEN RAISE EXCEPTION 'Publicação não encontrada.' USING ERRCODE = 'PT404'; END IF;
  UPDATE public.user_posts SET status = 'published', published_url = p_url, published_at = now(), published_date = now(), publish_error = NULL,
         metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('published_version', op.version, 'published_package_id', op.package_id)
   WHERE id = op.post_id;
END $$;

-- Falha: antes do envio (pode tentar de novo) × resultado desconhecido (conferir antes de qualquer reenvio).
CREATE OR REPLACE FUNCTION public.fail_publication(p_pub uuid, p_before_send boolean, p_error text, p_class text DEFAULT NULL, p_units integer DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE op public.post_publications%ROWTYPE;
BEGIN
  UPDATE public.post_publications SET stage = CASE WHEN p_before_send THEN 'failed_before_send' ELSE 'unknown' END,
         status = CASE WHEN COALESCE(p_units, 0) > 0 THEN 'partial' ELSE 'failed' END,
         units_published = COALESCE(p_units, units_published), error = left(p_error, 1000), failure_class = p_class, finished_at = now(), updated_at = now()
   WHERE id = p_pub RETURNING * INTO op;
  IF FOUND THEN UPDATE public.user_posts SET publish_error = left(p_error, 1000) WHERE id = op.post_id; END IF;
END $$;

-- Conferência humana de um resultado incerto (01 §4.3): "foi publicado" (com o link) ou "não foi publicado".
CREATE OR REPLACE FUNCTION public.reconcile_publication(p_pub uuid, p_published boolean, p_url text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE op public.post_publications%ROWTYPE;
BEGIN
  SELECT * INTO op FROM public.post_publications WHERE id = p_pub FOR UPDATE;
  IF NOT FOUND OR op.user_id <> auth.uid() THEN RAISE EXCEPTION 'Publicação não encontrada.' USING ERRCODE = 'PT404'; END IF;
  IF op.stage <> 'unknown' THEN RAISE EXCEPTION 'Esta publicação não está aguardando conferência.' USING ERRCODE = 'PT409'; END IF;
  IF p_published THEN
    IF COALESCE(trim(p_url), '') = '' THEN RAISE EXCEPTION 'Informe o link da publicação.' USING ERRCODE = 'PT422'; END IF;
    PERFORM public.confirm_publication(p_pub, NULL, p_url, NULL);
    UPDATE public.post_publications SET failure_class = 'reconciled_published' WHERE id = p_pub;
  ELSE
    UPDATE public.post_publications SET stage = 'failed_before_send', failure_class = 'reconciled_not_published', updated_at = now() WHERE id = p_pub;
    UPDATE public.post_unit_publications SET status = 'failed' WHERE publication_id = p_pub AND status = 'unknown';
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;
GRANT EXECUTE ON FUNCTION public.reconcile_publication(uuid, boolean, text) TO authenticated;

-- Publicação feita fora da Hive (exportou e postou à mão): registra o resultado como confirmado.
CREATE OR REPLACE FUNCTION public.register_manual_publication(p_post uuid, p_url text DEFAULT NULL) RETURNS public.user_posts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.user_posts%ROWTYPE; pub uuid;
BEGIN
  SELECT * INTO p FROM public.user_posts WHERE id = p_post FOR UPDATE;
  IF NOT FOUND OR p.user_id <> auth.uid() THEN RAISE EXCEPTION 'Peça não encontrada.' USING ERRCODE = 'PT404'; END IF;
  IF p.status = 'published' THEN RETURN p; END IF;
  IF EXISTS (SELECT 1 FROM public.post_publications WHERE post_id = p_post AND stage IN ('reserved', 'sending', 'unknown')) THEN
    RAISE EXCEPTION 'Há uma publicação automática em andamento ou a conferir para esta peça.' USING ERRCODE = 'PT409';
  END IF;
  INSERT INTO public.post_publications (user_id, post_id, version, destination, platform, account_id, format, status, stage, units_total, units_published, url, finished_at)
  VALUES (p.user_id, p.id, COALESCE(p.scheduled_version, p.version, 1), 'manual:' || p.platform, p.platform, p.account_id, p.format, 'published', 'confirmed', 1, 1, NULLIF(trim(p_url), ''), now())
  ON CONFLICT (post_id, version, destination) DO UPDATE SET stage = 'confirmed', status = 'published', url = EXCLUDED.url, finished_at = now()
  RETURNING id INTO pub;
  UPDATE public.user_posts SET status = 'published', published_url = NULLIF(trim(p_url), ''), published_at = now(), published_date = now(), publish_error = NULL,
         metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('published_manually', true, 'published_version', COALESCE(p.scheduled_version, p.version))
   WHERE id = p_post RETURNING * INTO p;
  RETURN p;
END $$;
GRANT EXECUTE ON FUNCTION public.register_manual_publication(uuid, text) TO authenticated;

-- Envio parado no meio (função derrubada): vira "conferir" — nunca "pode reenviar".
CREATE OR REPLACE FUNCTION public.expire_publication_leases() RETURNS integer LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE n int;
BEGIN
  UPDATE public.post_publications SET stage = 'unknown', status = 'failed', failure_class = 'lease_expired_while_sending',
         error = COALESCE(error, 'A execução parou durante o envio.'), updated_at = now()
   WHERE stage = 'sending' AND lease_expires_at < now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.acquire_publication(uuid, uuid, uuid, text, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_publication_sending(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirm_publication(uuid, text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_publication(uuid, boolean, text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_publication_leases() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_publication(uuid, uuid, uuid, text, uuid, integer), public.mark_publication_sending(uuid, uuid),
  public.confirm_publication(uuid, text, text, integer), public.fail_publication(uuid, boolean, text, text, integer), public.expire_publication_leases() TO service_role;

-- ============================================================================
-- C4 · Comando de agendamento idempotente (02 §9 + 03 §8/§10/§11)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.schedule_commands (
  command_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.user_posts(id) ON DELETE CASCADE,
  plan_id uuid,
  intent text NOT NULL CHECK (intent IN ('schedule', 'reschedule', 'unschedule', 'replace_package')),
  params_sha256 text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_schedule_commands_post ON public.schedule_commands(post_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_schedule_commands_plan ON public.schedule_commands(plan_id) WHERE plan_id IS NOT NULL;
ALTER TABLE public.schedule_commands ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS schedule_commands_read_own ON public.schedule_commands;
CREATE POLICY schedule_commands_read_own ON public.schedule_commands FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.commit_schedule(p_command uuid, p_user uuid, p_post uuid, p_intent text, p_when timestamptz, p_package uuid,
  p_expected_version integer, p_params_sha text, p_plan uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE p public.user_posts%ROWTYPE; prev public.schedule_commands%ROWTYPE; pk public.publication_packages%ROWTYPE; rd jsonb; res jsonb;
BEGIN
  SELECT * INTO prev FROM public.schedule_commands WHERE command_id = p_command;
  IF FOUND THEN
    IF prev.params_sha256 <> p_params_sha OR prev.post_id <> p_post THEN
      RAISE EXCEPTION 'Este pedido de agendamento já foi usado com outros dados.' USING ERRCODE = 'PT409';
    END IF;
    RETURN prev.result || jsonb_build_object('replayed', true);
  END IF;

  SELECT * INTO p FROM public.user_posts WHERE id = p_post FOR UPDATE;
  IF NOT FOUND OR p.user_id <> p_user THEN RAISE EXCEPTION 'Peça não encontrada.' USING ERRCODE = 'PT404'; END IF;
  IF p.status = 'published' OR (p.status = 'archived' AND p.published_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Este conteúdo já foi publicado e permanece no histórico.' USING ERRCODE = 'PT409';
  END IF;
  IF EXISTS (SELECT 1 FROM public.post_publications WHERE post_id = p_post AND stage IN ('reserved', 'sending', 'unknown')) THEN
    RAISE EXCEPTION 'A publicação desta peça está em andamento ou precisa ser conferida.' USING ERRCODE = 'PT409';
  END IF;
  IF p_expected_version IS NOT NULL AND p.version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'A peça mudou enquanto você agendava (versão % → %). Revise e tente de novo.', p_expected_version, p.version USING ERRCODE = 'PT409';
  END IF;
  IF p_intent IN ('schedule', 'reschedule') AND (p_when IS NULL OR p_when <= now()) THEN
    RAISE EXCEPTION 'O horário escolhido já passou. Escolha uma data futura.' USING ERRCODE = 'PT422';
  END IF;
  IF p_intent IN ('schedule', 'replace_package') THEN
    SELECT * INTO pk FROM public.publication_packages WHERE id = p_package AND post_id = p_post;
    IF NOT FOUND THEN RAISE EXCEPTION 'O pacote a programar não pertence a esta peça.' USING ERRCODE = 'PT409'; END IF;
    rd := public.piece_readiness(p_post, 'schedule');
    IF NOT (rd->>'ready')::boolean THEN
      RAISE EXCEPTION 'A peça não está pronta para agendar: %', (SELECT string_agg(m->>'reason', ' ') FROM jsonb_array_elements(rd->'missing') m) USING ERRCODE = 'PT422';
    END IF;
  END IF;

  IF p_intent = 'schedule' THEN
    UPDATE public.user_posts SET status = 'scheduled', scheduled_date = p_when, scheduled_package_id = pk.id
     WHERE id = p_post RETURNING * INTO p;
    -- pin_scheduled_version só fixa ao ENTRAR em agendado: a referência canônica manda
    UPDATE public.user_posts SET scheduled_version = pk.source_version, metadata = COALESCE(metadata, '{}'::jsonb) - 'scheduled_outdated'
     WHERE id = p_post RETURNING * INTO p;
  ELSIF p_intent = 'reschedule' THEN
    IF p.status <> 'scheduled' THEN RAISE EXCEPTION 'A peça não está agendada.' USING ERRCODE = 'PT409'; END IF;
    UPDATE public.user_posts SET scheduled_date = p_when WHERE id = p_post RETURNING * INTO p;      -- pacote inalterado
  ELSIF p_intent = 'replace_package' THEN
    IF p.status <> 'scheduled' THEN RAISE EXCEPTION 'A peça não está agendada.' USING ERRCODE = 'PT409'; END IF;
    UPDATE public.user_posts SET scheduled_package_id = pk.id, scheduled_version = pk.source_version,
           metadata = COALESCE(metadata, '{}'::jsonb) - 'scheduled_outdated' WHERE id = p_post RETURNING * INTO p;
  ELSIF p_intent = 'unschedule' THEN
    UPDATE public.user_posts SET status = CASE WHEN status = 'scheduled' THEN 'approved' ELSE status END, scheduled_date = NULL, scheduled_package_id = NULL
     WHERE id = p_post RETURNING * INTO p;
  ELSE
    RAISE EXCEPTION 'Intenção desconhecida: %', p_intent USING ERRCODE = 'PT422';
  END IF;

  res := jsonb_build_object('intent', p_intent, 'post_id', p.id, 'status', p.status, 'scheduled_date', p.scheduled_date,
    'scheduled_package_id', p.scheduled_package_id, 'scheduled_version', p.scheduled_version, 'version', p.version);
  INSERT INTO public.schedule_commands (command_id, user_id, post_id, plan_id, intent, params_sha256, result)
  VALUES (p_command, p_user, p_post, p_plan, p_intent, p_params_sha, res);
  RETURN res;
END $$;
REVOKE ALL ON FUNCTION public.commit_schedule(uuid, uuid, uuid, text, timestamptz, uuid, integer, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_schedule(uuid, uuid, uuid, text, timestamptz, uuid, integer, text, uuid) TO service_role;

COMMIT;
