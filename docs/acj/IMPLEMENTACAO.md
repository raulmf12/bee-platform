# ACJ na Hive — mapa de implementação (MVP)

Resposta técnica ao Adendo §25–26. Fonte: os .md desta pasta (v0.1 em validação = modo assistido).

## Decisões do produtor (2026-10-06)
1. Campanha ativa (Pré Lançamento · Masterclass) recebeu plano ACJ **v1, adoção tardia, aguardando aprovação**.
2. Aprovação do plano ACJ é um **clique separado** da estratégia (wizard e detalhe da campanha).
3. ACJ primária faltando **só avisa** (nada bloqueia a produção).
4. Implementado sobre os documentos v0.1 (modo assistido).
5. **Comentários do Instagram** passam a ser importados (sinal qualitativo).

## Correspondência estrutura atual → ACJ
| ACJ (Adendo §6) | Na Hive |
|---|---|
| `acj_definition` | `acj_definitions` (seed gerado: `node scripts/acj-build-library.mjs`) + `_shared/acj-library.ts` + `src/lib/acj/library.generated.ts` |
| `acj_campaign_plan` / fases | `acj_campaign_plans` (versionado; 4 fases alinhadas à matriz da estratégia) |
| `acj_cycle_plan` | `acj_cycle_plans` (determinístico: `src/lib/acj/cyclePlan.ts` — fase + lacuna + saturação) |
| ideia | `ideas.acj_primary/secondary/role/rationale` (escolhida pela pauta ANTES da ideia) |
| `acj_content_contract` | `acj_content_contracts` (versionado; gerado no `content-develop` antes da redação) |
| `acj_piece_snapshot` | `user_posts.acj_*` (trigger herda do contrato; congela na publicação) |
| `acj_result_observation` | view `acj_piece_results` + `post_comments` + `acj_signal_readings` |
| Registro Vivo | `acj_learning_entries` / `_evidence` / `_decisions` (ACJL-AAAA-NNN; transições §5.1 no banco) |

## Serviços
- `acj-orchestrator` (ACJ-00): `campaign_plan`, `assign`, `validate`, `read_signals`.
- `cycle-pauta`: recebe a composição ACJ do ciclo e garante a distribuição (como já garante as funções).
- `content-develop`: contrato → `generate-content` com o bloco do contrato → portão "o movimento aconteceu?".
- `generate-content` (`acj_context` / `acj_content_id`), `hive-decide` (LLM) e `marcos-photo` (leitura): ACJ como **sinal de compatibilidade**, sem equivalência fixa com M/F.
- `instagram-import` / `metrics-ingest`: comentários (`instagram_manage_comments`).

## Invariantes no banco (Adendo §8)
Só ACJ-01..05; secundária ≠ primária; mix = 100 (±1); plano aprovado imutável e aprovar arquiva o anterior; mudança de movimento = nova versão do contrato; snapshot publicado imutável; Registro Vivo com transições permitidas, validação/consolidação exigem aprovador e documento afetado, trilha automática, sem exclusão pelo app.

## Telas
Wizard (Estratégia definida) e Campanha › Jornada relacional · Produção: planejamento (composição ACJ), pauta (selos + "como conduz a jornada"), validação (contrato + portão + leitura do Marcos), revisão da peça (ACJ herdada) · Agenda (alertas de sequência/espaçamento/lacuna) · Inteligência › Jornada relacional (resultados por ACJ, comentários, leitura de sinais, Registro Vivo).

## Fica para depois
Analytics avançado por ACJ, detecção automática de padrões/abertura automática de registros, recomendação autônoma de testes, detecção de desvio de movimento nas peças, comentários do LinkedIn, reclassificação histórica.

Testes: `e2e/unit-acj.spec.ts`, `e2e/f13-acj-banco.spec.ts`, `e2e/f13-acj-fluxo.spec.ts`. Rollback: `supabase/rollback/20261007000001_acj_rollback.sql`.
