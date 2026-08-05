-- Portão por SEGMENTO + medição por FACETA.
--
-- Antes: um portão global por usuário. Tudo ou nada.
-- Agora: o portão libera por SEGMENTO = (editoria × plataforma × alvo). No começo
-- pode liberar "diagnostico-sistemico + instagram + incomodado" enquanto o resto
-- segue travado. Cada review já sabe seu segmento (via a geração).
--
-- E a medição vira por FACETA — texto, legenda, imagem — em vez de um número só.
-- Assim a IA sabe ONDE está fraca e não "muda tudo": se texto e legenda vão bem
-- mas a imagem não, o aprendizado mira só a imagem.
--   texto  : diff do quote   (intacto/ajuste/reescrita, como já era)
--   legenda: diff da caption (idem)
--   imagem : a IA gera a imagem do slot (templates com campo de imagem); manteve
--            = intacto, trocou = reescrita. DORMENTE até os templates gerarem
--            imagem — faceta sem dados é N/A e não trava o segmento.
--
-- Um segmento libera com >= 8 posts medidos ali E cada faceta APLICÁVEL >= 90%.

-- ---------------------------------------------------------------------------
-- ai_reviews: drift POR FACETA (antes só o max) + a faceta imagem
-- ---------------------------------------------------------------------------
alter table public.ai_reviews add column if not exists quote_drift_pct numeric;
alter table public.ai_reviews add column if not exists caption_drift_pct numeric;
-- imagem: binária (manteve/trocou). has_image = havia imagem de IA pra medir.
alter table public.ai_reviews add column if not exists has_image boolean not null default false;
alter table public.ai_reviews add column if not exists image_changed boolean not null default false;

-- Backfill do drift por faceta a partir do que já existe: reviews antigas só têm
-- o drift_pct combinado. Aproxima cada faceta pelo changed (0 se intacto, senão
-- o combinado). Não há review em produção hoje, então é só higiene.
update public.ai_reviews
   set quote_drift_pct   = coalesce(quote_drift_pct,   case when quote_changed   then drift_pct else 0 end),
       caption_drift_pct = coalesce(caption_drift_pct, case when caption_changed then drift_pct else 0 end)
 where quote_drift_pct is null or caption_drift_pct is null;

-- ---------------------------------------------------------------------------
-- ai_learnings: a faceta da lição. A geração de texto só puxa texto+legenda.
-- ---------------------------------------------------------------------------
alter table public.ai_learnings add column if not exists facet text not null default 'texto';
alter table public.ai_learnings drop constraint if exists ai_learnings_facet_check;
alter table public.ai_learnings add constraint ai_learnings_facet_check
  check (facet in ('texto', 'legenda', 'imagem'));

-- ---------------------------------------------------------------------------
-- Estado do portão POR SEGMENTO (antes era ai_campaign_gate por usuário)
-- ---------------------------------------------------------------------------
create table if not exists public.ai_segment_gate (
  user_id uuid not null default auth.uid(),
  editorial_slug text not null,
  platform text not null,
  target_avatar text not null,
  unlocked boolean not null default false,
  unlocked_at timestamptz,
  relocked_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, editorial_slug, platform, target_avatar)
);

alter table public.ai_segment_gate enable row level security;
drop policy if exists ai_segment_gate_own on public.ai_segment_gate;
create policy ai_segment_gate_own on public.ai_segment_gate
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Peso de uma faceta numa review (a régua graduada, por faceta).
-- Retorna null quando a faceta NÃO se aplica (imagem sem imagem de IA).
-- ---------------------------------------------------------------------------
create or replace function public.ai_facet_peso(
  p_changed boolean, p_drift numeric, p_is_image boolean, p_has_image boolean
) returns numeric
language sql immutable as $$
  select case
    when p_is_image and not p_has_image then null           -- faceta N/A
    when p_is_image then case when p_changed then 0.0 else 1.0 end  -- imagem: binária
    when not p_changed then 1.0                              -- intacto
    when coalesce(p_drift, 100) <= 15 then 0.6               -- ajuste cosmético
    else 0.0                                                 -- reescrita
  end;
$$;

