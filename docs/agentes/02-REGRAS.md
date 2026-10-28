# 02 · Regras — o que nunca fazer, o que sempre fazer, e por quê

Cada regra traz o **porquê**. Quase todas nasceram de um incidente real. Quando uma regra parecer atrapalhar, o porquê diz se o caso é exceção (quase nunca é). Na dúvida: **pare e pergunte ao Raul**.

Níveis:

- 🔴 **inviolável**: parar e perguntar.
- 🟠 **obrigatória**: só desviar com justificativa escrita no relatório.
- 🟢 **padrão**: o jeito da casa.

---

## A. Segurança, dados e o mundo externo

**A1 🔴 Nunca publicar de verdade sem autorização específica.**

- Proibido:
  - "Publicar agora" em peça real;
  - forçar o `publish-scheduler`;
  - chamar `publish-post` sem `dry_run` para conta real;
  - mexer em `scheduled_date` de peça real para "testar".
- Testes de publicação usam `seedAccounts()` (contas com token falso e ids fictícios), que falham com 4xx **antes** de criar o post.
- **Por quê:** um post indevido no perfil do Marcos é dano público e irreversível. A autorização vale para uma publicação específica, não para "testes de publicação" em geral.

**A2 🔴 403 do Supabase = pare.**

- Não tente outra chave, outra conta, o MCP, o dashboard ou um caminho alternativo.
- Avise: "o Supabase devolveu 403: a conta perdeu acesso ao projeto; preciso que você restaure".
- **Por quê:** já aconteceu (out/2026). A conta tinha sido removida da organização, e contornar seria agir sem autorização.

**A3 🔴 Não contornar regra do banco.** Trigger, RLS, RPC ou portão que recusa (PT409/PT422/42501) está fazendo o trabalho dele.

- Proibido:
  - desabilitar trigger;
  - usar service role para pular RLS no app;
  - mudar `status` direto no SQL para "destravar".
- Se a regra está errada, mude a regra por migration, com teste, e diga isso no relatório.
- **Por quê:** a estabilização inteira consistiu em mover garantias para o banco. Atalho no app recria os bugs de "a tela diz uma coisa e o banco outra".

**A4 🔴 Dados reais são do Marcos.**

- Antes de qualquer `UPDATE`/`DELETE` fora do usuário de teste:
  1. rode o `SELECT` com o mesmo `WHERE`;
  2. mostre a contagem e as linhas;
  3. peça confirmação.
- Nunca `DELETE` sem `WHERE`. Nunca `TRUNCATE`.
- O usuário de teste (`E2E_USER_ID` em `.env.e2e.local`) é o único que se limpa livremente, e só pelo `cleanupE2EData()`, que tem trava dupla contra o id do Marcos.
- **Por quê:** não existe ambiente de staging. O banco dos testes é o de produção.

**A5 🔴 Segredos.** Nunca grave chave ou token em arquivo versionado, em log, em mensagem de commit ou em doc.

- Onde ficam:
  - **funções:** Secrets do Supabase;
  - **cron:** Vault (`service_role_key`);
  - **app:** `.env.local` (gitignored);
  - **testes:** `.env.e2e.local` (gitignored);
  - **token de gestão:** keychain da Supabase CLI ou `SUPABASE_ACCESS_TOKEN`.
- Ao imprimir uma resposta de API que pode conter chave, filtre antes.

**A6 🟠 Chamadas externas que gastam dinheiro** (Gemini, OpenAI, Apify, geração de imagem): não rode em laço nem em teste.

- Testes mockam (`mockEdge`).
- A suíte `@live` (`npm run test:e2e:live`) só roda com pedido explícito.

## B. Banco de dados

**B1 🔴 Nunca `supabase db push`.** Aplique com `scripts/sql.sh -f supabase/migrations/<arquivo>.sql`.

- **Por quê:** o histórico remoto de migrations nunca foi confiável. O schema base foi aplicado pelo dashboard, e há versões colididas e seeds sem `ON CONFLICT`. Um push cego reaplica tudo e duplica dados.

**B2 🟠 Toda migration é:**

- **Versionada:** `supabase/migrations/AAAAMMDD0000NN_nome_curto.sql`, com versão única e maior que a última. Confira com `ls supabase/migrations | tail -3`.
- **Transacional:** `BEGIN; … COMMIT;`.
- **Idempotente:** `CREATE OR REPLACE`, `IF NOT EXISTS`, `DROP … IF EXISTS`, `ON CONFLICT`. Rodar duas vezes não pode quebrar nem duplicar.
- **Documentada:** cabeçalho com a iniciativa e o critério de origem (veja as de `202610*`).
- **Reversível:** um arquivo irmão em `supabase/rollback/<mesmo_nome>_rollback.sql` que devolve o estado anterior exato. Para função alterada, o rollback recria a versão anterior. Teste o rollback mentalmente, linha a linha.

**B3 🟠 Erros de regra usam SQLSTATE `PTxxx`** (`PT409` conflito, `PT422` não pronto/inválido, `PT404` não encontrado), com mensagem **em português, para o Marcos**.

- **Nunca** use `40001` (serialization_failure): o PostgREST repete em laço e trava por 60s.

**B4 🟠 Nunca edite uma migration já aplicada.** Crie outra.

- Para alterar uma função grande só num ponto, um bloco `DO $$ … $$` que lê `pg_get_functiondef` e substitui o trecho é aceitável (foi assim com `piece_readiness` na E4). Comente o motivo.

**B5 🟠 Verifique depois de aplicar:**

