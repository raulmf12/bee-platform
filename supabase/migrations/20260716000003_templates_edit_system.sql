-- Permite editar os templates de sistema pelo editor de templates.
--
-- A policy templates_modify_own exige user_id = auth.uid(), e template de
-- sistema tem user_id = null — entao salvar um Bee Quote no editor era barrado
-- pelo RLS. Aqui os templates de sistema sao a metodologia visual da casa, e
-- quem usa o sistema e dono dela: alterar o Bee Quote e caso de uso, nao abuso.
--
-- Escopo de proposito estreito:
--   - FOR UPDATE apenas (nao INSERT/DELETE): ninguem apaga nem forja o seed
--   - with check (is_system) impede converter um template de sistema em proprio
--
-- Criar templates novos continua pela templates_modify_own (user_id = auth.uid()).

drop policy if exists templates_update_system on public.post_templates;

create policy templates_update_system
  on public.post_templates
  for update
  to authenticated
  using (is_system = true)
  with check (is_system = true);
