-- Régua graduada + histerese no portão da campanha.
--
-- ITEM 2 — a régua deixa de ser binária. Toda correção cai numa de três faixas,
-- pela distância de edição (drift_pct, que já era gravado e ignorado):
--   intacto  (não mexeu)        peso 1.0  — a IA acertou em cheio
--   ajuste   (drift <= 15%)     peso 0.6  — cosmético: pontuação, acento, 1 palavra
--   reescrita(drift  > 15%)     peso 0.0  — a IA errou o conteúdo
-- A eficácia vira a média dos pesos: mexer numa vírgula custa 0.4, não o post
-- inteiro. O limiar 15% foi medido, não chutado (ponto/acento ~4%, 1 palavra
-- num quote curto ~14%, reestruturar ~21%, reescrever metade ~49%).
--
-- ITEM 4 — o portão passa a ter MEMÓRIA e HISTERESE, e avisa quando muda.
-- Antes, `destravada` era recalculado a cada leitura e piscava no limite dos
-- 90%. Agora o estado é guardado (ai_campaign_gate) e:
--   travado   -> destrava só ao cruzar 90% (com amostra e gerações cheias)
--   destravado-> retrava só ao cair abaixo de 80% (banda de folga 80–90)
-- Um gatilho detecta a transição no momento da medição e emite um evento no
-- barramento da Alma — o (des)bloqueio deixa de ser silencioso.

