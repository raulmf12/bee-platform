# Hive — Plano de implementação da estabilização (documentos 00 a 04)

**Data:** 18/10/2026 · **Autor:** Raul (com Claude) · **Base:** documentos `00`–`04` + diagnóstico de 16/10/2026
**Situação:** plano. Nada deste documento foi implementado ainda.

---

## 1. Resumo

O objetivo é deixar confiável o caminho **aprovar → agendar → publicar → retomar**, sem módulos novos e sem refazer a plataforma.
São cinco entregas (E1–E5), mais uma conferência inicial (E0), na ordem do Documento 00:

| Entrega | O que resolve | Pacotes | Tamanho |
|---|---|---|---|
| **E0** | Conferência da base, ambiente de teste isolado e acesso ao banco | 00 | ½–1 dia |
| **E1** | Proteções imediatas: publicado não volta à fila; verificar nunca publica; render nulo não aprova; contagem verdadeira | 01, 02 | 2–3 dias |
| **E2** | Fundação comum: pacote imutável, prontidão no servidor, comando de agendamento, reserva de publicação | 01, 02, 03 | 5–6 dias |
| **E3** | Aprovação e agenda de ponta a ponta, com todos os caminhos usando o mesmo contrato | 02 (+03) | 5–7 dias |
| **E4** | Publicação exclusiva e versão programada preservada (imagem, carrossel, documento, Stories) | 01, 03 | 5–7 dias |
| **E5** | Navegação, orientação e retomada | 04 | 4–6 dias |

Cada entrega é publicada sozinha, com teste, notas de atualização para o Marcos e plano de retorno (§9).
Partes do E5 que não dependem de estado (retorno, foco, erro × vazio, menu no celular) podem andar em paralelo a partir do E1.

---

## 2. E0 — Conferência da base (já feita nesta leitura)

### 2.1 Código e produção
- O commit-base dos documentos (`de2335156…`, 15/10) **é o HEAD atual** (`de23351`). Não houve correção depois dele, então nada foi resolvido por fora.
- Funções publicadas e migrações até `20261020000001_isolamento_clientes.sql` foram aplicadas a partir deste mesmo código.
- **Os seis achados do diagnóstico continuam válidos.** Conferi cada um no código atual:

| Achado | Onde está hoje | Confirmado |
|---|---|---|
| EST-01 | `Agenda.tsx`: `PostChip`/`EventBlock` sempre `draggable`; `backToStandby` grava `approved` sem checar status; `moveToDay`/`moveToDayTime`/`rescheduleSelected` gravam `scheduled` | Sim |
| EST-02 | `PostEditor.handleStandby` chama `exportImage()` e ignora o `null` | Sim |
| EST-03 | `Agenda.applyPlan` pula linha vencida e anuncia `plan.rows.length` | Sim |
| EST-04 | `_shared/publish.ts › publishOne`: o ramo de imagem não confere `status='published'` e não tem reserva | Sim |
| EST-05 | `publishOne(..., {dryRun})`: só o ramo de sequência respeita `dryRun` | Sim |
| EST-06 | `publish.ts › loadPost`: sem `piece_versions`, cai nos campos atuais em silêncio | Sim |

### 2.2 Achados novos nesta conferência (agravam o pacote 03)
1. **Edição direta não muda a versão.** `version` só sobe com proposta aplicada (F2) e ações de sequência. Editor (legenda, canvas, "Aplicar" do Coach), wizard e exportação gravam direto em `user_posts`. Numa imagem única agendada e editada, `scheduled_version = version`: **o que vai ao ar é a edição nova**, sem aviso.
2. **"Publicar agora" e "Agendar" no editor re-renderizam por cima do arquivo programado.** `exportImage` sobe para o mesmo caminho (`render.png`/`render.jpg`, `upsert: true`), então a URL guardada passa a servir outros bytes (03/T02–T03).
3. **Exportar = aprovar imagem.** `exportImage` grava `image_approved: true` a cada render automático (02 §6.3, T11).
4. **Agendar direto não registra versão.** `pin_scheduled_version` só copia o número; não há linha em `piece_versions` nem arquivo preservado para a imagem única.
5. **`approve_sequence` faz `ON CONFLICT … DO UPDATE`** em `piece_versions`, então o histórico pode ser reescrito (03 §3).
6. **Caminhos que gravam `approved`/`scheduled`/`published` direto:** `PostEditor` (4), `NewPost` (2), `Agenda` (5), `produce.ts` (3), `sequence/service.ts › markPublishedManually`, `PostEditor › setStatus`. Todos precisam passar pelos comandos novos (§3).
7. **O roteador é `BrowserRouter`** (sem data router), então não há `useBlocker` para proteger a saída com edição pendente (04 §11). Isso exige migrar para `createBrowserRouter` (E5).

