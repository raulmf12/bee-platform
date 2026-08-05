-- Reta final: geracao em lote + nomenclatura + nota de viralizacao + metricas
-- de inteligencia da IA. Tudo aditivo e idempotente (IF NOT EXISTS) — nao toca
-- em dado existente nem em seed.

-- user_posts -------------------------------------------------------------
-- codigo: nomenclatura unica por post — BEE-DDMMAA-G{global}-D{dia}-V{lote}
alter table public.user_posts add column if not exists codigo text;
-- nota de viralizacao (0-100) estimada pela IA na geracao, com 1 linha de razao
alter table public.user_posts add column if not exists virality_score int;
alter table public.user_posts add column if not exists virality_reason text;
-- metricas de inteligencia: quantas correcoes a IA precisou ate ser aprovado,
-- e quantas edicoes manuais o humano fez depois (no editor).
alter table public.user_posts add column if not exists ai_edit_rounds int not null default 0;
alter table public.user_posts add column if not exists manual_edits int not null default 0;

-- ai_variations ----------------------------------------------------------
-- guarda a nota na linha PRISTINA (imutavel), junto do quote/caption originais.
alter table public.ai_variations add column if not exists virality_score int;
alter table public.ai_variations add column if not exists virality_reason text;

-- Contagem rapida de "posts do dia" e "global" por usuario na hora de montar
-- a nomenclatura (ORDER/COUNT por user_id + created_at).
create index if not exists user_posts_user_created_idx
  on public.user_posts (user_id, created_at);
