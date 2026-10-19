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

---

## E2 — Fundação comum · implantada em 18/10/2026 (sem mudança visível)

| Campo | Informação |
|---|---|
| Contratos | C1 `publication_packages` + bucket `packages` (só o servidor escreve) · C2 `piece_readiness` · C4 `schedule_commands`/`commit_schedule` + função `schedule-piece` · C5 `post_publications` com estágios, `acquire_publication`, `mark_publication_sending`, `confirm_publication`, `fail_publication`, `reconcile_publication`, `register_manual_publication`, `expire_publication_leases` · `user_settings.timezone` |
| Banco | `20261022000001_fundacao_estabilizacao.sql` (+ rollback; não remove pacotes/resultados) · `approve_sequence` não reescreve histórico nem tira peça agendada da agenda · `piece_versions` só acrescenta |
| Funções | `schedule-piece` (nova), `_shared/package.ts` (fechar/conferir pacote) |
| Critérios | 01/T05 (concorrência no banco), T08, T09, T10 · 02/T16, T21, T22, T32 · 03/T01–T03 (no servidor), T36 (RLS) · base de 02/T12–T13 |
| Evidência | `e2e/f23-fundacao-e2.spec.ts` (6/6) — produção, usuário E2E, conta com token falso, nenhuma chamada à rede social |
| Ativação | Nenhum escritor/leitor antigo usa ainda: agenda/editor passam a usar no E3, publicador no E4 |
| Retorno | rollback remove só as funções; tabelas, pacotes e resultados ficam |

---

## E3 — Aprovação e agenda de ponta a ponta · implantada em 18/10/2026

| Campo | Informação |
|---|---|
| Banco | `20261023000001_aprovacao_agenda.sql`: `merge_post_review`, `approve_piece`, trigger `invalidate_on_edit`, `schedule_plans`, `ai_measurement_events` (+ rollback) |
| App | `src/lib/approval.ts`, `scheduling.ts`, `measurement.ts`, `readiness.ts`; fuso em `schedule.ts`; Agenda, Editor, NewPost, produção (`produce.ts`), sequências (registro manual) e Início |
| Critérios | 02/T01–T07, T09, T11, T16–T23, T25, T27–T30 · base de T12–T15 (indicador de pendências no editor) · T24 (medição recuperável) |
| Evidência | `e2e/f24-aprovacao-agenda-e3.spec.ts` (4/4), `e2e/unit-fuso.spec.ts` (3/3); regressão completa 155/161 → as 6 falhas eram testes que dependiam do comportamento antigo (imagem inexistente, conta sem identidade, registro sem estágio, bundle das funções) e foram atualizados; todas passam |
| Limitações | O publicador ainda lê a peça atual (o consumo do pacote programado entra no E4, logo em seguida). A revisão de sequência ainda não mostra o indicador de pendências (usa a regra própria do banco). |
| Retorno | Reverter o commit do app; rollback do banco remove só a invalidação/comandos. Planos, comandos e pacotes ficam. |

### Nota para o Marcos — o que mudou
1. **Aprovar é gravado de verdade.** *Antes:* na revisão de textos, "Aprovar" ficava verde na hora, mesmo que o salvamento falhasse; sair e voltar podia perder a aprovação, e aprovar título e legenda rápido podia apagar uma das duas. *Agora:* o botão mostra "Salvando…" e só fica aprovado quando o servidor confirmou; se o texto mudou em outra aba, a Hive avisa em vez de aprovar a versão errada.
2. **"Stand-by" virou "Aprovar · Stand-by".** Aprova a peça como você está vendo (texto + imagem final). Se a peça já tinha data, o botão vira "Aprovar" e **a data é mantida** (antes, o Stand-by tirava a peça da agenda sem avisar).
3. **Editar uma peça aprovada volta só aquela parte para revisão.** Mexer na legenda deixa a legenda pendente (a frase e a imagem continuam aprovadas) e a peça pede nova aprovação. Peça agendada continua agendada e fica marcada como "alterações fora do agendamento".
4. **Agendar é um comando só, em todas as telas.** Agenda (arrastar, painel, sugestão, "IA distribuir"), editor, criação e produção usam a mesma regra: confere se a peça está pronta (legenda, imagem, conta) e guarda uma cópia fixa do que vai ao ar. Repetir o mesmo pedido (clique duplo, rede lenta) não agenda duas vezes. O editor mostra "Para agendar falta: …" quando algo impede.
5. **Fuso de São Paulo.** Os horários são gravados e mostrados no fuso configurado (padrão São Paulo), mesmo abrindo a Hive de outro fuso.
6. **"IA distribuir" lembra o plano.** Se uma linha ficou pendente e você fechou ou recarregou a página, a agenda mostra "Há um plano com pendências" → "Retomar pendências" aplica só o que faltou.
7. **"Ver na agenda".** Depois de agendar no editor, o aviso traz um atalho que abre a agenda no mês certo com a peça aberta, mesmo com filtros.