### 2.3 Bloqueios para começar
- **Acesso ao banco:** a Management API do Supabase hoje responde *"Your account does not have the necessary privileges"*. Sem esse acesso não dá para aplicar migrações, inventariar agendamentos nem correlacionar os incidentes do Marcos com os registros. **É preciso restabelecer o acesso (ou definir quem aplica as migrações) antes do E1.**
- **Ambiente isolado:** a suíte E2E roda contra o Supabase de **produção**, com um usuário de teste. Os documentos pedem ambiente isolado para os testes de concorrência e de publicação. Proposta: um **projeto Supabase de homologação** (ou *branch* do Supabase) com as mesmas migrações, mais a variável `PUBLISH_FAKE=1` nas funções. Com ela, as chamadas ao LinkedIn/Instagram vão para um adaptador falso que **conta os envios** (§8).
- **Investigação com registros**, assim que houver acesso (doc 00 §"Pontos em investigação"): quais peças do Marcos foram afetadas; se a "repetição" é republicação, reapresentação na fila, alternativa não arquivada ou geração parecida; e se a janela de 2h do agendador deixou itens para trás. O plano não depende disso, mas a nota de atualização precisa dizer o que foi comprovado.

---

## 3. Contratos únicos (decididos antes de codificar)

O Documento 00 §6 exige **um** mecanismo por tema, sem soluções paralelas por pacote. O desenho físico fica assim:

### C1 — Pacote imutável de publicação (dono: 03)
- Tabela nova **`publication_packages`**: `id`, `post_id`, `user_id`, `brand_id`, `schema_version`, `source_version`, `platform`, `format`, `account_id` + identidade externa do destino (URN do LinkedIn / ID da conta IG), `manifest jsonb`, `manifest_sha256`, `origin` (`schedule` | `publish_now` | `legacy_confirmed`), `command_id`, `created_at`.
- `manifest`: textos enviados (legenda, título do documento, frase, alt text), arquivos (`path`, `mime`, `bytes`, `sha256`, dimensões), unidades em ordem (sequências), evidência das aprovações (quem/quando/hash do componente), versão do perfil de contexto, e `planning_notes` (ex.: enquete do Story, marcada como execução manual).
- **Imutável:** um trigger recusa `UPDATE`/`DELETE`. RLS por dono/marca, como na Fase 6.
- **Arquivos:** no fechamento, a função copia cada arquivo para `media/{user}/packages/{package_id}/{n}.{ext}` (cópia no servidor, sem `upsert`) e calcula o SHA-256 completo. A política de storage proíbe sobrescrever e apagar esse prefixo pelos caminhos normais; a limpeza de assets ignora objetos referenciados.
- `user_posts.scheduled_package_id` (FK) passa a ser a referência canônica. `scheduled_version` continua por compatibilidade e precisa concordar com ela.
- `piece_versions` continua como histórico editorial, mas deixa de ser reescrita: `approve_sequence` passa a inserir sem `DO UPDATE`.

### C2 — Prontidão por formato (dono: 02)
- Função SQL **`piece_readiness(post_id, scope)`** devolve `{ ready, missing: [{component, reason}] }`, com `scope` ∈ `approve_piece` | `schedule` | `publish`.
- Regras por formato (02 §7), lidas de `format_capabilities`: imagem única (textos aprovados, render válido, aprovação de IA quando exigida); carrossel/documento (roteiro, páginas prontas e aprovadas, legenda); Stories (sem legenda); vídeo (arquivo do vídeo, sem canvas); roteiro de gravação (nunca agendável como vídeo pronto).
- Para `schedule`/`publish`, exige também um destino resolvido e uma conta que não esteja comprovadamente desconectada (02 §8.2).
- O cliente ganha um `src/lib/readiness.ts` que **só mostra** as pendências. Quem decide é sempre o servidor.

