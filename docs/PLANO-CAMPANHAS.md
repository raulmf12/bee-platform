# Plano de implementação — Hive orientada a Campanhas

> Fonte: `~/Downloads/Passo a Passso Campanha e Conteúdo.docx` (spec de produto).
> Branch: `feat/campanhas` · Backup: `../backups/2026-09-24-pre-campanhas/` + tag `backup/pre-campanhas-2026-09-24`.
> Regra: **produção intocada até o cutover.** Migrações só aditivas; edge functions novas com nomes novos;
> mudanças em funções compartilhadas só se retrocompatíveis. Merge no `main` apenas na Fase 9.

## 1. Objetivo

Transformar a Hive de "gerador de posts" em **orquestradora de campanhas vivas em ciclos**:

```
CAMPANHA (leitura do momento → estratégia em % → duração)
  → CICLOS semanais
    → PAUTA (ideias com função estratégica)       [backlog vivo]
      → CONTEÚDO-MÃE (channel free, validado no formato do produtor)
        → PEÇAS (por conta/canal) → AGENDA → RESULTADOS → APRENDIZADO → próximo ciclo
```

Princípios que guiam toda decisão de UX: não perguntar o que a Hive já sabe · "se a Hive consegue
produzir, ela produz" · validar o pensamento antes de multiplicá-lo · recomendação em destaque,
alternativas só com ganho real · edição = selecionar → comentar → Hive ajusta · complexidade na
inteligência, não na superfície · a campanha é discreta, a ideia é a protagonista.

## 2. Decisões tomadas

| # | Decisão | Origem |
|---|---|---|
| D1 | **Sem carrossel nesta migração**: peças de imagem única (formatos atuais). | usuário |
| D2 | **Multi-conta**: tabela `social_accounts`; contas do Marcos migradas; Instagram da Bee conectado depois. | usuário |
| D3 | **Métricas**: Instagram automático (likes/comentários já; alcance/salvamentos após reconectar com permissão de Insights) + LinkedIn manual. | usuário |
| D4 | **Visual**: identidade atual (honey/navy, dark/light); layouts e fluxos dos mockups. | usuário |
| D5 | Funções estratégicas canônicas = as 5 do mix: `presenca`, `posicionamento`, `autoridade`, `relacionamento`, `produtos`. "Reflexão/Provocação" é **editorial** (eixo do *como*), não função (eixo do *porquê*) — os cards dos mockups mostram os dois. | default |
| D6 | Formato de validação do Marcos = **LinkedIn frase + texto** (o `quote`+`caption` do `generate-content`). Configurável por usuário (`user_settings.validation_format`). | spec |
| D7 | Fim do wizard de campanha segue a **Tela 08** (Revisar primeiro ciclo / Fazer depois → pendência na Home). A "Tela final" alternativa vira o estado mostrado na lista de Campanhas. | default (spec tinha 2 versões) |
| D8 | **Campanha de Vendas**: mesmo fluxo, vinculada a um Produto (`bee_products`), mix recomendado próprio (mais Produtos/Relacionamento). Refinável depois. | default (spec não detalha) |
| D9 | Ciclos **semanais** (seg–dom), criados na ativação da campanha. | spec |
| D10 | Pipeline/Kanban: **1 card = 1 ideia (backlog) ou 1 conteúdo-mãe com N peças**; coluna = estágio menos avançado entre as peças; peças aparecem dentro do card. | spec |
| D11 | Linhas editoriais + cron `editorial-line-tick`: **desativados no cutover**, dados preservados. | default |
| D12 | O gate de acurácia da IA (`destravada`) **não bloqueia** campanhas. | default |
| D13 | Vídeo (Vídeo pronto / Roteiro) mantém o fluxo atual, acessível em Criar → Um conteúdo → Vídeo. | default |
| D14 | Histórico existente vira conteúdos **"Sem campanha"** (agrupando `companion_post_id` e `reused_from`); peças mantêm status e agendamentos. | default |
| D15 | Planejamento do ciclo (necessidades, contas, frequência) é **determinístico** (distribui o mix × matriz × cadência); só a pauta e os conteúdos usam LLM. Mais barato, previsível e testável. | default |

## 3. Modelo de dados

