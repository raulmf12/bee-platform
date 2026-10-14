-- Fase 6 · Isolamento multi-cliente (Hive_Identidade_Contextos_Setup_e_Evolucao_v1 §11, §13 itens 5–6;
-- Guia de implementação §10 item 10). Antes desta migração as bases de identidade, metodologia e sistema
-- visual eram legíveis (e várias graváveis) por QUALQUER usuário autenticado. Agora:
--  - toda base com escopo de marca só é lida/gravada por membros do workspace da marca;
--  - linhas com brand_id NULL são padrões NEUTROS do produto (nunca dados da Bee);
--  - o RAG só devolve documentos globais da(s) marca(s) do usuário;
--  - um cliente novo cria o próprio workspace/marca sem herdar nada da Bee.
BEGIN;

-- 1) Escopo de marca nas tabelas que ainda não tinham (tudo o que existe hoje é da Bee).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bee_avatars','bee_logics','bee_themes','bee_suggestions','design_tokens','design_variacoes','design_manifestacoes',
                           'design_selection_config','alma_crencas','alma_dimensoes','alma_estado','alma_eventos','alma_objetivo','alma_pulsoes','alma_sombra','acj_definitions'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.brands(id) ON DELETE CASCADE', t);
      EXECUTE format('UPDATE public.%I SET brand_id = %L WHERE brand_id IS NULL', t, '0b000000-0000-4000-8000-000000000002');
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN brand_id SET DEFAULT %L', t, '0b000000-0000-4000-8000-000000000002');
    END IF;
  END LOOP;
END $$;

-- Marca "acessível": membro do workspace, ou padrão neutro do produto (brand_id NULL).
CREATE OR REPLACE FUNCTION public.brand_readable(b uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b IS NULL OR public.is_brand_member(b)
$$;
GRANT EXECUTE ON FUNCTION public.brand_readable(uuid) TO authenticated, service_role;

-- 2) RLS por marca: substitui as políticas abertas (read:true / write:true) das bases de marca.
DO $$
DECLARE t text; pol record;
BEGIN
  FOREACH t IN ARRAY ARRAY['bee_analogies','bee_arsenal','bee_avatars','bee_directives','bee_editorials','bee_example_posts','bee_glossary','bee_hashtags',
                           'bee_headline_types','bee_logics','bee_style_rules','bee_suggestions','bee_themes',
                           'genesis_avatares','genesis_core','genesis_fluxo','genesis_lentes','genesis_principios','genesis_tensoes',
                           'design_assets','design_manifestacoes','design_selection_config','design_tokens','design_variacoes','photo_references',
                           'alma_crencas','alma_dimensoes','alma_estado','alma_eventos','alma_objetivo','alma_pulsoes','alma_sombra','acj_definitions'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    FOR pol IN SELECT polname FROM pg_policy WHERE polrelid = ('public.' || t)::regclass LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.polname, t);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %1$s_brand_read ON public.%1$s FOR SELECT TO authenticated USING (public.brand_readable(brand_id))', t);
    -- Escrita só na própria marca (padrões neutros do produto só via service role).
    EXECUTE format('CREATE POLICY %1$s_brand_write ON public.%1$s FOR ALL TO authenticated USING (brand_id IS NOT NULL AND public.is_brand_member(brand_id)) WITH CHECK (brand_id IS NOT NULL AND public.is_brand_member(brand_id))', t);
  END LOOP;
END $$;
-- Editorias de sistema continuam protegidas contra exclusão.
DROP POLICY IF EXISTS bee_editorials_no_delete_system ON public.bee_editorials;
CREATE POLICY bee_editorials_no_delete_system ON public.bee_editorials AS RESTRICTIVE FOR DELETE TO authenticated USING (is_system = false);

-- Produtos: os do usuário + os de sistema DA SUA MARCA (antes: produtos de sistema visíveis a todos).
DROP POLICY IF EXISTS products_select ON public.bee_products;
CREATE POLICY products_select ON public.bee_products FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR ((user_id IS NULL OR is_system = true) AND public.brand_readable(brand_id)));

-- Conhecimento: documento global só para membros da marca dele.
DROP POLICY IF EXISTS kb_docs_select ON public.knowledge_documents;
CREATE POLICY kb_docs_select ON public.knowledge_documents FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR (is_global = true AND public.brand_readable(brand_id)));