### C3 — Aprovação por componente (dono: 02)
- RPC **`approve_component(post_id, component, content_hash, command_id)`**: grava só aquele componente, mesclando `metadata` no servidor (`jsonb_set`, nunca o objeto inteiro). Recusa se o `content_hash` não bater com o conteúdo atual (T05) e devolve o estado persistido.
- RPC **`approve_piece(post_id, expected_version, rendered_sha256)`**: confere `piece_readiness('approve_piece')`, confirma o visual **apresentado** e marca a peça como aprovada **sem apagar a data** (T25).
- Trigger **`invalidate_on_edit`**: mudou legenda, frase ou imagem → só aquele componente volta a pendente e a peça sai de "aprovada" (02 §13). O resto continua aprovado. **Não toca no pacote agendado.**

### C4 — Comando de agendamento (dono: 02, com o pacote do 03)
- Tabela **`schedule_commands`** (`command_id` único, `params_sha256`, `intent`, `result`, `plan_id`) e RPC **`commit_schedule(...)`**, atômica, com `SELECT … FOR UPDATE` na peça.
- Função de borda **`schedule-piece`**: é o coordenador único. Valida (dono, publicado protegido, operação de publicação ativa, prontidão, destino, data futura pelo relógio do servidor), fecha o pacote (C1) e chama `commit_schedule`. As intenções são `schedule`, `reschedule` (só a data, mantém o pacote), `unschedule` e `replace_package`.
- Idempotência: o mesmo `command_id` com os mesmos parâmetros devolve o resultado anterior; com parâmetros diferentes, devolve conflito (T21–T22).
- No cliente, **`src/lib/scheduling.ts`** é o único caminho: agenda (arraste, painel, sugestão), editor, wizard, `produce.ts` e plano em lote.
- Fuso: `user_settings.timezone` (padrão `America/Sao_Paulo`); grava instante em UTC e converte com `date-fns-tz` no editor, no modal e na agenda.

### C5 — Operação de publicação (dono: 01)
- `post_publications` ganha `package_id`, `attempt_id`, `stage` (`reserved` | `sending` | `confirmed` | `failed_before_send` | `unknown`), `lease_owner`, `lease_expires_at`, `fingerprint` e `failure_class`.
- Índices únicos: **uma operação ativa por peça** (`stage in reserved/sending/unknown`) e **uma confirmação por pacote + destino**.
- RPCs: **`acquire_publication`**, que devolve `acquired` | `already_published` (com o resultado) | `in_progress` | `needs_reconciliation`; **`mark_sending`**; **`confirm_publication`**, que grava o resultado externo e projeta `user_posts` na mesma transação; **`fail_publication`**, que separa falha antes do envio de falha com resultado desconhecido; e **`register_manual_publication`**, que substitui os `status: 'published'` gravados direto.
- Classificação: erro antes da chamada que cria conteúdo, ou 4xx definitivo da rede = `failed_before_send` (pode tentar de novo). Timeout, erro de rede ou 5xx durante a criação = `unknown`, que **bloqueia nova tentativa até a conferência**.
- Uma tarefa periódica passa operações `sending` com lease vencido para `unknown`, nunca para "pode reenviar". `reserved` vencido, sem envio, pode ser readquirido.
- Trigger **`protect_published`**: com `OLD.status='published'`, recusa mudança de status (exceto `archived`, a decidir em §10) e de `scheduled_date` (01/T03).

### C6 — Verificação sem efeitos (dono: 01)
- `publish-post` com `dry_run` chama **`inspectPublication()`**, que não grava nada e não chama nenhuma API de rede social. Ela usa o mesmo resolvedor de pacote (C1), a prontidão (C2) e a checagem de credenciais.
- Formato sem verificação → "Verificação ainda não disponível para este formato" (01/T13).

---

## 4. Entregas

### E1 — Proteções e confirmações imediatas
Só os recortes que são independentes de verdade (Documento 00 §7). São quatro implantações pequenas.