Tudo com `user_id` + RLS `auth.uid() = user_id` (padrão do projeto). Migrações aditivas.

### 3.1 `social_accounts` (contas)
`id, user_id, platform ('linkedin'|'instagram'), label ('Marcos'|'Bee Consulting'…), handle,
is_default, status ('connected'|'disconnected'|'expired'), linkedin_token, linkedin_author_urn,
instagram_access_token, instagram_business_account_id, instagram_token_expires_at, scopes text[],
metadata, created_at, updated_at`.
Publicação passa a ler as credenciais da conta da peça (`user_posts.account_id`), com **fallback em
`user_settings`** (retrocompatível). `instagram-connect` cria/atualiza a conta; `instagram-refresh`
renova também as contas.

### 3.2 `campaigns`
`id, user_id, name, type ('organica'|'vendas'), status ('draft'|'active'|'paused'|'ended'),
intent (texto livre: "o que pretende fazer"), moment jsonb {label, summary, signals[], confirmed,
adjust_note}, strategy jsonb {mix{presenca,posicionamento,autoridade,relacionamento,produtos} (soma
100), rationale, matrix[{weeks:'1-2', levels{função:'muito_baixo'|'baixo'|'medio'|'alto'}}]},
duration_weeks, start_date, end_date, product_id, color, account_ids uuid[], cadence jsonb
{account_id: posts_por_semana}, activated_at, metadata, created_at, updated_at`.

### 3.3 `campaign_cycles`
`id, campaign_id, user_id, idx (1..N), start_date, end_date, status ('not_started'|'planned'|
'pauta_ready'|'pauta_approved'|'developing'|'producing'|'ready'|'done'), plan jsonb {needs[{function,
count}], channels[{account_id, platform, contents}], calendar[{date, slots[{account_id, platform}]}],
totals{contents, pieces}}, review_due date, created_at, updated_at`.

### 3.4 `ideas` (pauta + backlog vivo)
`id, user_id, campaign_id?, cycle_id? (null = backlog), title, summary, strategic_function,
editorial_slug, channels jsonb [{account_id, platform}], suggested_pieces, origin ('hive'|'user'|
'result'), status ('backlog'|'proposed'|'approved'|'discarded'|'developed'), position, rationale,
created_at, updated_at`.

### 3.5 `contents` (conteúdo-mãe)
`id, user_id, idea_id?, campaign_id?, cycle_id?, title, strategic_function, editorial_slug,
validation_format ('linkedin_frase_texto'…), body jsonb {frase, texto}, considered jsonb {base,
coerencia, formato}, status ('developing'|'pending_validation'|'validated'|'discarded'),
versions jsonb[] (histórico de versões), position, created_at, updated_at`.

### 3.6 `user_posts` = PEÇA (colunas novas, todas nulas por padrão)
`content_id → contents, campaign_id → campaigns, cycle_id → campaign_cycles, account_id →
social_accounts, piece_role ('validation'|'unfold'), alternative_group uuid, alternative_rank
smallint, is_recommended bool, schedule_priority smallint, suggested_start date, suggested_end date`.
Alternativas (12B) = peças irmãs com o mesmo `alternative_group`; escolher uma arquiva as outras
(`status='archived'`). Nenhum status novo no CHECK.

### 3.7 `post_metrics`
`id, user_id, post_id → user_posts, account_id, source ('instagram_api'|'manual'), captured_at,
reach, impressions, likes, comments, saves, shares, engagement_rate, raw jsonb`.
Instagram: `like_count`/`comments_count` via `instagram_basic` (já) + Insights após reconectar com
`instagram_manage_insights`. LinkedIn: entrada manual.

## 4. Backend (edge functions novas)

Padrão do projeto: `preflight` → POST → `userIdFromAuth ?? internalUserId` → rate limit → validação
→ chave Gemini → `logUsage`. Voz via `_shared/bee-context.ts` (cérebro compartilhado).