-- 3) RAG: documentos globais só da(s) marca(s) do usuário; sem usuário, nada além do neutro.
CREATE OR REPLACE FUNCTION public.match_knowledge(query_embedding vector, match_count integer DEFAULT 5, match_threshold double precision DEFAULT 0.3, filter_user_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, document_id uuid, document_title text, content text, similarity double precision, metadata jsonb)
 LANGUAGE sql STABLE AS $function$
  SELECT kc.id, kc.document_id, kd.title AS document_title, kc.content, (1 - (kc.embedding <=> query_embedding))::FLOAT AS similarity, kc.metadata
  FROM public.knowledge_chunks kc
  JOIN public.knowledge_documents kd ON kd.id = kc.document_id
  WHERE (
      (filter_user_id IS NOT NULL AND kc.user_id = filter_user_id)
      OR (kd.is_global = TRUE AND (kd.brand_id IS NULL OR kd.brand_id IN (
            SELECT b.id FROM public.brands b JOIN public.workspace_members m ON m.workspace_id = b.workspace_id WHERE m.user_id = filter_user_id)))
    )
    AND 1 - (kc.embedding <=> query_embedding) > match_threshold
  ORDER BY kc.embedding <=> query_embedding ASC
  LIMIT match_count;
$function$;

-- Sessões de identidade só na marca de que o usuário é membro.
DROP POLICY IF EXISTS setup_sessions_all_own ON public.setup_sessions;
CREATE POLICY setup_sessions_all_own ON public.setup_sessions TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id AND (brand_id IS NULL OR public.is_brand_member(brand_id)));
-- Campanhas/ideias/conteúdos não apontam para perfil de outra marca.
CREATE OR REPLACE FUNCTION public.guard_profile_brand() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.profile_id IS NOT NULL AND auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.communication_profiles p WHERE p.id = NEW.profile_id AND public.is_brand_member(p.brand_id)) THEN
    RAISE EXCEPTION 'Perfil de comunicação fora das suas marcas.' USING ERRCODE = 'PT403';
  END IF;
  RETURN NEW;
END $$;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['campaigns', 'ideas', 'contents', 'user_posts'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_profile_brand ON public.%1$s', t);
    EXECUTE format('CREATE TRIGGER trg_%1$s_profile_brand BEFORE INSERT OR UPDATE OF profile_id ON public.%1$s FOR EACH ROW EXECUTE FUNCTION public.guard_profile_brand()', t);
  END LOOP;
END $$;

-- 4) Cliente novo: cria o PRÓPRIO workspace e marca (sem nada da Bee). Só quem ainda não tem workspace.
CREATE OR REPLACE FUNCTION public.create_my_workspace(p_workspace text, p_brand text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); ws uuid; b uuid; s text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado' USING ERRCODE = 'PT401'; END IF;
  IF EXISTS (SELECT 1 FROM public.workspace_members WHERE user_id = uid) THEN
    RAISE EXCEPTION 'Você já participa de um espaço de trabalho.' USING ERRCODE = 'PT409';
  END IF;
  IF COALESCE(trim(p_brand), '') = '' THEN RAISE EXCEPTION 'Informe o nome da marca.' USING ERRCODE = 'PT400'; END IF;
  s := trim(both '-' from regexp_replace(translate(lower(p_brand), 'áàâãéêíóôõúç', 'aaaaeeiooouc'), '[^a-z0-9]+', '-', 'g'));
  INSERT INTO public.workspaces (name, slug) VALUES (COALESCE(NULLIF(trim(p_workspace), ''), p_brand), s || '-' || substr(gen_random_uuid()::text, 1, 6)) RETURNING id INTO ws;
  INSERT INTO public.workspace_members (workspace_id, user_id, role) VALUES (ws, uid, 'owner');
  INSERT INTO public.brands (workspace_id, name, slug, is_default) VALUES (ws, trim(p_brand), s, true) RETURNING id INTO b;
  RETURN b;
END $$;
REVOKE ALL ON FUNCTION public.create_my_workspace(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_my_workspace(text, text) TO authenticated;

COMMIT;
