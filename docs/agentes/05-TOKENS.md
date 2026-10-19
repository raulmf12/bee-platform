# 05 · Economia de tokens e de tempo

O contexto do agente é o recurso mais caro e mais escasso. Ler um arquivo de 100 KB inteiro custa ~25 mil tokens e empurra para fora o que importava. Estas estratégias mantêm a sessão rápida e lúcida até o fim, inclusive em entregas de vários dias.

**Princípio:** *descubra onde está antes de abrir; abra só o trecho; pergunte ao banco em vez de deduzir do código; não repita o que já sabe.*

---

## 1. Ler pouco e no lugar certo

**1.1 Comece pelo índice, não pelo README.** `AGENTS.md` → o doc de `docs/agentes/` que a tarefa pede → a ficha da iniciativa. O `README.md` tem 50 KB e está parcialmente desatualizado: consulte por seção (`grep -n "^## " README.md`), nunca inteiro.

**1.2 Procure antes de abrir.**

```bash
grep -rn "scheduleAt(" src --include=*.tsx | head -20          # onde é chamado
grep -n "function handleSchedule\|const runHive" src/pages/posts/PostEditor.tsx   # linha exata
grep -c "" src/pages/agenda/Agenda.tsx                          # tamanho antes de decidir
```

Depois leia **só a faixa** (ex.: linhas 820–900). Na ferramenta Read use `offset`/`limit`; no shell, `sed -n '820,900p' arquivo`.

**1.3 Arquivos que nunca se lê inteiros** (tamanho aproximado):

| Arquivo | KB | Como abordar |
|---|---|---|
| `src/pages/posts/NewPost.tsx` | 107 | grep pela função/estado |
| `supabase/functions/_shared/acj-library.ts` | 87 | é dado (biblioteca ACJ); grep pela chave |
| `src/pages/agenda/Agenda.tsx` | 83 | grep por `function`/`data-testid` |
| `supabase/migrations/20261007000002_acj_definitions_seed.sql` | 80 | seed: não leia |
| `supabase/functions/generate-content/index.ts` | 75 | grep por `buildSystemPrompt`, bloco do prompt |
| `supabase/functions/_shared/campaign-plan.js` | 58 | **gerado**: leia `src/lib/campaign/plan.ts` |
| `src/pages/posts/PostEditor.tsx` | 50 | grep por handler |
| `README.md` | 50 | por seção |
| `src/lib/api.ts`, `src/lib/edge.ts` | 45 / 36 | grep pelo nome da função |
| `package-lock.json`, `node_modules/`, `dist/`, `test-results/`, `playwright-report/` | — | nunca |

**1.4 Para "como está o dado", pergunte ao banco, não ao código.** Uma consulta pequena substitui ler cinco arquivos tentando deduzir:

```bash
scripts/sql.sh "select id, status, format, scheduled_date, scheduled_package_id is not null pkg, left(title,40) t
                from user_posts where status='scheduled' order by scheduled_date limit 10"
```

Selecione **só as colunas necessárias**. Corte textos com `left(x, 60)`. Use `limit` e `count(*)` antes de listar. **Nunca** faça `select *` em `user_posts` (os jsonb de fabric têm dezenas de KB por linha).

**1.5 Schema:** em vez de ler a cadeia de migrations, consulte o catálogo.

```bash
scripts/sql.sh "select column_name, data_type from information_schema.columns where table_name='post_publications'"
scripts/sql.sh "select pg_get_functiondef('public.piece_readiness'::regproc)"   # definição VIGENTE da função
```

A definição vigente pode diferir da migration original: houve patches por `DO $$`.

**1.6 Não releia o que acabou de escrever.** Se o Edit/Write não deu erro, o arquivo está como você mandou. Para conferir uma edição, `git diff -- <arquivo>` mostra só o que mudou.

**1.7 Delegue buscas amplas.** Se a pergunta exige varrer muitos arquivos ("todas as telas que mudam status de peça"), use um subagente de busca, quando a ferramenta tiver, que devolva só a conclusão e os caminhos. Para busca pontual, grep direto é mais barato que subagente.

## 2. Saídas de comando enxutas

