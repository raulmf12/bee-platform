-- Agente de voz (chat) — um segundo caminho pra IA aprender.
--
-- Hoje a IA aprende IMPLICITO: você corrige um post, o diff vira lição. Aqui
-- entra o EXPLICITO: você conversa com um agente ("as legendas estão longas"),
-- ele destila a regra e PROPÕE — você confirma antes de virar lição. A curadoria
-- humana é obrigatória: protege a voz (uma fala solta não pode virar lei).
--
-- A lição da conversa cai no MESMO ai_learnings da correção, com duas adições:
--   origem     : 'correcao' | 'conversa' — de onde a lição veio
--   ALCANCE    : editorial_slug / platform / target_avatar (nullable)
--                null = global (vale em tudo); preenchido = vale só naquele
--                conjunto. Coerente com o portão por segmento.

-- ---------------------------------------------------------------------------
-- Mensagens do chat (uma thread rolando por usuário, simples).
-- proposals: o que o agente propôs naquela resposta (pra UI renderizar
-- Salvar/Descartar mesmo após recarregar).
-- ---------------------------------------------------------------------------
create table if not exists public.ai_chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  role text not null check (role in ('user', 'assistant')),
  content text not null default '',
  proposals jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_chat_messages_user_idx
  on public.ai_chat_messages (user_id, created_at);

alter table public.ai_chat_messages enable row level security;
drop policy if exists ai_chat_messages_own on public.ai_chat_messages;
create policy ai_chat_messages_own on public.ai_chat_messages
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- ai_learnings: origem + alcance por segmento
-- ---------------------------------------------------------------------------
alter table public.ai_learnings add column if not exists origem text not null default 'correcao';
alter table public.ai_learnings drop constraint if exists ai_learnings_origem_check;
alter table public.ai_learnings add constraint ai_learnings_origem_check
  check (origem in ('correcao', 'conversa'));

-- Alcance: null em qualquer coluna = "vale pra qualquer valor daquela dimensão".
-- Todas null = lição global. Espelham as chaves do segmento.
alter table public.ai_learnings add column if not exists editorial_slug text;
alter table public.ai_learnings add column if not exists platform text;
alter table public.ai_learnings add column if not exists target_avatar text;
alter table public.ai_learnings add column if not exists origem_chat_message_id uuid
  references public.ai_chat_messages(id) on delete set null;

-- ---------------------------------------------------------------------------
-- ai_prompt_learnings — as lições que a geração de UM segmento deve carregar.
--
-- Casa por alcance: uma lição entra se, em cada dimensão, ela é global (null)
-- OU bate com o segmento. Ordena as mais ESPECÍFICAS primeiro (uma regra
-- daquele conjunto pesa mais que uma geral), depois por evidência.
-- ---------------------------------------------------------------------------
create or replace function public.ai_prompt_learnings(
  p_user uuid,
  p_editorial text,
  p_platform text,
  p_avatar text,
  p_facets text[],
  p_limit int default 12
)
returns table (texto text, categoria text, facet text, evidencias int, especificidade int)
language sql
stable
set search_path = public
as $$
  select
    l.texto, l.categoria, l.facet, l.evidencias,
    -- quantas dimensões de alcance esta lição fixa (0 = global, 3 = bem específica)
    ((l.editorial_slug is not null)::int
      + (l.platform is not null)::int
      + (l.target_avatar is not null)::int) as especificidade
  from public.ai_learnings l
  where l.user_id = p_user
    and l.ativo
    and l.facet = any(p_facets)
    and (l.editorial_slug is null or l.editorial_slug = p_editorial)
    and (l.platform is null or l.platform = p_platform)
    and (l.target_avatar is null or l.target_avatar = coalesce(p_avatar, 'ambos'))
  order by especificidade desc, l.evidencias desc, l.last_reforcada_em desc
  limit p_limit;
$$;