-- ---------------------------------------------------------------------------
-- ai_segment_status(user) -> jsonb com TODOS os segmentos que já têm medição,
-- cada um com acurácia por faceta e o estado de (des)bloqueio.
-- ---------------------------------------------------------------------------
create or replace function public.ai_segment_status(p_user_id uuid default null)
returns jsonb
language sql
stable
set search_path = public
as $$
  with alvo as (select coalesce(p_user_id, auth.uid()) as uid),
  -- junta cada review ao seu segmento (via a geração) e mantém as últimas 8 por segmento
  rev as (
    select
      g.editorial_slug,
      g.platform,
      coalesce(g.target_avatar, 'ambos') as target_avatar,
      r.created_at, r.id,
      r.quote_changed, r.quote_drift_pct,
      r.caption_changed, r.caption_drift_pct,
      r.has_image, r.image_changed,
      row_number() over (
        partition by g.editorial_slug, g.platform, coalesce(g.target_avatar, 'ambos')
        order by r.created_at desc, r.id desc
      ) as rn
    from public.ai_reviews r
    join public.ai_generations g on g.id = r.generation_id
    cross join alvo
    where r.user_id = alvo.uid and g.editorial_slug is not null and g.platform is not null
  ),
  janela as (select * from rev where rn <= 8),
  -- acumula peso por faceta em cada segmento
  facetado as (
    select
      editorial_slug, platform, target_avatar,
      count(*)::int as amostra,
      count(*)::int as texto_n,
      avg(public.ai_facet_peso(quote_changed, quote_drift_pct, false, true)) as texto_acc,
      count(*)::int as legenda_n,
      avg(public.ai_facet_peso(caption_changed, caption_drift_pct, false, true)) as legenda_acc,
      count(*) filter (where has_image)::int as imagem_n,
      avg(public.ai_facet_peso(image_changed, null, true, has_image)) as imagem_acc
    from janela
    group by editorial_slug, platform, target_avatar
  ),
  julgado as (
    select
      f.*,
      -- cada faceta aplicável (com amostra) precisa bater 90%; sem amostra = N/A
      (f.texto_n   > 0 and round(f.texto_acc   * 100, 1) >= 90) as texto_passa,
      (f.legenda_n > 0 and round(f.legenda_acc * 100, 1) >= 90) as legenda_passa,
      (f.imagem_n = 0 or round(f.imagem_acc * 100, 1) >= 90)    as imagem_ok,
      st.unlocked as estado_guardado
    from facetado f
    left join public.ai_segment_gate st
      on st.user_id = (select uid from alvo)
     and st.editorial_slug = f.editorial_slug
     and st.platform = f.platform
     and st.target_avatar = f.target_avatar
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'editorial_slug', editorial_slug,
    'platform', platform,
    'target_avatar', target_avatar,
    'amostra', amostra,
    'texto',   jsonb_build_object('amostra', texto_n,   'acuracia', round(texto_acc   * 100, 1), 'passa', texto_passa),
    'legenda', jsonb_build_object('amostra', legenda_n, 'acuracia', round(legenda_acc * 100, 1), 'passa', legenda_passa),
    'imagem',  jsonb_build_object('amostra', imagem_n,  'acuracia', case when imagem_n = 0 then null else round(imagem_acc * 100, 1) end, 'passa', case when imagem_n = 0 then null else imagem_ok end),
    -- destravada vem do estado guardado (histerese); sem estado = regra fria
    'destravada', coalesce(estado_guardado, (amostra >= 8 and texto_passa and legenda_passa and imagem_ok)),
    'em_risco', coalesce(estado_guardado, false) and not (texto_passa and legenda_passa and imagem_ok)
  ) order by editorial_slug, platform, target_avatar), '[]'::jsonb)
  from julgado;
$$;