- **Testes:** `scripts/regressao.sh` já filtra (mostra falhas e resumo; o log fica em arquivo). Nunca jogue a saída completa do Playwright no contexto. Para olhar uma falha: `grep -n -A20 "1) " /tmp/regressao-*.log | head -60`.
- **Build:** `npm run build 2>&1 | grep -E "error|✓ built" | head -30`.
- **Git:** `git status --short`, `git diff --stat`, `git log --oneline -5`. Use `git diff` completo só no arquivo de interesse.
- **Deploy de função:** `npx supabase functions deploy x --project-ref … 2>&1 | tail -3`.
- **JSON de API:** filtre com `python3 -c` ou `jq` para os campos necessários antes de imprimir.
- Se a máquina tem o **RTK** (`rtk`, proxy que compacta saída de comandos), ele já é aplicado pelo hook. Não precisa fazer nada.

## 3. Trabalhar em lote e em paralelo

- **Chamadas independentes na mesma rodada:** ler três arquivos, rodar dois greps e consultar o banco, tudo junto, não um por vez.
- **Edições:** planeje todas as mudanças de um arquivo e aplique de uma vez, em vez de editar, ler, editar e ler.
- **Verificação:**
  - `npm run build` uma vez por bloco lógico, não após cada linha;
  - o spec da área ao fim da entrega;
  - a regressão completa **uma vez por entrega**, antes do push, e não a cada ajuste.

  Se várias entregas vão juntas para produção, uma regressão completa no fim cobre todas, **desde que** cada uma tenha passado no próprio spec.
- **Deploys:** várias funções em sequência num só comando:

  ```bash
  for f in publish-post publish-scheduler schedule-piece; do npx supabase functions deploy $f --project-ref djlorvdehedcupeykyes 2>&1 | tail -1; done
  ```

## 4. Tarefas longas sem desperdício

- Regressão (~38 min) e deploys em lote rodam **em background**. Não fique consultando o log; espere a notificação de término, ou cheque em intervalos longos (≥ 10 min).
- Enquanto espera, faça trabalho que não mexe em código: documentação, ficha da entrega, nota para o Marcos, relatório.
- Se a sessão vai ser resumida ou compactada, **escreva o progresso num arquivo antes** (doc da iniciativa, memória persistente): o que está feito, o que falta, e o próximo comando exato. Assim a retomada custa uma leitura, não uma reinvestigação.

## 5. Não redescobrir o que já se sabe

- **Memória do projeto:** os docs das iniciativas (`docs/*/`) e [07-ARMADILHAS](07-ARMADILHAS.md) guardam decisões e bugs já pagos. Leia a armadilha antes de depurar algo parecido (editor em branco, cron 401, pacote "adulterado"…).
- **Ao descobrir algo não óbvio**, anote no lugar certo: uma linha em `07-ARMADILHAS.md` ou na ficha da iniciativa. Isso custa dez tokens agora e economiza dez mil depois.
- **Não re-derive decisões tomadas.** Se a ficha diz "decisão de 18/10: publicado → arquivado permitido", não reabra a discussão.
- **Agentes com memória persistente** (Claude Code): guardem lá só o que **não** está no repositório (preferências do Raul, estado de pendências, acessos). Código e histórico já estão no git.

## 6. Comunicação econômica

- O relatório final é curto: o que ficou pronto, o que fazer, o que falta. Sem recapitular o processo inteiro.
- Não cole código ou diff no chat se ele já está no arquivo: cite `arquivo:linha`.
- Uma pergunta ao Raul vem com a recomendação, para ele responder "sim" em vez de abrir uma rodada de discussão.

## 7. Anti-padrões (o que mais desperdiça)

| Anti-padrão | Faça em vez disso |
|---|---|
| Ler o arquivo inteiro "para entender" | grep pelo símbolo, ler 60–120 linhas ao redor |
| `select *` em `user_posts` | colunas explícitas + `left()` + `limit` |
| Rodar a suíte completa a cada ajuste | spec da área durante a iteração; completa antes do push |
| Imprimir a saída inteira do Playwright | `scripts/regressao.sh` (filtra) ou `grep` no log |
| Reler arquivo após editar | confiar no Edit; `git diff` se precisar |
| Depurar por tentativa e erro no navegador | ler o `error-context.md` / consultar o banco / ler o trecho do handler |
| Descobrir de novo como aplicar migration | `scripts/sql.sh -f` (está aqui) |
| Ficar consultando o status de uma tarefa longa | background + notificação; trabalhar em outra coisa |
| Investigar código quando 30 testes falham juntos com "fetch failed" | rodar de novo: é ambiente |
