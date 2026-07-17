-- Medicao de eficacia da IA — a base pra campanha autonoma.
--
-- A ideia: o botao Aprovar e o instrumento de medicao. Aprovar sem ter tocado
-- no texto = a IA acertou. Aprovar depois de editar = errou, e o diff vira licao.
--
-- O tijolo que faltava: hoje a geracao pristina e DESCARTADA — o NewPost salva
-- o texto ja editado por cima em carousel_text. Sem guardar o original nao ha
-- lado esquerdo do diff, e nada disso e mensuravel. ai_variations resolve isso.
--
-- Regua (decidida com o usuario): QUALQUER edicao de texto conta como erro.
-- Mexer no canvas nao conta — so quote e caption.

-- ---------------------------------------------------------------------------
-- Novo status: pending_approval
-- Todo post gerado nasce aqui e so sai por decisao humana (Aprovar).
-- ---------------------------------------------------------------------------
alter table public.user_posts drop constraint if exists user_posts_status_check;
alter table public.user_posts add constraint user_posts_status_check
  check (status = any (array[
    'idea'::text, 'draft'::text, 'pending_approval'::text,
    'approved'::text, 'scheduled'::text, 'published'::text, 'archived'::text
  ]));

-- ---------------------------------------------------------------------------
-- 1 linha por pedido de geracao (o lote de variacoes)
-- ---------------------------------------------------------------------------
create table if not exists public.ai_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  editorial_slug text,
  target_avatar text,
  platform text,
  briefing text,
  arsenal_item_id uuid,
  model text,
  variations_count int not null default 1,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- O texto ORIGINAL da IA. Imutavel: e o lado esquerdo de todo diff.
-- Nunca escreva aqui depois do insert.
-- ---------------------------------------------------------------------------
create table if not exists public.ai_variations (
  id uuid primary key default gen_random_uuid(),
  generation_id uuid not null references public.ai_generations(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  idx int not null,
  quote text not null default '',
  caption text not null default '',
  headline_type text,
  analogy text,
  post_id uuid references public.user_posts(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (generation_id, idx)
);

-- ---------------------------------------------------------------------------
-- A medicao. 1 por post aprovado (reaprovar atualiza, nao duplica).
-- ---------------------------------------------------------------------------
create table if not exists public.ai_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  variation_id uuid references public.ai_variations(id) on delete set null,
  generation_id uuid references public.ai_generations(id) on delete set null,
  post_id uuid not null references public.user_posts(id) on delete cascade,
  quote_original text not null default '',
  quote_final text not null default '',
  caption_original text not null default '',
  caption_final text not null default '',
  quote_changed boolean not null default false,
  caption_changed boolean not null default false,
  -- a regua: mudou o quote OU a caption
  changed boolean not null default false,
  -- informativo (nao e a regua): % do texto que mudou
  drift_pct numeric,
  created_at timestamptz not null default now(),
  unique (post_id)
);

create index if not exists ai_reviews_user_created_idx
  on public.ai_reviews (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- As licoes destiladas das correcoes. Entram no prompt sozinhas (ativo=true);
-- o usuario desliga o que nao fizer sentido pelo dashboard.
--
-- evidencias: quantas correcoes distintas reforcaram a mesma licao. Sem isso,
-- 30 correcoes viram 30 licoes quase-iguais e o prompt vira ruido.
-- ---------------------------------------------------------------------------
create table if not exists public.ai_learnings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  texto text not null,
  categoria text not null default 'voz',
  evidencias int not null default 1,
  ativo boolean not null default true,
  exemplo_antes text,
  exemplo_depois text,
  origem_review_id uuid references public.ai_reviews(id) on delete set null,
  last_reforcada_em timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists ai_learnings_user_ativo_idx
  on public.ai_learnings (user_id, ativo, evidencias desc);

-- ---------------------------------------------------------------------------
-- O PORTAO.
--
-- Vive no banco porque dois lados diferentes consultam: o frontend (mostra o
-- cadeado) e o editorial-line-tick (roda no cron, sem sessao). Duas
-- implementacoes divergiriam e a campanha destravaria num lado so.
--
-- Duas exigencias, nao uma:
--   - 30 posts revisados (amostra)
--   - de pelo menos 6 geracoes distintas
-- As 5 variacoes de uma geracao NAO sao independentes (mesmo editorial, mesmo
-- arsenal, mesmo prompt): 20 posts de 4 geracoes sao 4 tentativas de verdade,
-- nao 20. Por isso a 2a regra.
--
-- A janela e 30, nao 20, POR CAUSA da 2a regra: com 5 variacoes por geracao,
-- uma janela de 20 posts comporta no maximo 4 geracoes (20/5) — exigir 6 nela
-- seria impossivel e o portao nunca abriria. 30/5 = 6 fecha a conta.
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
    select r.changed, r.generation_id
    from public.ai_reviews r, alvo
    where r.user_id = alvo.uid
    -- desempate por id: sem ele, revisoes com o mesmo created_at (mesmo
    -- milissegundo, ou a mesma transacao) tornariam a janela nao-deterministica
    order by r.created_at desc, r.id desc
    limit 30
  ),
  agg as (
    select
      count(*)::int as amostra,
      count(*) filter (where not changed)::int as intactos,
      count(*) filter (where changed)::int as alterados,
      count(distinct generation_id)::int as geracoes
    from janela
  )
  select jsonb_build_object(
    'amostra', a.amostra,
    'intactos', a.intactos,
    'alterados', a.alterados,
    'geracoes', a.geracoes,
    'acuracia', case when a.amostra = 0 then 0
                     else round((a.intactos::numeric / a.amostra) * 100, 1) end,
    'meta', 90,
    'min_amostra', 30,
    'min_geracoes', 6,
    'destravada', (
      a.amostra >= 30
      and a.geracoes >= 6
      and (a.intactos::numeric / greatest(a.amostra, 1)) >= 0.90
    ),
    'total_revisados', (select count(*)::int from public.ai_reviews r, alvo where r.user_id = alvo.uid)
  )
  from agg a;
$$;

-- ---------------------------------------------------------------------------
-- RLS — cada um so ve o proprio. O tick roda como service_role e passa reto.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['ai_generations','ai_variations','ai_reviews','ai_learnings']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_own on public.%I', t, t);
    execute format(
      'create policy %I_own on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t, t
    );
  end loop;
end $$;
