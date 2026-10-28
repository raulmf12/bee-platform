# AGENTS.md — como trabalhar na Hive (bee-platform)

> Lido por qualquer agente de IA (Claude Code, Codex, Cursor, Gemini, Copilot…) **antes de mexer em qualquer coisa**.
> Este arquivo é o resumo obrigatório. O detalhe está em [`docs/agentes/`](docs/agentes/README.md) — leia só a parte de que a tarefa precisa.

## 1. O que é isto, em 30 segundos

A **Hive** é a plataforma interna de conteúdo da **Bee Consulting**. O usuário principal é o **Marcos Piccini**, especialista e produtor de conteúdo. O dono técnico e quem pede as mudanças é o **Raul**.

A Hive organiza **Campanha → Ciclo → Ideia → Conteúdo → Peças → Agenda → Publicação**, para LinkedIn e Instagram. A IA escreve na voz do Marcos, que vem de uma metodologia guardada no banco (Genesis, diretrizes, arsenal e RAG). Imagem e arte são **dado** (templates Fabric), não texto livre da IA.

**Stack:**

- React 18, Vite, TypeScript, Tailwind e Zustand (`src/`).
- Supabase (Postgres, RLS, Edge Functions Deno e pg_cron), em `supabase/`.
- Netlify faz o deploy automático a cada push em `main`.
- Testes E2E com Playwright contra o **banco de produção**, usando um usuário de teste isolado (`e2e/`).

## 2. Regras invioláveis (violar = parar e perguntar)

1. **Nunca publicar de verdade** em rede social (LinkedIn/Instagram do Marcos ou de qualquer cliente) sem autorização explícita e específica do Raul.
   - Testes de publicação usam contas com **token falso**: a rede devolve 4xx antes de criar o post.
2. **Regressão completa obrigatória** antes de qualquer push que mexa em `src/`, `supabase/` ou `e2e/`: `npm run regressao` (funciona em Windows, macOS e Linux), cerca de 40 minutos, todos os testes verdes.
   - Mudança só em `docs/` ou em texto: build basta.
   - Detalhes em [04-TESTES](docs/agentes/04-TESTES.md).
3. **Nunca rodar duas suítes de teste ao mesmo tempo**, e **nunca editar `src/` enquanto a regressão roda**. Existe um único usuário de teste, e o cleanup de uma suíte apaga os dados da outra.
4. **403 do Supabase = parar.** A conta perdeu acesso. Avise o Raul e espere.
   - Não procure outra chave, outro token ou outro caminho.
   - Nada de contornar RLS, trigger, portão ou bloqueio. Se uma regra do banco recusa, ela está certa até prova em contrário.
5. **Dados reais são do Marcos.** Não apague, não "limpe" e não altere em massa dados que não sejam do usuário de teste sem confirmação explícita.
   - Antes de `UPDATE`/`DELETE` em produção, rode o `SELECT` equivalente e mostre o que vai mudar.
6. **Banco por migration versionada, aplicada pela Management API** (`npm run sql -- -f <arquivo>`).
   - **Nunca** use `supabase db push`: o histórico remoto é inconsistente e o push reaplicaria seeds duplicando dados.
   - Toda migration é **idempotente** e tem **rollback** em `supabase/rollback/`.
7. **Um contrato por tema; nada de solução paralela por tela.** Agendar passa pelo `schedule-piece`, aprovar por `approve_piece`/`merge_post_review`, publicar por `publishOne`, e a prontidão vem de `piece_readiness`.
   - Se a tela precisa de outra coisa, estenda o contrato. Não crie um atalho.
8. **Publicado é histórico.** Peça publicada não volta para a fila nem muda de data (o trigger `protect_published` recusa com PT409).
9. **A voz é do Marcos.** Nada que a IA minera entra na metodologia sem curadoria humana (`bee_suggestions` → `/curadoria`).
   - Não hard-code "Bee/Marcos/líder" em prompt: use `resolveContext`/`contextBlock`.
10. **Segredos nunca no repositório.** Chaves ficam nos Secrets do Supabase, no Vault (cron) ou no `.env*.local` (gitignored).
11. **Não faça commit nem push sem pedido**, salvo quando a tarefa já autoriza ("implemente e suba").
    - Rodapé dos commits: `Co-Authored-By: <seu modelo> <noreply@…>`.
    - Conta GitHub dona do repo: `raulmf12` (`gh auth switch --user raulmf12`).

As regras completas, com o porquê de cada uma, estão em [02-REGRAS](docs/agentes/02-REGRAS.md).