-- ---------------------------------------------------------------------------
-- Estado do portão, por usuário. A histerese precisa lembrar o estado anterior.
-- ---------------------------------------------------------------------------
create table if not exists public.ai_campaign_gate (
  user_id uuid primary key default auth.uid(),
  unlocked boolean not null default false,
  unlocked_at timestamptz,
  relocked_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.ai_campaign_gate enable row level security;
drop policy if exists ai_campaign_gate_own on public.ai_campaign_gate;
create policy ai_campaign_gate_own on public.ai_campaign_gate
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- O portão. Estatísticas ao vivo (display + cold-start) + o `destravada` vindo
-- do estado guardado (histerese). Sem estado ainda = regra fria: só destrava
-- ao atingir 90% cheio (nunca no meio da banda).
-- ---------------------------------------------------------------------------
create or replace function public.ai_gate_status(p_user_id uuid default null)
returns jsonb
language sql
stable
set search_path = public
as $$
  with alvo as (
    select coalesce(p_user_id, auth.uid()) as uid
  ),
  janela as (
    select
      r.changed, r.generation_id, r.drift_pct, r.created_at,
      -- peso por severidade (a régua graduada do item 2)
      case
        when not r.changed then 1.0
        when coalesce(r.drift_pct, 100) <= 15 then 0.6
        else 0.0
      end as peso
    from public.ai_reviews r, alvo
    where r.user_id = alvo.uid
    order by r.created_at desc, r.id desc
    limit 30
  ),
  agg as (
    select
      count(*)::int as amostra,
      count(*) filter (where not changed)::int as intactos,
      count(*) filter (where changed and coalesce(drift_pct, 100) <= 15)::int as ajustes,
      count(*) filter (where changed and coalesce(drift_pct, 100) > 15)::int as reescritas,
      count(distinct generation_id)::int as geracoes,
      coalesce(sum(peso), 0)::numeric as soma_peso,
      max(created_at) as ultima_medicao
    from janela
  )
  select jsonb_build_object(
    'amostra', a.amostra,
    'intactos', a.intactos,
    'ajustes', a.ajustes,
    'reescritas', a.reescritas,
    -- compat: quem lia `alterados` continua funcionando
    'alterados', a.ajustes + a.reescritas,
    'geracoes', a.geracoes,
    'acuracia', case when a.amostra = 0 then 0
                     else round(a.soma_peso / a.amostra * 100, 1) end,
    'meta', 90,
    'min_amostra', 30,
    'min_geracoes', 6,
    'relock_band', 80,
    'ajuste_max_drift', 15,
    -- destravada vem do estado (histerese); sem estado, regra fria (>=90 cheio)
    'destravada', coalesce(
      (select g.unlocked from public.ai_campaign_gate g, alvo where g.user_id = alvo.uid),
      (a.amostra >= 30 and a.geracoes >= 6
       and (case when a.amostra = 0 then 0 else a.soma_peso / a.amostra * 100 end) >= 90)
    ),
    -- destravada mas escorregando pra banda de retravamento (80–90)
    'em_risco', coalesce(
      (select g.unlocked from public.ai_campaign_gate g, alvo where g.user_id = alvo.uid), false
    ) and (case when a.amostra = 0 then 0 else a.soma_peso / a.amostra * 100 end) < 90,
    'ultima_medicao', a.ultima_medicao,
    'total_revisados', (select count(*)::int from public.ai_reviews r, alvo where r.user_id = alvo.uid)
  )
  from agg a;
$$;

-- ---------------------------------------------------------------------------
-- O gatilho: a cada medição, recomputa com histerese e, na transição, guarda
-- o novo estado e cutuca o barramento da Alma.
-- SECURITY DEFINER: escreve em ai_campaign_gate e alma_eventos mesmo sob o RLS
-- de quem inseriu a review.
-- ---------------------------------------------------------------------------
create or replace function public.ai_gate_recompute()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  u uuid := new.user_id;
  v_amostra int;
  v_geracoes int;
  v_acc numeric;
  v_prev boolean;
  v_new boolean;
begin
  select
    count(*)::int,
    count(distinct generation_id)::int,
    case when count(*) = 0 then 0 else sum(peso) / count(*) * 100 end
  into v_amostra, v_geracoes, v_acc
  from (
    select
      generation_id,
      case
        when not r.changed then 1.0
        when coalesce(r.drift_pct, 100) <= 15 then 0.6
        else 0.0
      end as peso
    from public.ai_reviews r
    where r.user_id = u
    order by r.created_at desc, r.id desc
    limit 30
  ) w;

  select g.unlocked into v_prev from public.ai_campaign_gate g where g.user_id = u;
  v_prev := coalesce(v_prev, false);

  if v_prev then
    -- destravado: só retrava ao cair ABAIXO da banda (80). Entre 80 e 90 segura.
    v_new := not (v_acc < 80);
  else
    -- travado: só destrava com tudo cheio (amostra, gerações e 90%)
    v_new := (v_amostra >= 30 and v_geracoes >= 6 and v_acc >= 90);
  end if;

  insert into public.ai_campaign_gate (user_id, unlocked, unlocked_at, relocked_at, updated_at)
  values (
    u, v_new,
    case when v_new then now() end,
    case when not v_new then now() end,
    now()
  )
  on conflict (user_id) do update set
    unlocked    = excluded.unlocked,
    unlocked_at = case when v_new and not v_prev then now() else public.ai_campaign_gate.unlocked_at end,
    relocked_at = case when not v_new and v_prev then now() else public.ai_campaign_gate.relocked_at end,
    updated_at  = now();

  -- só emite evento na virada de estado
  if v_new is distinct from v_prev then
    insert into public.alma_eventos (tipo, descricao, source, user_id)
    values (
      case when v_new then 'campanha_destravada' else 'campanha_retravada' end,
      case when v_new
        then format('A Campanha destravou — eficácia em %s%%. A IA pode gerar sozinha.', round(v_acc, 1))
        else format('A Campanha RETRAVOU — eficácia caiu pra %s%%. Voltou pra revisão humana.', round(v_acc, 1))
      end,
      'ai-gate',
      u
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ai_gate_recompute on public.ai_reviews;
create trigger trg_ai_gate_recompute
  after insert or update on public.ai_reviews
  for each row execute function public.ai_gate_recompute();
