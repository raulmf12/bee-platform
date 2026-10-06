-- Rollback da Biblioteca ACJ (20261007000001 + 0002). Remove só objetos ACJ; dados do
-- app (campanhas, ideias, conteúdos, peças) ficam intactos.
BEGIN;
DROP VIEW IF EXISTS public.acj_piece_results;
DROP TRIGGER IF EXISTS trg_posts_acj_inherit ON public.user_posts;
DROP TABLE IF EXISTS public.acj_learning_decisions, public.acj_learning_evidence, public.acj_learning_entries,
  public.acj_signal_readings, public.post_comments, public.acj_content_contracts, public.acj_cycle_plans,
  public.acj_campaign_plans, public.acj_definitions CASCADE;
ALTER TABLE public.user_posts DROP CONSTRAINT IF EXISTS user_posts_acj_check,
  DROP COLUMN IF EXISTS acj_primary, DROP COLUMN IF EXISTS acj_secondary, DROP COLUMN IF EXISTS acj_snapshot,
  DROP COLUMN IF EXISTS acj_status, DROP COLUMN IF EXISTS acj_frozen_at, DROP COLUMN IF EXISTS acj_deviation;
ALTER TABLE public.ideas DROP CONSTRAINT IF EXISTS ideas_acj_check,
  DROP COLUMN IF EXISTS acj_primary, DROP COLUMN IF EXISTS acj_secondary, DROP COLUMN IF EXISTS acj_role,
  DROP COLUMN IF EXISTS acj_rationale, DROP COLUMN IF EXISTS acj_confidence;
DROP FUNCTION IF EXISTS public.acj_piece_inherit(), public.acj_contract_propagate(), public.acj_contract_guard(),
  public.acj_campaign_plan_guard(), public.acj_campaign_plan_after(), public.acj_cycle_plan_before(),
  public.acj_learning_guard(), public.acj_learning_audit(), public.acj_learning_no_delete(),
  public.acj_mix_ok(jsonb), public.acj_valid(text);
COMMIT;