- consulte a coluna, função ou trigger nova (`information_schema`, `pg_proc`, `pg_trigger`);
- exercite o caminho feliz e o de erro com um `SELECT` ou `rpc` em dado do usuário de teste.

**B6 🟢 Mudança que remove ou endurece contrato** (drop de coluna, `NOT NULL`, trigger que passa a recusar) só **depois** do app novo no ar.

- Antes disso, a migration é aditiva e o app antigo continua funcionando.

## C. Código

**C1 🔴 Um contrato por tema.** Agendar = `schedule-piece` (cliente: `scheduling.ts`). Aprovar = `approve_piece` / `merge_post_review` (cliente: `approval.ts`). Publicar = `publishOne`. Prontidão = `piece_readiness`. Mensagem de erro = `userMessage()`. Voltar/navegar = `useBack` / `safeInternalPath`.

- Nunca escreva `update user_posts set status='scheduled'` numa tela, nem calcule prontidão no cliente "porque é mais rápido".
- **Por quê:** o diagnóstico de out/2026 achou cinco caminhos diferentes de agendar, cada um com regras próprias. Foi a principal causa da "agenda que mente".

**C2 🟠 Escreva como o código ao redor.**

- Mesma densidade de comentário, nomes, idioma (português) e formatação.
- Comentário explica o **porquê** e cita a origem (`// doc 03 §9`, `// decisão de 18/10`), não o óbvio.
- Não reformate o arquivo e não renomeie o que não precisa.

**C3 🟠 Diff mínimo.** Resolva o pedido, não o que está perto dele.

- Achou outro problema? **Anote no relatório** e não conserte junto (salvo se for trivial e bloqueante).
- Refatoração só com pedido.

**C4 🟠 UI verdadeira:**

- a tela mostra o estado **do servidor**: nada de "aprovado" otimista antes de gravar;
- erro de carregamento ≠ lista vazia (`LoadError`);
- botão em andamento fica desabilitado;
- ação que pode falhar diz por quê, com a mensagem do servidor.

**C5 🟠 Datas:** guarde o instante em UTC e mostre no fuso da operação.

- Nunca `new Date().getHours()` para regra de agenda: use os helpers de `src/lib/schedule.ts`.

**C6 🟠 Cliente fala com o banco por `src/lib/db.ts`** (REST direto).

- Use o supabase-js só para auth e storage já existentes.
- **Por quê:** o supabase-js v2.46 trava queries depois do signIn.

**C7 🟠 Funções Deno:**

- autentique sempre (`userIdFromAuth` ou `isServiceCall`);
- valide a entrada (uuid, enum, datas);
- confira o dono do recurso (`post.user_id === userId`);
- devolva `{success, …}` / `{success:false, error, code}` com o status HTTP certo;
- registre custo de IA com `logUsage`;
- use o contexto da marca, nunca texto fixo de Bee/Marcos.

**C8 🟠 `_shared/campaign-plan.js` é GERADO.** Edite `src/lib/campaign/plan.ts`, rode `npm run build:edge-shared` e redeploy do `campaign-tick`.

**C9 🟢 Rotas TEMP** (`hive/teste-m01`, `hive/teste-m02`) e `alma_*` são legado. Não construa em cima deles.

## D. Testes e verificação

**D1 🔴 Regressão completa antes de push** que toque `src/`, `supabase/` ou `e2e/`: `scripts/regressao.sh`, com 100% verde.

- Se algo falhar, investigue a causa. "Era flaky" só vale depois de entender o porquê e estabilizar o teste, nunca com `retries` ou `skip`.
- Se a falha não tem relação com a sua mudança, diga isso no relatório com a evidência.

**D2 🔴 Uma suíte por vez, e `src/` congelado enquanto ela roda.** O script recusa iniciar se já houver uma rodando.

**D3 🟠 Mudança de comportamento leva teste novo ou atualizado** no spec da área.

- O nome do teste cita o critério do documento (`04/T03`, `03 §20`).
- Teste mais fraco para passar não vale: se o teste antigo contradiz uma decisão nova, atualize-o e diga qual decisão mudou.

**D4 🟠 Nunca afirme que está pronto sem evidência.** Relate exatamente "build ok", "spec X 9/9" e "regressão 191/191 em 35 min". Se não rodou, diga que não rodou.

## E. Processo e comunicação

**E1 🟠 Pergunte só o que é decisão do Raul** (produto, risco, dado real, dinheiro, publicação).

- O que dá para descobrir no código ou no banco, descubra.
- Quando houver escolha, **recomende uma opção** com o porquê, em vez de listar todas.

**E2 🟠 Não faça commit nem push sem pedido**, salvo quando a tarefa já autoriza.

- Commits: um por entrega ou feature, mensagem em português que diz o efeito ("Estabilização E4: publicação exclusiva consumindo o pacote programado"), rodapé `Co-Authored-By`.
- Push direto na `main` (fluxo solo) com a conta `raulmf12`.

**E3 🟠 Toda entrega visível ao Marcos ganha uma nota em linguagem de uso** (antes → agora, como conferir), no doc da iniciativa. Veja [08-COMUNICACAO](08-COMUNICACAO.md).

**E4 🟠 Ações irreversíveis ou externas pedem confirmação:** deploy que muda comportamento de cron, drop, envio a terceiros, reset.

- A aprovação de uma não vale para a próxima.

**E5 🟢 Documente o que não é óbvio do código** (decisões, pendências, armadilhas) no doc da iniciativa ou em [07-ARMADILHAS](07-ARMADILHAS.md). O próximo agente não deve redescobrir.
