-- Transferir uma conta social para outra (ex.: reconectou o Instagram e a conta
-- antiga foi apagada). Atualiza TODAS as referências: campanha (contas e cadência),
-- plano dos ciclos, canais das ideias e peças. Antes, apagar a conta deixava ids
-- órfãos e a produção falhava com 23503 (FK em user_posts.account_id).
-- SECURITY INVOKER: a RLS garante que só mexe nos dados do dono.
CREATE OR REPLACE FUNCTION public.remap_social_account(old_id uuid, new_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE o text := old_id::text; n text := new_id::text; c int; cy int; i int; p int;
BEGIN
  IF old_id = new_id THEN RETURN jsonb_build_object('campaigns', 0); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.social_accounts WHERE id = new_id) THEN
    RAISE EXCEPTION 'Conta de destino não encontrada' USING ERRCODE = 'foreign_key_violation';
  END IF;
  UPDATE public.campaigns SET
      account_ids = (SELECT array_agg(DISTINCT x) FROM unnest(array_replace(account_ids, old_id, new_id)) x),
      cadence = CASE WHEN cadence ? o THEN (cadence - o) || jsonb_build_object(n, COALESCE((cadence->>n)::int, 0) + (cadence->>o)::int) ELSE cadence END
    WHERE old_id = ANY(account_ids) OR cadence ? o;
  GET DIAGNOSTICS c = ROW_COUNT;
  UPDATE public.campaign_cycles SET plan = replace(plan::text, o, n)::jsonb WHERE plan::text LIKE '%' || o || '%';
  GET DIAGNOSTICS cy = ROW_COUNT;
  UPDATE public.ideas SET channels = replace(channels::text, o, n)::jsonb WHERE channels::text LIKE '%' || o || '%';
  GET DIAGNOSTICS i = ROW_COUNT;
  UPDATE public.user_posts SET account_id = new_id WHERE account_id = old_id;
  GET DIAGNOSTICS p = ROW_COUNT;
  RETURN jsonb_build_object('campaigns', c, 'cycles', cy, 'ideas', i, 'posts', p);
END $$;
GRANT EXECUTE ON FUNCTION public.remap_social_account(uuid, uuid) TO authenticated, service_role;
