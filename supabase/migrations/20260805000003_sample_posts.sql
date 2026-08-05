-- POSTS DE EXEMPLO — apenas pra popular a Agenda/Kanban em testes.
--
-- ⚠️ NÃO interferem no aprendizado da IA EM HIPÓTESE ALGUMA:
--   - são user_posts PUROS, sem ai_variations / ai_reviews / ai_generations
--     (o gate e o drift contam ai_reviews; sem elas, invisíveis à medição);
--   - marcados metadata.is_sample=true e auto_generated=false;
--   - sem arsenal_item_id (não entram no "pastArsenalPosts" da geração);
--   - o PostEditor pula a medição pra is_sample mesmo se aprovado à mão.
--
-- ai_edit_rounds e manual_edits nascem em 0 (como todo post real deve nascer).
-- Guardado: só insere se ainda não houver posts de exemplo. Pra limpar depois:
--   delete from public.user_posts where metadata->>'is_sample' = 'true';

do $$
declare uid uuid;
begin
  select user_id into uid from public.user_settings order by created_at asc limit 1;
  if uid is null then
    select user_id into uid from public.user_posts order by created_at asc limit 1;
  end if;
  if uid is null then
    raise notice '[sample_posts] nenhum usuário encontrado; pulando seed';
    return;
  end if;
  if exists (select 1 from public.user_posts where metadata->>'is_sample' = 'true') then
    raise notice '[sample_posts] posts de exemplo já existem; pulando';
    return;
  end if;

  insert into public.user_posts
    (user_id, title, platform, format, status, caption, carousel_text, metadata,
     virality_score, virality_reason, codigo, scheduled_date, ai_edit_rounds, manual_edits)
  select
    uid, t.title, t.platform, 'image', t.status, t.caption,
    jsonb_build_object('quote', t.quote, 'caption', t.caption),
    jsonb_build_object('editorial_slug', t.ed, 'is_sample', true, 'auto_generated', false),
    t.score, t.reason, t.codigo,
    case when t.day_offset is null then null
         else ((current_date + t.day_offset) + t.tod)::timestamptz end,
    0, 0
  from (values
    ('Diagnóstico Sistêmico', 'linkedin',  'scheduled', 'O problema que você vê raramente é o problema que existe.',
     'Quando o time trava, o instinto é achar um culpado. Mas o sintoma quase nunca mora onde a dor aparece. Olhar sistêmico é seguir a corrente, não o barulho.',
     'diagnostico-sistemico', 84, 'Gancho contraintuitivo e claro.', 'BEE-EXEMPLO-01', 1, time '10:00'),
    ('Provocação de Crença', 'instagram', 'scheduled', 'Meritocracia é o nome bonito de um sistema que premia quem já largou na frente.',
     'Todo mundo defende meritocracia até olhar de onde cada um partiu. O mérito existe. A largada, também.',
     'provocacao-de-crenca', 71, 'Tensão forte, pode dividir opinião.', 'BEE-EXEMPLO-02', 3, time '18:30'),
    ('História Pessoal', 'linkedin', 'scheduled', 'Levei vinte anos para entender que liderar não é ter todas as respostas.',
     'No começo eu achava que gestor forte era gestor que sabia tudo. Hoje sei que a pergunta certa vale mais que a resposta pronta.',
     'historia-pessoal-vulneravel', 63, 'Vulnerabilidade conecta, gancho médio.', 'BEE-EXEMPLO-03', 6, time '10:00'),
    ('Bastidor da Bee', 'instagram', 'scheduled', 'Nossos melhores insights nasceram de reuniões que deram errado.',
     'A gente adora mostrar o resultado. Mas o método nasceu no erro, no ajuste, na conversa difícil que ninguém filma.',
     'bastidor-da-bee', 58, 'Humaniza a marca, potencial médio.', 'BEE-EXEMPLO-04', 9, time '18:30'),
    ('Reflexão Filosófica', 'linkedin', 'approved', 'Todo sistema entrega exatamente o resultado para o qual foi desenhado.',
     'Se o resultado incomoda, o desenho está falando. Reclamar do sintoma sem mexer no desenho é insistir no mesmo fim.',
     'reflexao-filosofica-curta', 77, 'Frase memorável, alto potencial.', 'BEE-EXEMPLO-05', null, null),
    ('Depoimento', 'instagram', 'approved', 'Ela mudou uma pergunta na reunião. O time inteiro mudou de direção.',
     'Não foi uma reestruturação. Foi uma pergunta melhor. Liderança sistêmica muitas vezes cabe numa frase.',
     'depoimento-narrativizado', 66, 'Narrativa envolvente, gancho bom.', 'BEE-EXEMPLO-06', null, null),
    ('Provocação de Crença', 'linkedin', 'approved', 'Cultura não é o que está na parede. É o que a liderança tolera no corredor.',
     'Valores emoldurados não formam cultura. O que forma é o que passa sem consequência todos os dias.',
     'provocacao-de-crenca', 90, 'Gancho afiado, altíssimo potencial.', 'BEE-EXEMPLO-07', null, null),
    ('Diagnóstico Sistêmico', 'instagram', 'approved', 'Reorganograma não conserta um problema de confiança.',
     'Trocar as caixinhas do organograma dá sensação de ação. Mas se o problema é confiança, o desenho novo herda o velho.',
     'diagnostico-sistemico', 49, 'Tema relevante, gancho mais fraco.', 'BEE-EXEMPLO-08', null, null)
  ) as t(title, platform, status, quote, caption, ed, score, reason, codigo, day_offset, tod);

  raise notice '[sample_posts] 8 posts de exemplo criados para o usuário %', uid;
end $$;
