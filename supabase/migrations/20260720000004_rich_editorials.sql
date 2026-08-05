-- Editoriais mais ricos + público-alvo por editorial.
--
-- Antes o editorial era magro: nome, descrição, estrutura, sequência emocional.
-- A geração se apoiava só nisso pra "entender" o pilar. Aqui damos corpo:
--   objetivo : o que o pilar quer provocar no leitor
--   tom      : tom de voz específico deste editorial
--   fazer    : o que este editorial SEMPRE faz (do's)
--   evitar   : o que ele NUNCA faz (don'ts)
--   temas    : temas recorrentes deste pilar
--   audience : o público-alvo PRÓPRIO deste editorial (perfil rico)
--
-- audience é aditivo: NÃO substitui o eixo identificado/incomodado (que o
-- portão da campanha usa). É o "quem" deste pilar; identificado/incomodado é o
-- "estado" do leitor. Os dois entram no prompt.
--
-- Exemplos do editorial já existem (bee_example_posts) e já viram few-shot na
-- geração — o cadastro passa a deixar você editá-los.

alter table public.bee_editorials add column if not exists objetivo text;
alter table public.bee_editorials add column if not exists tom text;
alter table public.bee_editorials add column if not exists fazer text[] not null default '{}';
alter table public.bee_editorials add column if not exists evitar text[] not null default '{}';
alter table public.bee_editorials add column if not exists temas text[] not null default '{}';

-- Perfil de público deste editorial. Forma:
--   { "quem": "...", "dor": "...", "desejo": "...",
--     "objecoes": ["..."], "gatilhos": ["..."], "linguagem": "..." }
-- {} = ainda não configurado.
alter table public.bee_editorials add column if not exists audience jsonb not null default '{}'::jsonb;