**E1-A · Publicado é histórico** (EST-01) — critérios 01/T01, T02, T03; 02/T32
- Banco: migração com o trigger `protect_published` (C5).
- `Agenda.tsx`: chips e blocos de peça publicada (ou com `published_url`) deixam de ser arrastáveis, ganham estilo "histórico" e o botão "Abrir publicação". `moveToDay`, `moveToDayTime`, `backToStandby`, `rescheduleSelected` e `applySuggestion` recusam peça publicada antes de chamar o servidor. O erro do trigger vira a mensagem do doc 01 §7.
- `PostEditor`: o seletor de status e o agendamento ficam desabilitados para peça publicada.
- Teste: E2E de arraste e painel; teste de banco enviando um `update` antigo direto.

**E1-B · Verificar nunca publica** (EST-05) — 01/T11, T12, T13
- `publish-post`: `dry_run` desvia para `inspectPublication()` **antes** de `publishOne`. Na imagem única: lê a peça, confere legenda, render (HEAD no arquivo), portão de IA e credenciais. Não grava `publish_attempts` e não chama rede social.
- Sequências mantêm o diagnóstico atual (`checkPackage`).
- Teste: o f20 é estendido com imagem única; o adaptador falso conta zero envios e o banco mostra tentativas/status intactos.

**E1-C · Render nulo não aprova** (EST-02) — 02/T08, T09, T10
- `handleStandby` interrompe quando `exportImage()` devolve `null` e mostra o motivo; não grava `approved` nem mostra sucesso.
- `saveCanvas`: a trava anti-branco passa a avisar que a arte não carregou, em vez de engolir o problema.
- Vídeo: usa o arquivo de vídeo, não o canvas.

**E1-D · Contagem verdadeira no lote** (EST-03) — 02/T16, T17, T18 (parcial)
- `applyPlan` conta por linha: agendadas, puladas por data vencida (com o motivo) e com erro. Se nada foi gravado, não mostra sucesso e o plano continua aberto com as pendências marcadas. Uma falha no meio preserva os sucessos e permite tentar só as pendentes.
- A persistência durável do plano entra no E3-E. Aqui o objetivo é parar a confirmação falsa.

### E2 — Fundação comum (sem mudar o comportamento visível)
Os contratos C1–C5 entram no banco e nas funções. Eles ficam prontos mas não são ligados até o E3/E4, para que nenhum escritor antigo contorne uma garantia ligada pela metade (Documento 00 §8).

- **E2-A · Prontidão no servidor (C2):** `piece_readiness` com testes de banco por formato (02/T12–T15, base).
- **E2-B · Pacote imutável (C1):** tabela, trigger, política de storage, função `seal_package` (cópia e SHA-256), limpeza que respeita referências. Critérios 03/T03, T30–T33, T36, T40.
- **E2-C · Operação de publicação (C5):** colunas, índices, RPCs, tarefa de lease e adaptador `PUBLISH_FAKE`. Critérios 01/T05–T07 (no banco, com duas conexões disputando a mesma operação).
- **E2-D · Comando de agendamento (C4):** `schedule_commands`, `commit_schedule`, função `schedule-piece`, `user_settings.timezone`. Critérios 02/T20–T22 (no banco).
- Implantação: só migrações e funções novas. O app não muda.

### E3 — Aprovação e agenda de ponta a ponta
**E3-A · Aprovação durável** — 02/T01–T05, T11, T25
- `NewPost.approveField`/`persistReview` passam a aguardar `approve_component`: estado "Salvando…", desfazem em caso de falha e permitem tentar de novo. A tela é reconstruída a partir do banco ao reabrir.
- O editor ganha o botão **"Aprovar peça"** (`approve_piece`) e o Stand-by vira **"Aprovar · sem data"**, com explicação no ponto de uso. Se a peça já tem data, pergunta antes de retirar da agenda.
- `exportImage` deixa de gravar `image_approved`: o render prepara o arquivo e só a aprovação explícita confirma o visual (T11).
- Trigger `invalidate_on_edit` ligado.

**E3-B · Salvar de verdade** — 02/T06, T07, T09, T30
- `saveText`/`saveCanvas` passam a lançar erro. O autosave guarda a revisão que está salvando e só limpa "pendente" se o conteúdo ainda for o mesmo.
- `saveAll` mostra o resultado real ("Texto salvo; não foi possível salvar a arte"…).
- Aprovar e agendar aguardam as gravações críticas. O "Aplicar" do Coach entra no mesmo contrato.

