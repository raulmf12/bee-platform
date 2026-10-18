# Estabilização — fichas das entregas (doc 00 §13) e notas para o Marcos (doc 00 §14)

Decisões (18/10/2026): editar peça aprovada volta o componente a pendente · agendamentos legados de imagem pedem
confirmação de um clique · publicado pode ser arquivado · resultado incerto = conferência manual + checagem no Instagram.

---

## E1 — Proteções imediatas · implantada em 18/10/2026

| Campo | Informação |
|---|---|
| Itens | E1-A (EST-01), E1-B (EST-05 + parte imediata do EST-04), E1-C (EST-02), E1-D (EST-03); bloqueio do EST-06 adiantado |
| Base | `de23351` (= commit-base dos documentos) |
| Banco | `20261021000001_protege_publicados.sql` (trigger `protect_published`) · rollback em `supabase/rollback/` |
| Funções | `publish-post`, `publish-scheduler` (`_shared/publish.ts`: `inspectOne`, resultado reaproveitado, sem fallback de versão) |
| App | `Agenda.tsx`, `PostEditor.tsx`, `src/lib/errors.ts` |
| Critérios | 01/T01, T02, T03, T11, T13 · 01/T04 (parcial: sequencial, sem corrida) · 02/T08, T10, T17, T18 (parcial) |
| Evidência | `e2e/f22-estabilizacao-e1.spec.ts` (5/5) + f6, f19, f20 sem regressão — Supabase de produção, usuário E2E, nenhuma publicação real (conta com token falso) |
| Limitações | Corrida botão × agendador ainda sem reserva atômica (E4). Plano em lote ainda não sobrevive a recarregar a página (E3-E). |
| Retorno | Reverter o commit do app/funções; o trigger pode ficar (só protege histórico). |

### Nota para o Marcos — o que mudou
1. **Peça publicada fica no histórico.** *Antes:* dava para arrastar um post publicado na agenda de volta para "Conteúdos para agendar" ou para outro dia. *Agora:* o post publicado aparece mais claro, não arrasta, e o painel mostra "Este conteúdo já foi publicado e permanece no histórico" com o link da publicação. Vale também para abas antigas abertas: o banco recusa. **Conferir:** abra a Agenda, tente arrastar um post já publicado.
2. **"Verificar" nunca publica.** *Antes:* a verificação prévia de uma imagem única podia seguir até a publicação. *Agora:* só confere legenda, imagem, conta e arquivo e devolve o diagnóstico. Pedir para publicar uma peça que já foi publicada devolve "já foi publicada — nada foi enviado de novo".
3. **Stand-by não aprova peça sem imagem pronta.** *Antes:* se a imagem final não ficasse pronta (fundo de IA não aprovado, tela em branco), o Stand-by aprovava assim mesmo. *Agora:* aparece "Stand-by não concluído: a imagem final não ficou pronta" e a peça continua como estava.
4. **"IA distribuir" diz a verdade.** *Antes:* mostrava "N posts agendados" mesmo quando algum horário já tinha passado e nada era gravado. *Agora:* conta só o que foi gravado ("1 agendamento confirmado · 1 precisa de nova data"), marca cada linha com o resultado, deixa ajustar a data da pendente e "Aplicar pendentes" grava só ela.
5. **Pendente (sem mudança automática):** a peça "Sua pesquisa de clima mede conformidade…" está agendada para 09/09 e ficou parada; e "A resposta rápida não prova eficiência…" está aprovada com data — decidir na agenda (reagendar ou remover a data).
