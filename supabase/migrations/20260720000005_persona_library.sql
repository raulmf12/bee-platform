-- Biblioteca de personas — pessoas de verdade, não atributos de marketing.
--
-- O simulador de público montava a persona de campos abstratos (dor, gatilhos,
-- benefícios). Ninguém "tem gatilhos". Uma pessoa tem nome, idade, um trabalho,
-- uma história, memórias. Aqui cada persona é uma PESSOA INTEIRA — encarnada.
--
-- A IA gera a ficha a partir de um público-base (um avatar ou o público de um
-- editorial) + as pistas do usuário, ancorando a pessoa na dor/desejo reais.
-- Você edita e salva. No simulador você conversa com "Ricardo, 44", não com
-- "O Identificado".

create table if not exists public.bee_personas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),

  -- A pessoa
  nome text not null,
  idade int,
  cargo text,
  empresa text,          -- setor/porte, anonimizado
  historia text,         -- como chegou até aqui
  rotina text,           -- como é o dia dela
  personalidade text,    -- temperamento, como fala, manias
  memorias text[] not null default '{}',   -- experiências que a marcaram
  valores text[] not null default '{}',    -- o que ela valoriza

  -- A âncora no público real (pra ela continuar sendo o seu público-alvo)
  dor text,
  desejo text,
  objecoes text[] not null default '{}',
  gatilhos text[] not null default '{}',
  linguagem text,

  -- De onde ela veio: 'avatar' | 'editorial' | 'livre' + o slug da âncora
  base_tipo text,
  base_ref text,

  is_active boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bee_personas_user_idx on public.bee_personas (user_id, position);

alter table public.bee_personas enable row level security;
drop policy if exists bee_personas_own on public.bee_personas;
create policy bee_personas_own on public.bee_personas
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
