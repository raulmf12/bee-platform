-- Agenda de conteúdo: cor por editoria (customizável) + preferências de
-- distribuição automática. Tudo aditivo e idempotente (não toca dado existente).

-- Cor de cada editoria (hex). Consumida pelos cards da agenda; editável na tela
-- de Editoriais. Semeia defaults DISTINTOS pras 8 de sistema — só onde ainda não
-- há cor (não sobrescreve escolha do usuário).
alter table public.bee_editorials add column if not exists color text;

update public.bee_editorials as e set color = c.cor
from (values
  ('diagnostico-sistemico',        '#3B82F6'),
  ('historia-pessoal-vulneravel',  '#EC4899'),
  ('depoimento-narrativizado',     '#10B981'),
  ('case-anonimizado',             '#8B5CF6'),
  ('provocacao-de-crenca',         '#EF4444'),
  ('bastidor-da-bee',              '#F59E0B'),
  ('reflexao-filosofica-curta',    '#6366F1'),
  ('trecho-livro-contextualizado', '#14B8A6')
) as c(slug, cor)
where e.slug = c.slug and e.color is null;

-- Preferências de distribuição automática da agenda (horários por plataforma,
-- pular fim de semana, limite por dia). Configurável pelo usuário; default '{}'
-- (o app aplica os defaults do lib/schedule por cima quando vazio).
alter table public.user_settings add column if not exists distribution_prefs jsonb not null default '{}'::jsonb;