| Função | Papel | IA |
|---|---|---|
| `campaign-moment` | Leitura do momento: agrega histórico (publicações por plataforma/editorial/função, cadência, métricas, campanhas anteriores) no servidor e devolve `{label, summary, signals}`. | Gemini |
| `campaign-strategy` | Mix % recomendado + justificativa + matriz por blocos de semanas + duração recomendada. Modo *ajuste* recebe instrução em texto livre ("quero mais autoridade") e o mix atual. Normaliza para somar 100. | Gemini |
| `cycle-pauta` | Gera a pauta do ciclo (N ideias com função, editorial, canais, peças) a partir do plano do ciclo, estratégia, histórico recente (anti-repetição), backlog e metodologia. Modos: `full`, `swap` (troca 1 ideia), `refresh` (nova seleção evitando as anteriores). | Gemini + cérebro |
| `content-develop` | Desenvolve o conteúdo-mãe no formato de validação chamando o `generate-content` internamente (briefing = ideia + função + campanha; `target_platform=linkedin`). Devolve `{frase, texto, considered}`. Modo `ajuste` (instrução) e `nova_versao`. | via generate-content |
| `metrics-ingest` | Cron diário: para cada conta IG, puxa métricas dos posts publicados (60 dias) → `post_metrics`. | — |
| `campaign-tick` | Cron diário: avança status dos ciclos pelas datas e **pré-gera a pauta do próximo ciclo** (≤4 dias do início) → pendência "revisar até …" na Home. Substitui o `editorial-line-tick`. | via cycle-pauta |