-- ---------------------------------------------------------------------------
-- ai_gate_status(user) — reescrito como RESUMO dos segmentos, mantendo os
-- campos que o front já lia (compat). `destravada` global = existe >= 1
-- segmento destravado (a campanha deixa de ser toda-ou-nada).
-- ---------------------------------------------------------------------------
create or replace function public.ai_gate_status(p_user_id uuid default null)
returns jsonb
language sql
stable
set search_path = public
as $$
  with segs as (
    select jsonb_array_elements(public.ai_segment_status(p_user_id)) as s
  ),
  agg as (
    select
      count(*)::int as total_segmentos,
      count(*) filter (where (s->>'destravada')::boolean)::int as destravados,
      count(*) filter (where (s->>'em_risco')::boolean)::int as em_risco_n,
      coalesce(sum((s->>'amostra')::int), 0)::int as amostra_total
    from segs
  )
  select jsonb_build_object(
    'meta', 90,
    'min_amostra', 8,
    'relock_band', 80,
    'ajuste_max_drift', 15,
    'total_segmentos', a.total_segmentos,
    'destravados', a.destravados,
    'em_risco', a.em_risco_n > 0,
    -- a campanha está "disponível" assim que UM segmento libera
    'destravada', a.destravados > 0,
    'amostra_total', a.amostra_total,
    'segmentos', public.ai_segment_status(p_user_id)
  )
  from agg a;
$$;

-- ---------------------------------------------------------------------------
-- Gatilho: recomputa a histerese DO SEGMENTO da review e avisa na virada.
-- ---------------------------------------------------------------------------
create or replace function public.ai_gate_recompute()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  u uuid := new.user_id;
  seg record;
  s jsonb;
  v_prev boolean;
  v_new boolean;
  v_ok boolean;
begin
  -- segmento desta review (via a geração)
  select g.editorial_slug, g.platform, coalesce(g.target_avatar, 'ambos') as target_avatar
    into seg
    from public.ai_generations g where g.id = new.generation_id;
  if seg.editorial_slug is null or seg.platform is null then
    return new; -- review sem segmento (não deveria acontecer) — ignora
  end if;

  -- acha o status deste segmento no retorno de ai_segment_status
  select elem into s
    from jsonb_array_elements(public.ai_segment_status(u)) elem
   where elem->>'editorial_slug' = seg.editorial_slug
     and elem->>'platform' = seg.platform
     and elem->>'target_avatar' = seg.target_avatar
   limit 1;
  if s is null then return new; end if;

  -- "pronto pra destravar" = todas as facetas aplicáveis passam e amostra cheia
  v_ok := (s->>'amostra')::int >= 8
      and (s#>>'{texto,passa}')::boolean
      and (s#>>'{legenda,passa}')::boolean
      and coalesce((s#>>'{imagem,passa}')::boolean, true);

  select st.unlocked into v_prev from public.ai_segment_gate st
    where st.user_id = u and st.editorial_slug = seg.editorial_slug
      and st.platform = seg.platform and st.target_avatar = seg.target_avatar;
  v_prev := coalesce(v_prev, false);

  if v_prev then
    -- destravado: só retrava se ALGUMA faceta cai abaixo da banda (80)
    v_new := (
      (s#>>'{texto,acuracia}')::numeric >= 80
      and (s#>>'{legenda,acuracia}')::numeric >= 80
      and coalesce((s#>>'{imagem,acuracia}')::numeric, 100) >= 80
    );
  else
    v_new := v_ok;
  end if;

  insert into public.ai_segment_gate (user_id, editorial_slug, platform, target_avatar, unlocked, unlocked_at, relocked_at, updated_at)
  values (u, seg.editorial_slug, seg.platform, seg.target_avatar, v_new,
          case when v_new then now() end, case when not v_new then now() end, now())
  on conflict (user_id, editorial_slug, platform, target_avatar) do update set
    unlocked    = excluded.unlocked,
    unlocked_at = case when v_new and not v_prev then now() else public.ai_segment_gate.unlocked_at end,
    relocked_at = case when not v_new and v_prev then now() else public.ai_segment_gate.relocked_at end,
    updated_at  = now();

  if v_new is distinct from v_prev then
    insert into public.alma_eventos (tipo, descricao, source, user_id)
    values (
      case when v_new then 'segmento_destravado' else 'segmento_retravado' end,
      format('%s · %s · %s %s',
        seg.editorial_slug, seg.platform, seg.target_avatar,
        case when v_new then 'liberou pra autonomia' else 'RETRAVOU (eficácia caiu)' end),
      'ai-gate', u
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ai_gate_recompute on public.ai_reviews;
create trigger trg_ai_gate_recompute
  after insert or update on public.ai_reviews
  for each row execute function public.ai_gate_recompute();

-- O estado global antigo não é mais usado; o por-segmento o substitui.
drop table if exists public.ai_campaign_gate;
