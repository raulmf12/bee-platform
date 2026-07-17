-- Aposenta o template "Bee Quote" legado (sem slug).
--
-- Ele foi semeado antes de os templates virarem dado: os fields dele nao tem
-- `text_rules`, entao o hidratador generico deixaria a frase estatica — a
-- textbox nao se adaptaria ao tamanho do texto da IA. Os 3 templates com slug
-- (bee-quote-portrait/square/landscape) o substituem.
--
-- Arquivar em vez de apagar: 9 posts apontam pra ele via template_id, e essa
-- referencia e o registro historico de quem gerou aquele post. is_archived tira
-- ele da listagem (templateApi.list filtra is_archived=false) sem tocar nas FKs.
-- Os posts ja tem o Fabric JSON renderizado salvo, entao nada muda pra eles.
--
-- Fresh install: no-op (nao existe linha legada).

update public.post_templates
set is_archived = true,
    is_default  = false,
    updated_at  = now()
where slug is null
  and is_system = true
  and name = 'Bee Quote';
