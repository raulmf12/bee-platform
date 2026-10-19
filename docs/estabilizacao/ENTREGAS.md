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

---

## E4 — Publicação exclusiva e versão programada · implantada em 18–19/10/2026

| Campo | Informação |
|---|---|
| Banco | `20261024000001_publicacao_pacote.sql`: marca `edited_after_approval` (prontidão exige aprovar a edição antes de agendar/trocar/publicar); `update_scheduled_package` antigo vira recusa explícita (+ rollback) |
| Funções | `_shared/publish.ts` reescrito (resolver pacote → `acquire_publication` → conferir sob reserva → `mark_publication_sending` → enviar o PACOTE → `confirm`/`fail`), `_shared/publish-sequence.ts` (sequências e Stories a partir do manifesto; PDF derivado guardado no pacote; falha classificada: antes do envio × resultado desconhecido), `publish-post` (409 com estado; conferência no Instagram), `publish-scheduler` (só agendamentos com pacote; expira envios parados como "conferir"), `schedule-piece` (confirmação de legado), `campaign-tick` (bundle regenerado) |
| App | `ScheduledPackageCard` (editor e agenda: programado, alterações fora do agendamento, comparar, atualizar conteúdo, confirmar material legado), `ReconcileDialog` (editor e publicação de sequência), "Publicar agora" deixa claro que antecipa a versão programada, `updateScheduledPackage` → `replace_package` |
| Critérios | 01/T04, T06, T07, T09, T10, T14, T15, T16, T17, T18 · 03/T01–T08, T11–T13, T16–T21, T27–T29, T34, T35, T37, T38 |
| Evidência | `e2e/f25-publicacao-e4.spec.ts` (5/5) + suites afetadas (f1, f5, f6, f12, f16, f18–f24). Dois defeitos reais achados pelos testes e corrigidos antes de liberar: impressão digital do manifesto contava campos vazios (todo pacote parecia adulterado) e a checagem de integridade lia a cópia da CDN em vez do arquivo gravado |
| Implantação | Pausa do agendador não foi possível (sem permissão direta na tabela do cron); risco nulo na janela — próximo agendamento só em 20/10 15:00 UTC. Agendador conferido respondendo 200 após a troca |
| Limitações | Vídeo: o pacote referencia o arquivo original (não copia por tamanho) — integridade por acessibilidade. Publicação real ainda não exercitada (decisão: só com conta/autorização de teste). |
| Retorno | Não voltar ao publicador antigo enquanto houver agendamentos com pacote (doc 03 §21): suspender o envio e manter consulta. |

### Nota para o Marcos — o que mudou
1. **O que vai ao ar é o que foi agendado.** *Antes:* editar uma peça depois de agendar mudava o que seria publicado, sem aviso (e "Publicar agora" podia regravar a imagem programada). *Agora:* ao agendar, a Hive guarda uma cópia fixa (texto + imagem + conta). Editar depois aparece como **"Há alterações fora do agendamento"**, com **Comparar** (programado × em edição) e **"Atualizar conteúdo programado"** — que só libera depois de aprovar a edição. Data e conta continuam as mesmas.
2. **Uma publicação por peça.** Botão e agendador não publicam a mesma peça duas vezes: se uma publicação já está em andamento, a outra espera; se já foi publicada, a Hive mostra o resultado e não envia de novo.
3. **Quando a rede não confirma.** Se a rede pode ter publicado sem a Hive receber a resposta, aparece **"Precisamos conferir se a publicação foi concluída"**. Nada é reenviado até você dizer "Foi publicado" (com o link) ou "Não foi publicado". No Instagram, o botão **"Procurar no Instagram"** acha o post pela legenda.
4. **Agendamentos antigos pedem uma confirmação.** Os 6 agendamentos feitos antes desta versão aparecem com ⚠ na agenda e o aviso **"Confirme o material programado"**; um clique em **Confirmar material** congela a versão atual. **Até confirmar, o agendador não publica essa peça.** Próximo da fila: *"O cansaço da liderança raramente vem…"* (20/10).
5. **"Publicar agora" numa peça agendada** antecipa a versão programada (o aviso diz isso); para incluir edições, atualize o conteúdo programado antes.

---

## E5 — Navegação, orientação e retomada · implantada em 19/10/2026

| Campo | Informação |
|---|---|
| App | `src/lib/navigation.ts` (origem validada + destinos-pai; destino pendente no login/configuração), `LoadState` (erro ≠ vazio), roteador de dados (`createBrowserRouter`) para o aviso de saída, `SidebarNav` em gaveta no celular, Produção (sem "primeira campanha" silenciosa, `?step=`, respostas antigas descartadas, contexto limpo ao trocar), Pipeline/Agenda com foco por `?focus=`, Início com "Continuar", trilho de etapas por estado persistido, recomendação com alcance limitado |
| Critérios | 04/T01–T07, T09, T11, T12, T15–T21, T28, T29, T30, T31, T32 · parcial: T10 (avulso entra pela lista/criar), T22–T27, T33–T34 (dependem de E3/E4, já implantados) |
| Evidência | `e2e/f26-navegacao-e5.spec.ts` (9/9) + regressão completa **174/174** (19/10, 37,9 min) |
| Limitações | "Continuar" usa o último trabalho aberto neste navegador (não sincroniza entre aparelhos). Etapas que ainda não têm rascunho salvo (início da nova campanha) não prometem retomada: protegem só contra sair sem querer pelo editor. |
| Retorno | Reverter o commit do app (sem banco). |

### Nota para o Marcos — o que mudou
1. **"Voltar" sempre leva a um lugar da Hive.** *Antes:* em várias telas o Voltar dependia do histórico do navegador (link aberto direto ou em nova aba saía da Hive ou caía num fluxo vazio). *Agora:* volta para de onde você veio (agenda, conteúdos, produção, revisão) e, sem origem, para o lugar certo: Criar → Início; Nova campanha → Campanhas; peça → Conteúdos com a peça aberta. O botão diz o destino ("Voltar à agenda").
2. **Abrir uma peça pela agenda e voltar** reabre a agenda no mês da peça, com o painel dela aberto.
3. **Link de peça sem estar logado:** depois de entrar, você cai na peça (não no Início).
4. **Produção não escolhe campanha por você.** *Antes:* entrar em Produção abria a primeira campanha da lista. *Agora:* abre a que você estava trabalhando por último; se houver uma só, abre ela; se houver várias e nenhuma anterior, pede para escolher. A etapa que você abriu fica no endereço — recarregar não te joga para outra etapa.
5. **Erro de carregamento não parece "vazio".** Se a Hive não consegue carregar, aparece "Não foi possível carregar… — tente de novo", em vez de "Nenhuma campanha" ou "Nada esperando por você".
6. **Sair do editor com alteração não salva pergunta antes:** Salvar e sair · Sair sem salvar · Continuar editando.
7. **Início › "Continuar":** atalho para o último trabalho que você abriu (peça ou produção), enquanto ele ainda pede ação.
8. **Celular:** o menu completo abre pelo botão ☰ no topo.
