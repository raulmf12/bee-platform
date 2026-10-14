-- Rollback da Fase 1 (identidade e contextos). Dados de conteúdo não são apagados.
BEGIN;
DROP TRIGGER IF EXISTS trg_posts_inherit_context ON public.user_posts;
DROP FUNCTION IF EXISTS public.piece_inherit_context();
ALTER TABLE public.user_posts DROP COLUMN IF EXISTS profile_id, DROP COLUMN IF EXISTS context_snapshot_id, DROP COLUMN IF EXISTS reference_status;
ALTER TABLE public.contents DROP COLUMN IF EXISTS profile_id, DROP COLUMN IF EXISTS context_snapshot_id;
ALTER TABLE public.ideas DROP COLUMN IF EXISTS profile_id;
ALTER TABLE public.campaigns DROP COLUMN IF EXISTS profile_id, DROP COLUMN IF EXISTS profile_needs_review;
ALTER TABLE public.ai_learnings DROP COLUMN IF EXISTS brand_id, DROP COLUMN IF EXISTS front_id, DROP COLUMN IF EXISTS emitter_id, DROP COLUMN IF EXISTS profile_id;
ALTER TABLE public.bee_directives DROP COLUMN IF EXISTS front_id, DROP COLUMN IF EXISTS emitter_id, DROP COLUMN IF EXISTS profile_id;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['genesis_core','genesis_principios','genesis_lentes','genesis_tensoes','genesis_fluxo','genesis_avatares',
    'bee_editorials','bee_arsenal','bee_example_posts','bee_glossary','bee_style_rules','bee_headline_types','bee_analogies',
    'bee_hashtags','bee_directives','bee_products','knowledge_documents','design_assets','photo_references'] LOOP
    EXECUTE format('ALTER TABLE public.%I DROP COLUMN IF EXISTS brand_id', t);
  END LOOP; END $$;
DROP FUNCTION IF EXISTS public.ai_prompt_learnings(uuid, text, text, text, text[], integer, uuid, uuid, uuid);
CREATE OR REPLACE FUNCTION public.ai_prompt_learnings(p_user uuid, p_editorial text, p_platform text, p_avatar text, p_facets text[], p_limit integer DEFAULT 12)
RETURNS TABLE(texto text, categoria text, facet text, evidencias integer, especificidade integer) LANGUAGE sql STABLE SET search_path TO 'public' AS $f$
  select l.texto, l.categoria, l.facet, l.evidencias,
    ((l.editorial_slug is not null)::int + (l.platform is not null)::int + (l.target_avatar is not null)::int) as especificidade
  from public.ai_learnings l where l.user_id = p_user and l.ativo and l.facet = any(p_facets)
    and (l.editorial_slug is null or l.editorial_slug = p_editorial) and (l.platform is null or l.platform = p_platform)
    and (l.target_avatar is null or l.target_avatar = coalesce(p_avatar, 'ambos'))
  order by especificidade desc, l.evidencias desc, l.last_reforcada_em desc limit p_limit; $f$;
DROP TABLE IF EXISTS public.setup_sessions, public.context_snapshots, public.communication_profile_versions, public.communication_profiles,
  public.audiences, public.business_fronts, public.emitters, public.brands, public.workspace_members, public.workspaces CASCADE;
DROP FUNCTION IF EXISTS public.is_brand_member(uuid), public.is_workspace_member(uuid);
COMMIT;
