# 01 · Contexto — produto, domínio, dados e contratos

> Leia a seção de que precisa. O índice está no topo; cada seção diz onde está o código.

1. [Pessoas e propósito](#1-pessoas-e-propósito)
2. [Glossário do domínio](#2-glossário-do-domínio)
3. [Arquitetura](#3-arquitetura)
4. [Ciclo de vida de uma peça](#4-ciclo-de-vida-de-uma-peça)
5. [Contratos compartilhados (C1–C6)](#5-contratos-compartilhados-c1c6)
6. [Modelo de dados](#6-modelo-de-dados)
7. [IA: como o texto é gerado](#7-ia-como-o-texto-é-gerado)
8. [Visual: templates e editor](#8-visual-templates-e-editor)
9. [Publicação e crons](#9-publicação-e-crons)
10. [Multi-cliente (isolamento)](#10-multi-cliente-isolamento)
11. [Histórico de iniciativas e onde estão os documentos](#11-histórico-de-iniciativas)

---

## 1. Pessoas e propósito

- **Marcos Piccini** é o especialista da Bee Consulting e o usuário diário: revisa, aprova, agenda e publica.
  - Não é técnico: mensagens de UI e notas de versão são escritas para ele, em linguagem de uso.
  - Usuário no banco: `dfa11979-83c5-4737-9601-56e4df05746a` (nunca use esse id em teste).
- **Raul** é o dono técnico. Pede as mudanças, aprova decisões e recebe os relatórios.
- **O diferencial do produto é a VOZ.** A IA não "cria conteúdo genérico": ela escreve como o Marcos, a partir de uma metodologia curada (Genesis, diretrizes, editoriais, arsenal e exemplos).
  - Qualquer automação que realimente a metodologia sem humano no meio degrada a voz.
- **A estabilidade vale mais que features.** Em out/2026 a plataforma passou por uma estabilização inteira (E1–E5, `docs/estabilizacao/`) porque aprovação "não ficava", a agenda "mentia" e havia risco de publicar em duplicidade.
  - A confiança do Marcos no que a tela mostra é requisito.

## 2. Glossário do domínio

| Termo | Significado | Onde |
|---|---|---|
| Campanha | Contêiner estratégico com período, contas e cadência | `campaigns` |
| Ciclo | Fatia da campanha (semanas) com pauta própria | `campaign_cycles` |
| Ideia / Pauta | Tema aprovado para um ciclo | `ideas` |
| Conteúdo (mãe) | Texto-base desenvolvido a partir da ideia | `contents` |
| **Peça** | Unidade publicável numa conta/formato. É a linha de `user_posts` | `user_posts` |
| Formato | `text`, `image`, `carousel`, `story`, `reel`, `video` | `user_posts.format` |
| Componentes da peça | Frase/título (`carousel_text.quote`), legenda (`caption`), imagem (`rendered_slides`, `carousel_fabric_json`) — aprovados separadamente | `metadata.titulo_status`, `legenda_status`, `image_approved` |
| Versão | Contador que avança a cada mudança relevante | `user_posts.version`, `piece_versions` |
| Candidato | Proposta de ajuste da peça: comparar → aplicar | `piece_candidates`, `apply_piece_candidate` |
| Unidades | Páginas de carrossel/stories com ID estável | `post_units` |
| **Pacote programado** | Cópia **imutável** (arquivos + manifesto + hash) do que vai ao ar, fechada no agendamento | `publication_packages`, bucket `packages` |
| Prontidão | O que falta para agendar/publicar, por formato | RPC `piece_readiness` |
| Stand-by | Peça aprovada, sem data | `status='approved'` sem `scheduled_date` |
| Legado | Agendamento anterior ao pacote (sem `scheduled_package_id`), que pede "Confirmar material" | — |
| Hive (ação) | O botão/agente que escolhe template e compõe a arte | `hive-decide`, `src/lib/hive/` |
| Genesis | Constituição cognitiva do especialista (princípios, lentes, tensões, avatares) | `genesis_*` |
| Diretrizes | Regras do ofício de escrever (universal/plataforma/editorial) | `bee_directives` |
| ACJ | Arquiteturas de Conexão e Jornada: camada relacional entre estratégia e pauta | `acj_*`, `docs/acj/` |
| Identidade / Perfil | Marca, emissores, frentes e perfis de comunicação versionados | `brands`, `emitters`, `communication_profiles*` |

## 3. Arquitetura

```
Navegador (React/Vite)  ──REST direto (src/lib/db.ts)──▶  PostgREST + RLS (Postgres)
        │                                                       ▲
        └──fetch (src/lib/edge.ts)──▶ Edge Functions (Deno) ────┘ (service role, _shared/)
                                             │
                    pg_cron ──(Bearer do Vault)──┘   ──▶ LinkedIn / Instagram Graph / Gemini / OpenAI
```

- **Cliente → banco:** use `src/lib/db.ts` (REST via fetch), **não** o supabase-js, para queries. Ele tem um bug de travar após o signIn. O supabase-js só é usado para auth.
- **Cliente → funções:** use `src/lib/edge.ts`, que tem tipos, timeouts e erros (`PublishStateError` etc.).
- **Funções:**
  - Autenticam por JWT do usuário (`userIdFromAuth`) ou como chamada de serviço (`isServiceCall`, que aceita as duas chaves: `sb_secret_…` e a JWT legacy do Vault).
  - Escrevem com service role pelos helpers `rest`/`rpc` de `_shared/package.ts`.
- **Regras de negócio críticas ficam no banco:** triggers e RPCs com `RAISE … USING ERRCODE='PT409'`. O PostgREST converte PTxxx no HTTP xxx. A UI lê a mensagem com `userMessage()` (`src/lib/errors.ts`).
- **Roteador:** `createBrowserRouter` com rota splat que renderiza `<App/>` (`src/main.tsx`). Isso habilita `useBlocker` (aviso ao sair com edição).
- **Deploy:** push em `main` → Netlify roda `tsc -b && vite build`. Edge functions e migrations **não** vão no push: são aplicadas à mão (ver [03-PROCESSO](03-PROCESSO.md)).

## 4. Ciclo de vida de uma peça

```
draft → pending_approval ──approve_piece (todos os componentes)──▶ approved (stand-by)
                ▲                                                       │ schedule-piece (intent schedule):
                │ editar componente aprovado                            │ prontidão ✓ → fecha pacote → agenda
                │ (trigger invalidate_on_edit)                          ▼
                └───────────────────────────────────────────── scheduled (scheduled_package_id)
                                                                        │ publish-scheduler / Publicar agora
                                                                        ▼  (reserva exclusiva post_publications)
                                                     published ──▶ archived (permitido; nada mais)
```

**Decisões do Raul que valem como regra (18/10/2026):**

1. Editar uma peça aprovada devolve **aquele componente** a pendente. Se a peça estava agendada, ela continua agendada com o **pacote antigo** e ganha a marca `scheduled_outdated`. A UI oferece Comparar e "Atualizar conteúdo programado" (`replace_package`).
2. Agendamento legado (sem pacote) **não é publicado** até o produtor clicar "Confirmar material" (`replace_package` com origem `legacy_confirmed`).
3. Publicado → arquivado é permitido; publicado nunca volta para a fila nem muda de data.
4. Resultado incerto de publicação (`unknown`) → conferência manual (`ReconcileDialog`) + busca automática no Instagram (`find_on_instagram`).

## 5. Contratos compartilhados (C1–C6)

**Toda tela usa estes contratos. Nunca reimplemente a lógica deles em outro lugar.**

| # | Contrato | Servidor | Cliente |
|---|---|---|---|
| C1 | **Pacote imutável**: arquivos copiados para o bucket `packages` (só o servidor escreve), SHA-256 por arquivo, manifesto canônico com hash | `publication_packages`; `_shared/package.ts` (`sealPackage`, `verifyPackage`, `canonical`) | `ScheduledPackageCard` |
| C2 | **Prontidão** por formato e escopo (`schedule`/`publish`) | RPC `piece_readiness(p_post, p_scope)` → `{ready, missing[]}` | `src/lib/readiness.ts` (`useReadiness`) |
| C3 | **Aprovação durável**: a UI só mostra "aprovado" depois que o servidor gravou | RPCs `merge_post_review`, `approve_piece`; trigger `invalidate_on_edit` | `src/lib/approval.ts`, `src/lib/measurement.ts` |
| C4 | **Comando único de agenda**, idempotente por `command_id` (mesmo id + mesmos dados = mesmo resultado; dados diferentes = conflito) | Edge `schedule-piece` → RPC `commit_schedule`; tabelas `schedule_commands`, `schedule_plans` | `src/lib/scheduling.ts` (`scheduleAt`, `unschedule`, `runScheduleCommand`) |
| C5 | **Publicação exclusiva**: reserva com estágios `reserved → sending → confirmed`, ou `failed_before_send` / `unknown` | `post_publications`; `_shared/publish.ts` (`publishOne`), `publish-sequence.ts`; `expire_publication_leases` | `PublishPanel`, `ReconcileDialog`, `edge.ts` |
| C6 | **Verificar ≠ publicar**: o dry-run é só leitura | `inspectOne` em `_shared/publish.ts`; `publish-post` com `dry_run` | botão "Verificar" |

**Classificação de falha na publicação (C5):** só a chamada **decisiva**, a que cria o post na rede, decide o resultado.

| Resultado da chamada | Classificação | Retentativa |
|---|---|---|
| 4xx | `failed_before_send` | Segura |
| Sem resposta ou 5xx | `unknown` | Exige reconciliação, nunca retentativa cega |
| Qualquer erro antes dela | antes do envio | Segura |

**Fuso:** o banco guarda o instante (UTC). A entrada e a exibição usam o fuso da operação, `user_settings.timezone` (padrão `America/Sao_Paulo`), e **não** o do navegador.

- Helpers em `src/lib/schedule.ts`: `toZoned`, `wallTimeToInstant`, `localInputToIso`, `formatInZone`.

## 6. Modelo de dados

O schema completo está em `supabase/migrations/` (cerca de 55 arquivos, em ordem). Para ver o estado real, consulte o banco:

```bash
scripts/sql.sh "select column_name, data_type from information_schema.columns where table_name='user_posts' order by ordinal_position"
```

**Grupos de tabelas:**

- **Produção:** `campaigns`, `campaign_cycles`, `ideas`, `contents`, `user_posts`, `piece_versions`, `piece_candidates`, `content_piece_plans`, `post_units`, `format_capabilities`.
- **Agenda e publicação:** `publication_packages`, `schedule_commands`, `schedule_plans`, `post_publications`, `post_unit_publications`, `social_accounts`, `post_metrics`.
- **Metodologia (voz):**
  - `genesis_*` (constituição);
  - `bee_*` (editoriais, arsenal, diretrizes, exemplos, analogias, sugestões);
  - `knowledge_documents` e `knowledge_chunks` (RAG);
  - `content_memory` (anti-repetição).
- **Aprendizado da IA:** `ai_generations`, `ai_variations`, `ai_reviews`, `ai_learnings`, `ai_measurement_events`, `ai_segment_gate`.
- **Identidade e multi-cliente:** `workspaces`, `workspace_members`, `brands`, `emitters`, `business_fronts`, `audiences`, `communication_profiles(_versions)`, `context_snapshots`, `setup_sessions`.
- **Visual:** `design_assets`, `design_tokens`, `design_variacoes`, `design_manifestacoes`, `post_templates`, `photo_*`.
- **Outros:** `acj_*`, `meta_*` (tráfego pago), `podcasts`, `podcast_clips`, `usage_events` (custos), `user_settings`.
- **Legado (não use em código novo):** `alma_*`. O barramento `alma_eventos` ainda é usado.

**Convenções:**

- Todas as tabelas de usuário têm `user_id` e RLS de dono; as de metodologia têm `brand_id` e RLS por marca.
- `metadata jsonb` guarda marcas de estado (`edited_after_approval`, `scheduled_outdated`, `titulo_status`…). Leia a migration antes de inventar uma chave nova.
- Mudança de schema só por migration nova; nunca edite uma migration já aplicada.

## 7. IA: como o texto é gerado

- **`generate-content`** é a geração principal (arquivo grande, ~75 KB: leia por trecho). O prompt se monta em camadas:
  1. Genesis (princípios invioláveis, fluxo cognitivo, avatares);
  2. diretrizes;
  3. editoriais e arsenal;
  4. RAG (`match_knowledge`);
  5. memória anti-repetição;
  6. contexto da marca/perfil (`_shared/context.ts`).
- **Agentes de correção** (`post-chat`, `edit-text`, `regenerate-snippet`) usam o mesmo cérebro, `_shared/bee-context.ts`.
  - O Coach do editor usa `post-chat` com `mode:'rewrite'` e devolve texto aplicável.
- **Vícios proibidos na voz:**
  - analogia de natureza em todo post;
  - pergunta-CTA ou "Vê?" no fim;
  - moral corporativa forçada.

  Analogia e virada sistêmica são **opcionais**.
- **Variedade de forma não fica a cargo do LLM:** a rotação de templates é forçada no código (`IG_VARIANT_ROTATION` em `NewPost.tsx`).
- **Chaves de IA:** são do usuário (`getUserGeminiKey`/`getUserOpenAIKey`). O custo é registrado em `usage_events` por `logUsage`.
  - O mapa de preços está duplicado em `src/lib/pricing.ts` e em `_shared/security.ts`: mude os dois.
- **Testes nunca chamam IA de verdade:** as funções de IA são mockadas em `e2e/helpers/mocks.ts`. A suíte `@live` é separada e só roda sob pedido.

## 8. Visual: templates e editor

- **Matrizes** M01–M08 × variações (A–E). M01–M04 existem. A arte é montada em camadas com ativos oficiais (`src/lib/hive/`, `design_*`).
- **Editor:** `PostEditor` → `CanvasStudio` (Fabric v6).
  - **O render é no navegador** (canvas ao vivo). Não existe render no servidor.
  - Peça sem `rendered_slides` só se resolve abrindo no editor, que renderiza sozinha.
- **Instagram exige JPEG** (`toJpegDataUrl`).
- **Fotos do Marcos:** `design_assets` (curadas). Motor fotográfico F01–F04 em `docs/fotografia/`.

## 9. Publicação e crons

| Cron | Quando | O quê |
|---|---|---|
| `publish-scheduler` | a cada 2 min | Publica peças `scheduled` **com pacote** e vencidas há no máximo 2h (`GRACE_MS`; perdeu a janela = precisa reagendar); expira reservas; pula `in_progress`/`needs_reconciliation` |
| `campaign-tick` | 09:00 UTC | Avança campanhas (usa o bundle `_shared/campaign-plan.js`, gerado de `src/lib/campaign/plan.ts`) |
| `metrics-ingest` | 09:30 UTC | Métricas das redes |
| `instagram-refresh` | 04:17 UTC | Renova tokens IG que vencem em menos de 10 dias |
| `meta-ads-sync` | a cada 30 min | Tráfego pago |

- Os crons chamam as funções com `Bearer` lido do **Vault** (`service_role_key`).
  - O `cron.job_run_details` "succeeded" só significa "enfileirou": a verdade está em `net._http_response.status_code`.
  - Para pausar um cron use `cron.alter_job(job_id, active := false)`. `UPDATE cron.job` é negado.
- **LinkedIn:** o token dura cerca de 60 dias e **não há refresh**. Quando expira, todos os posts LinkedIn falham até colar um token novo (Configurações → Integrações).
- **Carrossel e stories** publicam por `publish-sequence.ts`: IG por contêineres e LinkedIn como documento PDF.

## 10. Multi-cliente (isolamento)

- RLS por marca: `brand_readable` / `is_brand_member`.
- Funções de serviço filtram por `brandScope` / `userBrandScope`.
- Um cliente novo nasce com `create_my_workspace`.
- IDs fixos da Bee usam o prefixo `0b000000-0000-4000-8000-…`:
  - workspace `…0001`;
  - marca `…0002`;
  - emissor Marcos `…0003`.
- Testes de identidade usam marcas `e2e-*` (`seedIdentityBrand`), nunca a da Bee.
- O teste de isolamento (`f19`) cria um usuário real por `e2e/helpers/tenant.ts`.

## 11. Histórico de iniciativas

| Iniciativa | Documentos | Testes |
|---|---|---|
| Campanhas (set/2026) | `docs/PLANO-CAMPANHAS.md` | f2–f8 |
| ACJ | `docs/acj/IMPLEMENTACAO.md` | f13 |
| Identidade e contextos, fases 1–6 | `docs/identidade/FASE*.md`, `RESUMO-FASES-1-6.md` | f15–f20 |
| Coach com reescrita | — | f21 |
| **Estabilização E1–E5** (out/2026) | `docs/estabilizacao/PLANO-IMPLEMENTACAO.md`, `ENTREGAS.md` | f22–f26, unit-fuso |

Antes de mexer numa área, leia a ficha da iniciativa que a criou. Ela diz as decisões, os critérios (ex.: `04/T03`) e as limitações conhecidas.