**E3-C · Prontidão por formato na interface** — 02/T12–T15
- Editor, wizard, revisão de sequência e agenda mostram as mesmas pendências, vindas de `piece_readiness`.
- Stories sem legenda e vídeo sem canvas seguem a capacidade do formato.

**E3-D · Todos os caminhos de agendamento num só comando** — 02/T16, T20–T23, T28, T29, T31, T32
- Agenda (arraste, painel, sugestão, janela sugerida), editor (`handleSchedule`), wizard (`NewPost` 1473/1476) e `produce.ts` chamam `scheduling.ts → schedule-piece`. Cada clique gera um `command_id` estável nas retentativas.
- Timeout → "Conferindo agendamento", com consulta pelo `command_id`, sem gravar de novo.
- O fuso de `user_settings` é aplicado no editor, no modal e na agenda.

**E3-E · Plano em lote durável** — 02/T17–T19
- Tabela `schedule_plans` (linhas e status) e um `command_id` por linha.
- Resumo por resultado ("3 confirmados · 1 já aplicado · 1 precisa de nova data · 1 em conferência"). "Retomar pendências" revalida o estado de cada linha; reabrir a página mostra o resultado salvo.

**E3-F · Consistência e aprendizado** — 02/T24, T26, T27
- A resposta persistida atualiza `postStore`/`useOps`. "Ver na agenda" foca a peça com conta e data corretas, mesmo com filtro ativo.
- A medição da IA (`recordReview`) sai do caminho da aprovação e vira uma fila `ai_measurement_events` com chave única por evento, processada depois. Falha fica pendente, não vira erro da aprovação e não duplica.

### E4 — Publicação exclusiva e versão programada
Implantação coordenada: **pausar o cron `publish-scheduler`**, fazer o inventário, aplicar banco → funções → app, conferir e reativar sem publicar atrasados em massa (01 §9; 03 §20).

**E4-A · Publicador único com reserva** — 01/T04–T10, T15–T17; 03/T20, T34, T35
- `publishOne` ganha o fluxo resolver → `acquire_publication` → revalidar sob a reserva → `mark_sending` → enviar → `confirm_publication`/`fail_publication`. Imagem única, vídeo e sequências usam o mesmo fluxo. `openPublication` (consulta e depois insere) é removido.
- O agendador usa a mesma aquisição e ignora operações em andamento, confirmadas ou incertas.
- Editor e `PublishPanel` tratam "já publicada" (mostra o resultado), "em andamento" e "precisa conferir".
- **Conferência de resultado incerto:** tela com o link da conta e duas ações: "Foi publicado" (colar a URL → `confirm_publication`) e "Não foi publicado" (libera uma nova tentativa). No Instagram, há uma checagem automática dos posts recentes da conta pela legenda.

**E4-B · Envio consome o pacote** — 03/T01–T10, T27–T29
- O resolvedor lê `scheduled_package_id`, ou fecha um pacote na hora para "Publicar agora" sem data. Ele confere o SHA-256 dos arquivos e interrompe se faltar algo, **sem nunca cair nos campos atuais** (fim do EST-06).
- O destino é a conta guardada no pacote. Mudar a conta padrão não muda o destino; conta removida ou remapeada pede revisão; token renovado da mesma conta continua valendo.

**E4-C · Editar depois de agendar e trocar explicitamente** — 03/T11–T19
- O editor e o painel da agenda mostram "Programado para [data] em [conta]" e "Há alterações fora do agendamento", com a comparação Programado × Em edição.
- "Atualizar conteúdo programado" (`replace_package`) aceita só versão pronta e aprovada, mostra o que muda e mantém data e conta. É bloqueado durante o envio ou com resultado incerto.
- "Publicar agora" numa peça agendada deixa claro que antecipa a versão programada.
- `update_scheduled_package` antigo fica desativado.

**E4-D · Sequências e Stories no mesmo pacote** — 03/T21–T26; 01/T14
- `loadPackage` passa a ler o manifesto: título, legenda, ordem e PDF do mesmo pacote. O PDF é montado no fechamento e guardado no prefixo imutável.
- Stories retomam só as telas confirmadas como pendentes. Uma tela com resultado incerto para a sequência até ser conferida.