## 3. O ciclo de trabalho (resumo de [03-PROCESSO](docs/agentes/03-PROCESSO.md))

```
ENTENDER → LOCALIZAR o contrato → PLANEJAR (curto) → IMPLEMENTAR (diff mínimo, no estilo do arquivo)
→ BUILD (npm run build) → TESTE ALVO (spec da área) → DEPLOY banco/função (se houver) → VERIFICAR no banco
→ REGRESSÃO COMPLETA → COMMIT + PUSH (Netlify publica) → DOCUMENTAR (ficha + nota para o Marcos) → RELATAR
```

**Ordem de deploy quando a mudança cruza camadas:**

1. Migration aditiva.
2. Edge functions.
3. App (push).
4. Migration que remove ou endurece algo, só depois que o app novo estiver no ar.

O app antigo continua rodando até o Netlify terminar o deploy, então nunca quebre o contrato que ele usa.

## 4. Comandos essenciais

| Para | Comando |
|---|---|
| Typecheck + build (o portão do Netlify) | `npm run build` |
| Rodar o app | `npm run dev` |
| Máquina pronta para testar? | `npm run regressao:check` |
| Um spec (iteração) | `npm run regressao -- e2e/f25-publicacao-e4.spec.ts` |
| Regressão completa | `npm run regressao` (Windows: ver [REGRESSAO-WINDOWS](docs/agentes/REGRESSAO-WINDOWS.md)) |
| SQL em produção | `npm run sql -- "select …"` · `npm run sql -- -f arquivo.sql` (no macOS/Linux também `scripts/sql.sh`) |
| Deploy de edge function | `npx supabase functions deploy <nome> --project-ref djlorvdehedcupeykyes` |
| Bundle compartilhado do plano | `npm run build:edge-shared` (depois redeploy `campaign-tick`) |
| Quem importa um módulo `_shared` | `grep -l "_shared/publish.ts" supabase/functions/*/index.ts` |

## 5. Mapa rápido

| Onde | O quê |
|---|---|
| `src/pages/` | Telas (uma pasta por rota). As maiores são `NewPost.tsx`, `Agenda.tsx` e `PostEditor.tsx`: **leia por trecho**. |
| `src/lib/` | Contratos do cliente: `db.ts` (REST direto, **não** use supabase-js para queries), `edge.ts`, `scheduling.ts`, `approval.ts`, `readiness.ts`, `schedule.ts` (fuso), `navigation.ts`, `errors.ts` |
| `src/store/` | Zustand: `authStore`, `postStore`, `templateStore` |
| `supabase/functions/<nome>/index.ts` | Edge functions (Deno) |
| `supabase/functions/_shared/` | Código comum: `security.ts`, `package.ts` (pacote imutável), `publish.ts`, `publish-sequence.ts`, `context.ts`, `bee-context.ts` |
| `supabase/migrations/` | Migrations (`AAAAMMDD000001_nome.sql`); rollback em `supabase/rollback/` |
| `e2e/` | `fN-*.spec.ts` (fluxos), `unit-*.spec.ts` (puros), `helpers/` (seed, cleanup, mocks) |
| `docs/` | Planos e fichas por iniciativa (`estabilizacao/`, `identidade/`, `acj/`…) |

## 6. Onde ler mais (leia só o necessário)

| Preciso de… | Leia |
|---|---|
| Entender produto, domínio, dados e contratos | [01-CONTEXTO](docs/agentes/01-CONTEXTO.md) |
| Regras com justificativa | [02-REGRAS](docs/agentes/02-REGRAS.md) |
| Passo a passo de uma entrega | [03-PROCESSO](docs/agentes/03-PROCESSO.md) |
| Rodar ou escrever testes | [04-TESTES](docs/agentes/04-TESTES.md) |
| Economizar tokens e tempo | [05-TOKENS](docs/agentes/05-TOKENS.md) |
| Receitas (migration, função, tela, diagnóstico) | [06-RECEITAS](docs/agentes/06-RECEITAS.md) |
| Armadilhas já pagas com bug em produção | [07-ARMADILHAS](docs/agentes/07-ARMADILHAS.md) |
| Como relatar ao Raul e escrever para o Marcos | [08-COMUNICACAO](docs/agentes/08-COMUNICACAO.md) |

**Idioma:** código, comentários, commits, docs e mensagens de UI em **português do Brasil**. Fale com o Raul em português, direto e sem jargão desnecessário.
