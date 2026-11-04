# Como mudar a Hive pelo GitHub (Marcos + agente de IA)

> **Para o agente de IA do Marcos** (ChatGPT/Codex ou outro). Leia inteiro antes da primeira mudança.
> As regras do projeto continuam valendo: [`AGENTS.md`](../../AGENTS.md) é obrigatório.

## A ideia em uma frase

Você **não roda testes**, nem no seu ambiente nem no computador do Marcos. Cada Pull Request (PR) para a `main` dispara **a regressão completa no próprio GitHub** (~200 testes, ~45 min). O resultado aparece no PR como ✅ ou ❌, com a lista do que falhou.

A `main` é protegida: **nada entra sem ✅**. Com ✅, **o próprio Marcos faz o merge**, e o app vai ao ar sozinho (Netlify, ~2 min).

## Passo a passo

### 1. Antes de mudar

- Leia o `AGENTS.md` e, se a mudança for numa área específica, a ficha dela (`docs/agentes/01-CONTEXTO.md` §11).
- Crie uma branch a partir da `main` **atualizada**. Um assunto por PR.

### 2. Faça a mudança

- **Diff mínimo**, no estilo do arquivo, com comentários e textos em português.
- **Mudou comportamento? Atualize ou crie o teste** no spec da área (`e2e/fNN-*.spec.ts`), citando a decisão. Exemplo: `// R1 (PR #2): cada peça conta (decisão do Raul, 03/11)`.
- **Nunca** use `test.skip`, `test.only` ou `retries`, nem afrouxe um `expect` só para passar.

### 3. Abra o PR para a `main`

- Abra como PR **pronto**, não rascunho: rascunho não roda a regressão. Se abrir como rascunho, marque "Ready for review" quando terminar.
- Título e descrição em português, com três partes:
  - **O que muda para o Marcos**, em linguagem de uso.
  - **Arquivos e motivo**, em poucas linhas.
  - **Precisa do Raul**, só se houver. Veja a seção "Banco e funções".

### 4. Espere a regressão

- No PR aparece o check **"Regressão completa / regressao"**. Leva cerca de 45 minutos.
- **Existe uma fila:** só roda uma regressão por vez no repositório inteiro, porque todas usam o mesmo usuário de teste no banco. Se outro PR estiver rodando, o seu fica "Queued/Pending". É normal.
- Ao terminar, o GitHub publica (ou atualiza) **um comentário no PR**:
  - `## ✅ Regressão verde`: pronto para o Raul revisar.
  - `## ❌ Regressão com falhas`: vem a lista de testes que falharam e o erro de cada um.
- Se você não consegue ler o PR, peça ao Marcos para copiar e colar esse comentário para você.

### 5. Se vier ❌

Para cada teste da lista, decida qual é o caso:

| Situação | O que fazer |
|---|---|
| A sua mudança quebrou algo que funcionava | Corrija o código |
| O teste descreve o comportamento **antigo**, e a sua mudança o alterou **de propósito** | Atualize o teste e diga no PR qual decisão mudou. Se a decisão não foi tomada pelo Raul ou pelo Marcos, **pergunte antes** |
| Muitos "fetch failed", "HTTP 502", "ECONNRESET" ou timeouts ao mesmo tempo | É instabilidade, não bug. Peça ao Marcos ou ao Raul para clicar em **"Re-run jobs"** na execução. Não mude código por isso |

- **Junte as correções num único push.** Cada push dispara uma nova regressão de ~45 min. Vários pushes seguidos só enchem a fila.
- O comentário do PR é atualizado a cada nova execução, sempre com o commit testado.

### 6. Se vier ✅: publicar

1. Confira no PR que **não há nada em "Precisa do Raul"** pendente (veja "Banco e funções" abaixo). Se houver, espere o Raul.
2. Se o GitHub mostrar **"This branch is out-of-date with the base branch"**, clique em **"Update branch"**. A regressão roda de novo com a `main` atual e o merge só libera quando voltar ✅. Isso garante que o que entra foi testado junto com o que já estava no ar.
3. Clique em **"Merge pull request"** e depois em **"Confirm merge"**. Pode ser o Marcos, ou você, se ele pedir.
4. Em ~2 minutos o Netlify publica o app. Avise o Marcos: "publicado: <o que mudou, em linguagem de uso>".

Ninguém consegue enviar direto para a `main` sem passar pelo PR com ✅. Só o Raul, como dono, pode.

## Banco e funções (o merge NÃO publica isso)

O merge publica só o **app** (Netlify). Migrations (`supabase/migrations/`) e edge functions (`supabase/functions/`) **não** vão ao ar pelo merge: o Raul aplica.

A regressão roda contra o **banco de produção**, então um PR que depende de uma tabela ou função nova **vai falhar** até o Raul aplicar a parte do banco. Nesses casos:

1. Separe o que é banco (migration **aditiva**, idempotente e com rollback em `supabase/rollback/`; regras em `docs/agentes/02-REGRAS.md` §B).
2. Escreva no PR, em **"Precisa do Raul"**: "aplicar a migration X" e/ou "deploy da função Y".
3. Depois que o Raul aplicar, peça para rodar de novo ("Re-run jobs").

## Nunca

- Mexer em `.github/workflows/`, nos segredos do repositório ou em `scripts/regressao.mjs` sem pedido do Raul.
- Publicar de verdade em rede social, ou usar ou alterar dados reais do Marcos. Os testes usam só o usuário de teste.
- Colar senhas, tokens ou chaves em código, PR, comentário ou commit. **O repositório é público.**
- Rodar `npm run regressao` no seu ambiente ou pedir isso ao Marcos. O caminho é o GitHub.
- Abrir vários PRs ao mesmo tempo sobre a mesma área: um termina e o outro precisa ser refeito em cima dele.
- Fazer merge com ❌, ou com "Precisa do Raul" pendente.

## A prévia do Netlify

Cada PR ganha um link de prévia ("Deploy Preview") para **ver** a mudança. Atenção: a prévia usa o **banco real**. O que se clica nela (aprovar, agendar, publicar) acontece de verdade na conta do Marcos. Use-a para olhar, não para testar ações.

<!-- PR de teste da regressão no GitHub (03/11/2026). -->