**E4-E · Legado** — 03/T37–T39
- Inventário dos agendamentos ativos. Cada peça cai em um de três casos: pacote comprovável (sequência com `piece_versions` íntegro); material atual a confirmar (imagem única, o caso comum); ou sem evidência suficiente.
- Os casos "a confirmar" aparecem na agenda com o selo **"Confirme o material programado"** (miniatura, legenda, conta). Um clique gera o pacote `legacy_confirmed`. Até lá, o agendador não publica essa peça e avisa o Marcos (§10, decisão 2).

### E5 — Navegação, orientação e retomada
**E5-A · Retorno previsível** — 04/T01–T05, T07, T34
- Hook `useReturnTo` com origem estruturada (`state.from` + `?from=`), validada contra uma lista de rotas internas, e fallbacks do doc 04 §8.2: Criar → Início, Nova campanha → Campanhas, Editor → Pipeline com foco, Produção → campanha, Vídeo → lista de vídeos.
- Remove os cinco `navigate(-1)` (CreateHub, NewCampaign, NewPodcastClip, NewPost, PostEditor). Os botões passam a nomear o destino ("Voltar à agenda").
- A agenda guarda período, visão, filtros e foco na URL; o Pipeline guarda filtros e foco.

**E5-B · Leitura confiável** — 04/T15–T19, T31
- `postStore`/`useOps` ganham `error` e deixam de devolver lista vazia quando a leitura falha. Novo componente `ErrorState` com "Tentar novamente", que só consulta.
- Métricas e recomendações opcionais podem falhar sem esconder o trabalho operacional.
- Produção: helpers de parâmetros que preservam o que é independente e limpam o que é dependente; descarte de respostas atrasadas de um contexto anterior.

**E5-C · Retomada** — 04/T06, T08–T14, T20–T27, T30, T32, T33
- Produção sem parâmetros não abre mais `campaigns[0]`: retoma o último trabalho escolhido (guardado por usuário e marca, com versão), abre direto se houver uma única opção, ou mostra o seletor com a recomendação explicada. Avulsos entram na lista.
- `viewStep` vai para a URL (`?step=`). O trilho marca conclusão só por estado persistido.
- Login preserva o destino (`?next=` validado) e respeita o gate de configuração. Sair ou trocar de marca limpa a retomada local.
- Migração para `createBrowserRouter`, para usar `useBlocker`: "Salvar e sair / Sair sem salvar / Continuar editando", mais o `beforeunload`.
- Início: card "Continuar [trabalho]" a partir do último trabalho explícito; `nextMoveFrom` deixa de afirmar "tudo em dia" sem ter olhado as peças.
- Peça publicada aberta por link antigo mostra o histórico. Peça com resultado pendente abre na conferência (depende do E4).

**E5-D · Celular e acessibilidade** — 04/T28, T29
- A lista de itens do menu sai da `Sidebar` para um arquivo de configuração. Abaixo de `lg`, o `Topbar` mostra um botão que abre o mesmo menu em gaveta, com a seção ativa marcada.
- Botões só com ícone ganham nome acessível. O foco vai para o título ao trocar de tela e volta à origem ao fechar um painel.

---

## 5. Ordem e dependências

```
E0 ──► E1-A, E1-B, E1-C, E1-D  (independentes, 4 implantações)
   └─► E5-A, E5-B, E5-D       (paralelo; só navegação)
E1 ──► E2 (fundação, sem ligar) ──► E3 (agenda/aprovação) ──► E4 (publicação/pacote, com pausa do cron)
                                                    E4 ──► E5-C (partes que mostram publicação/pacote)
```
O E3 liga o comando de agendamento **já fechando o pacote**, porque o C4 depende do C1. Só o **consumo** do pacote pelo publicador espera o E4. Com isso, agendamentos novos já nascem preservados, e o legado do E4-E fica restrito ao que foi agendado antes do E3.

---

## 6. Rastreabilidade dos 124 critérios