Reaproveitados: `generate-content` (peças/desdobramentos via `reference_post_id`), `hive-decide` +
pipeline visual (imagem das peças), `post-chat`/`edit-text`/`regenerate-snippet` ("pedir ajuste à
Hive"), `distribute-schedule` ("IA distribuir", agora com escopo de campanha e prioridades),
`publish-*` (multi-conta).

Determinísticos no cliente (`src/lib/campaign/`): plano do ciclo (D15), prioridade de agendamento e
janela sugerida, agregação de pendências da Home, regras de "Hive recomenda".

## 5. Frontend (telas → rotas)

| Spec | Rota | Observação |
|---|---|---|
| Home regente (Tela 01) | `/` | O que está acontecendo · Precisa de você (prazos) · Hive recomenda · Próximas publicações · + Criar |
| Criar (Tela 02) | `/criar` | Campanha de conteúdos · Um conteúdo · Hive, recomende |
| Nova campanha (Telas 03–08) | `/campanhas/nova` | tipo+intenção → leitura do momento → estratégia (ajuste em texto) → duração → definida → ativa |
| Campanhas | `/campanhas`, `/campanhas/:id` | lista (Semana X de Y, estado) + detalhe com "Ver estratégia" (matriz) e ciclos |
| Produção (Telas 01–02, Planejamento, 09–12C) | `/producao` | stepper Campanha → Ciclo → Planejamento → Ideias → Desenvolvimento → Revisão |
| Galeria / Proposta / Edição (12A–12C) | `/producao/:cycleId/pecas`, `/producao/peca/:postId` | edição reusa o `CanvasStudio` embutido + "Pedir ajuste à Hive" |
| Agenda (Tela 13) | `/agenda` | evolui a atual: timeline de campanhas, lente por campanha, barras no calendário, fila priorizada, painel lateral com sugestões |
| Pipeline (Kanban) | `/pipeline` | por ideia/conteúdo, filtros Campanha/Ciclo/Conta/Canal/Editorial, banner da Hive |
| Contas | `/configuracoes` (aba Contas) | multi-conta |

Menu: Início · Campanhas · Produção · Pipeline · Agenda · Desempenho · Base Hive (Genesis, Diretrizes,
Editoriais, Arsenal, Conhecimento…) · Configurações. Saem: "Campanha de conteúdo" (linhas), "Post
individual" (fluxo de imagem antigo).

## 6. Migração dos dados (cutover)

Script idempotente e transacional (`supabase/migrations/…_campanhas_backfill.sql` + script de apoio):
1. Contas do Marcos a partir de `user_settings` (LinkedIn · Marcos, Instagram · Marcos); `account_id`
   em todas as peças por plataforma.
2. Um `contents` por grupo lógico (companion/reused_from; senão 1:1), `body = {frase: quote,
   texto: caption}`, status `validated` para aprovado/agendado/publicado; campanha nula ("Sem campanha").
3. `editorial_lines` → `ended`; cron `editorial-line-tick` desativado; `metrics-ingest` e
   `campaign-tick` ativados.
4. Conferência: contagens antes/depois; os 13 agendados intactos (mesma data/status/imagem).

**Rollback**: reverter o merge (Netlify volta a UI antiga); tabelas/colunas novas são inertes para o
código antigo; reativar o cron antigo; restaurar tabelas do backup se preciso (`pg_restore -t`).

## 7. Estratégia de testes (a cada fase)

- **Playwright** (`npm run test:e2e`): app local (vite) contra o Supabase de produção, logado como o
  usuário de teste isolado `e2e-hive@beeconsulting.test` (RLS separa dos dados do Marcos).
- IA **mockada** por interceptação de `/functions/v1/*` com fixtures realistas → fluxos determinísticos
  e sem custo. Suíte **@live** (`npm run test:e2e:live`) chama a IA de verdade nos passos-chave.
- Asserções no banco via helper administrativo (`e2e/helpers/admin.ts`) + limpeza total dos dados do
  usuário de teste antes/depois de cada spec.
- **Regressão cumulativa**: cada fase roda todos os specs anteriores + `tsc -b` + build.
- Publicação real nunca é exercida em teste (usuário de teste sem credenciais sociais).

## 8. Fases

| Fase | Entrega | E2E de aceite |
|---|---|---|
| **F0** Fundação | backup, branch, Playwright, usuário de teste, baseline | baseline 4/4 ✅ |
| **F1** Dados + contas ✅ | migrações (§3), tipos, APIs, backfill de contas, publicação multi-conta c/ fallback, aba Contas | CRUD de contas; round-trip das APIs; RLS isola usuários |
| **F2** Criação de campanha ✅ | `/criar`, wizard Telas 03–08, `campaign-moment`, `campaign-strategy`, ativação cria ciclos, `/campanhas` + detalhe | wizard completo → campanha ativa c/ N ciclos, mix = 100, ajuste por texto, "Fazer depois" → pendência |
| **F3** Planejamento + pauta ✅ | `/producao` passos 1–4, plano determinístico, `cycle-pauta` (full/swap/refresh), editar/adicionar ideia, aprovar pauta | pauta gerada, trocar/editar/adicionar, aprovar → ideias `approved` |
| **F4** Desenvolvimento/validação ✅ | `content-develop`, Telas 10–11 (loop 1 de N), ajustar/editar/nova versão, aprovar → peça LinkedIn aprovada + IG "a desenvolver" | validar 4 conteúdos → 4 peças de validação + desdobramentos previstos |
| **F5** Produção visual ✅ | desdobramentos (IG via adaptação + Hive), alternativas, galeria 12A, escolha 12B, edição 12C, conclusão | galeria → escolher alternativa → editar → aprovar → produção concluída |
| **F6** Agenda | timeline, lente de campanha, barras, fila priorizada c/ janela, arrastar, IA distribuir por campanha, painel lateral | agendar por arrasto; IA distribuir respeita campanha; painel |
| **F7** Home + Pipeline + navegação | Home regente, Pipeline por ideia, "Um conteúdo", menu novo, remoção dos fluxos antigos | Home mostra pendências reais; Kanban agrupa peças; navegação |
| **F8** Métricas + recomendações | `metrics-ingest`, métricas manuais LinkedIn, resultados nos cards, "Hive recomenda", `campaign-tick` | ingestão (mock Graph API); recomendação aparece; pauta pré-gerada |
| **F9** Migração + cutover | backfill do histórico, crons, merge, smoke em produção, rollback pronto | contagens batem; agendados intactos; smoke @live em produção |

## 9. Diário de bordo

- 2026-09-24 — **F0 concluída.** Backup completo (código/bundle+tag, banco público+sistema, storage 158
  arquivos, cron, edge list). Branch `feat/campanhas`. Playwright 1.63 + usuário de teste
  `23a3fdf1-264d-4fef-aa59-5db2ad05e336` (chave Gemini copiada no servidor). Baseline 4/4.
- 2026-09-24 — **F1 concluída.** Migração `20260924000001_campanhas_modelo.sql` aplicada (6 tabelas + 11 colunas
  em `user_posts`, RLS dono). Tipos `src/types/campaign.ts`, APIs `src/lib/campaignApi.ts`. `publish.ts` resolve
  credenciais pela conta da peça com fallback em `user_settings` (deploy de publish-post/scheduler; cron pós-deploy
  200 OK). Aba Configurações › Contas (`AccountsPanel`: LinkedIn, Instagram OAuth c/ Insights, importar integrações,
  padrão, remover). E2E 10/10 (baseline + f1-contas).
- 2026-09-24 — **F2 concluída.** Edge `campaign-moment` e `campaign-strategy` (helper `_shared/gemini.ts`; mix
  normalizado p/ 100 + fallback determinístico). Telas: `/criar` (Tela 02 + "Hive, recomende" por regras em
  `lib/campaign/recommend.ts`), `/campanhas/nova` (Telas 03–08), `/campanhas`, `/campanhas/:id`. Ativação cria ciclos
  semanais (seg–dom) e cadência por conta (prefs da Agenda ou guia). E2E f2 7/7 + @live (IA real) ✅; regressão 16/16.
  Bug real achado pelo E2E: refetch (StrictMode) sobrescrevia o nome/cadência em edição → rascunhos separados.
- 2026-09-24 — **F3 concluída.** Planejador determinístico `lib/campaign/plan.ts` (mix × intensidade da fase ×
  cadência → conteúdos/peças/necessidades/frequência; calibrado c/ a maquete 3+3+1→5/7; pesos de intensidade 0.2/0.5/1/1.8).
  Edge `cycle-pauta` (full/refresh/swap; RAG + arsenal + anti-repetição; servidor garante quantidade, funções e
  cadência EXATA por conta). Tela `/producao` (trilho de 6 etapas, seletor campanha/ciclo com recomendado, Planejamento
  c/ ajuste manual, Pauta: trocar/editar/remover/adicionar/nova seleção/aprovar). E2E f3 4/4 + @live; unit 4/4;
  regressão 24/24. Bugs reais achados: distribuição de canais estourava a cadência quando a IA restringia plataformas
  (cobertura antes de preferência); nova seleção apagava ideias do usuário.
- 2026-09-24 — **F4 concluída.** `generate-content` ganhou `mother_idea` opcional (retrocompatível; ideia vira a tarefa
  e o arsenal não é sorteado — chamada legada verificada ao vivo). Edge `content-develop` (develop/adjust/new_version,
  QA + 1 retry <70, "o que a Hive considerou"). `lib/campaign/develop.ts` preserva o ciclo de aprendizado (cada versão
  da IA = ai_variation pristina; validação cria a peça LinkedIn `piece_role=validation`, `text_approved`, codigo BEE-…,
  vincula a variação e grava ai_reviews). Migração `contents.metadata`. Tela: Telas 10–11 (desenvolver c/ progresso,
  Conteúdo N de M, aprovar/ajustar/editar/nova versão/descartar, "ao aprovar", resumo, desdobramentos). E2E f4 2/2 +
  @live; regressão 26/26. Bug real: ciclo em memória ficava desatualizado após desenvolver (botão sumia).
- 2026-09-24 — **F5 concluída.** `lib/campaign/produce.ts` reusa `generateHiveImage` (peça de validação LinkedIn M01-A
  produzida e aprovada automaticamente; desdobramentos via generate-content c/ `reference_post_id` ou `mother_idea`,
  3 variações → alternativas só com variante visual distinta; alternative_group/rank/is_recommended; ciclo de
  aprendizado; cache-buster `?v=` no render). `ReviewStep`: Telas 12/12A/12B/12C + pós-aprovação + conclusão →
  `/agenda?campaign=`. Executor de produção por ciclo com assinantes (sem duplicar em remontagem). Migração
  `…000003`: trigger gera `codigo` no banco (advisory lock por usuário) — corrige códigos duplicados em paralelo;
  preserva código informado. Limpeza do Storage do usuário de teste. E2E f5 3/3 (×3 sem intermitência) + @live;
  regressão 29/29. Bugs reais: produção presa em "0 de N" (StrictMode), códigos duplicados, corrida das ideias
  (desdobramentos não produzidos), resumo piscando incompleto.