| Pacote | Critérios → entrega |
|---|---|
| 01 (18) | T01–T03 → E1-A · T11–T13 → E1-B · T05–T07 → E2-C/E4-A · T04, T08–T10, T15–T18 → E4-A · T14 → E4-D |
| 02 (32) | T08–T10 → E1-C · T16–T18 → E1-D/E3-D/E3-E · T01–T05, T11, T25 → E3-A · T06, T07, T09, T30 → E3-B · T12–T15 → E2-A/E3-C · T20–T23, T28, T29, T31, T32 → E3-D · T19 → E3-E · T24, T26, T27 → E3-F |
| 03 (40) | T03, T30–T33, T36, T40 → E2-B · T01–T10, T27–T29 → E4-B · T11–T19 → E4-C · T20, T34, T35 → E4-A · T21–T26 → E4-D · T37–T39 → E4-E |
| 04 (34) | T01–T05, T07, T34 → E5-A · T15–T19, T31 → E5-B · T06, T08–T14, T20–T27, T30, T32, T33 → E5-C · T28, T29 → E5-D |

Cada entrega registra, na ficha do doc 00 §13, quais critérios passaram, em que ambiente e com qual evidência.

---

## 7. Implantação coordenada e legado
- **Antes de cada entrega com banco:** inventário (agendamentos ativos, operações abertas, publicados recentes), salvo em `docs/estabilizacao/inventarios/`.
- **Ordem:** migração incremental (com rollback em `supabase/rollback/`) → funções → app (Netlify). Nenhum caminho de envio fica sem a proteção nova entre um passo e outro.
- **E4:** o cron `publish-scheduler` é pausado (pelo `cron.unschedule` ou por uma flag) só durante a troca, com aviso ao Marcos. Ao reativar, a janela de 2h continua valendo e **nada atrasado é publicado em massa**.
- Não haverá limpeza em massa nem conversão automática de aprovados em pendentes. Registros sem evidência são sinalizados para revisão.

---

## 8. Testes
| Camada | O que cobre | Onde |
|---|---|---|
| Banco (SQL) | Triggers, RPCs, idempotência, concorrência com duas conexões disputando `acquire_publication`/`commit_schedule` | Projeto de homologação (`e2e/db-*.spec.ts`) |
| Funções | `inspectPublication`, resolvedor, classificação de falhas, lease; contagem de envios no adaptador `PUBLISH_FAKE` | Homologação |
| E2E (Playwright) | Fluxos de agenda, editor, wizard, sequência, retorno e login | Homologação; em produção só os que não publicam nem agendam de verdade |
| Uso (Marcos) | Exercícios A–J do doc 00 §9, com peças de teste identificadas | App publicado, contas de teste |

Nenhuma publicação real em rede social sem autorização específica e conta de teste.

---

## 9. Notas de atualização e retorno (toda entrega)
- **Nota para o Marcos** (doc 00 §14): o que mudou, antes e depois, telas afetadas, como conferir, o que fica pendente e a situação real (implementado / testado / implantado).
- **Ficha técnica** (doc 00 §13) em `docs/estabilizacao/ENTREGAS.md`.
- **Retorno:** voltar a uma combinação testada de app, funções e banco **sem apagar** pacotes, comandos, operações ou histórico. Se não houver retorno compatível para o envio, o caminho afetado é suspenso e a consulta dos resultados continua disponível.

---

## 10. Decisões que precisam do Marcos antes da entrega correspondente
1. **Editar peça aprovada volta o componente a pendente** (02 §13; entra no E3-A). Muda o dia a dia: hoje dá para mexer na legenda de uma peça aprovada sem reaprovar. Recomendação: seguir o documento.
2. **Agendamentos antigos de imagem única** (E4-E): pedir uma confirmação de um clique por peça, com a publicação pausada até lá (recomendado, mais seguro), ou adotar o material atual como programado com um aviso.
3. **Publicado → arquivado** continua permitido? Recomendação: sim, porque preserva o histórico e não reabre o envio.
4. **Conferência de resultado incerto:** só manual, ou manual + checagem automática no Instagram (recomendado)?

## 11. Fora do escopo (doc 00 §15–16)
Separação estrutural entre conteúdo e conta, novo processo de editorias, onboarding de novos produtores, calibração de voz/ACJ, novos formatos de rede e vídeo, módulos futuros (tráfego, CRM etc.) e "Criar nova peça a partir desta" para republicar.
