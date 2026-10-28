# Regressão completa no Windows — passo a passo

A regressão roda **no seu computador**, num terminal (PowerShell). **Não roda dentro do ChatGPT/Codex na nuvem:** lá não existem as senhas do usuário de teste nem o acesso ao Supabase, e a rede é bloqueada. Por isso o GPT "não conseguiu executar".

Um agente instalado no próprio PC (Codex CLI, Claude Code etc.) consegue rodar, desde que a preparação abaixo esteja feita.

---

## Preparação (uma vez só, ~15 min)

### 1. Programas

- **Node.js LTS** (versão 20 ou mais nova): baixe em https://nodejs.org e instale com as opções padrão.
- **Git**: https://git-scm.com/download/win, com as opções padrão.

Feche e abra o PowerShell depois de instalar.

### 2. Baixar o projeto

```powershell
cd $HOME\Documents
git clone https://github.com/raulmf12/bee-platform.git
cd bee-platform
npm install
```

Se o projeto já existir no PC, basta atualizar:

```powershell
cd $HOME\Documents\bee-platform
git pull
npm install
```

### 3. Os dois arquivos de configuração (peça ao Raul)

Eles **não** ficam no GitHub, de propósito: têm senhas. Crie os dois na pasta `bee-platform`, com o Bloco de Notas. Use "Salvar como" → "Todos os arquivos", para não virar `.txt`.

**`.env.local`**

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

**`.env.e2e.local`**

```
E2E_EMAIL=...
E2E_PASSWORD=...
E2E_USER_ID=...
SUPABASE_ACCESS_TOKEN=sbp_...
```

- Os valores de `E2E_*` e `VITE_*` vêm com o Raul. É o usuário de **teste**, isolado dos seus dados reais.
- O `SUPABASE_ACCESS_TOKEN` é **seu**:
  1. Peça ao Raul para convidar a sua conta para a organização do projeto no Supabase, com um papel que permita rodar SQL.
  2. Entre em https://supabase.com/dashboard/account/tokens.
  3. Clique em **Generate new token** e cole o token aqui.
- ⚠ Esse token dá acesso administrativo ao banco de produção. Guarde-o como uma senha e nunca o cole em chat, e-mail ou GitHub.

### 4. Conferir se está tudo pronto

```powershell
npm run regressao:check
```

Cada item aparece com ✔ ou ✘. Para cada ✘, a seta (→) diz o que fazer. Na primeira vez, o script baixa sozinho o navegador de teste (~150 MB).

## Rodar a regressão

```powershell
npm run regressao
```

- Leva **uns 40 minutos**. O script mantém o PC acordado, mas deixe-o **na tomada** e não feche a janela.
- Ele mostra o progresso ("teste 57 de 191…") e, no fim, o resultado:
  - **✅ Regressão verde:** pode seguir.
  - **❌ com falhas:** aparece a lista dos testes que falharam, com o motivo, e o caminho do log completo. Mande essa lista (ou o arquivo de log) ao Raul antes de subir qualquer mudança.
- Para rodar só um arquivo de teste (mais rápido, para conferir uma área):

  ```powershell
  npm run regressao -- e2e/f6-agenda.spec.ts
  ```

**Regras:**

- **Nunca rode duas regressões ao mesmo tempo**, nem em PCs diferentes: o usuário de teste é um só, e uma apaga os dados da outra. O script recusa a segunda no mesmo PC, mas não enxerga outro computador. **Combine com o Raul antes de rodar.**
- Não edite o código enquanto a regressão roda.

## Problemas comuns

| Mensagem | O que fazer |
|---|---|
| `npm` não é reconhecido | O Node não foi instalado, ou o PowerShell não foi reaberto depois |
| "falta o arquivo .env.e2e.local" | Etapa 3 |
| "token do Supabase: … não tem acesso ao projeto" | A sua conta Supabase ainda não foi convidada para o projeto: fale com o Raul. **Não use a conta de outra pessoa** |
| "pouco espaço em disco" | Libere pelo menos 2 GB |
| Execução de scripts desabilitada no PowerShell | Rode uma vez `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` e confirme |
| Muitas falhas com "fetch failed" ou "HTTP 502" | Internet caiu, o PC suspendeu ou o Supabase ficou instável. Rode de novo antes de concluir que há bug |

## Para agentes de IA rodando no PC (Codex CLI, Claude Code…)

- Use `npm run regressao:check` e depois `npm run regressao`. Nunca `scripts/regressao.sh` no Windows: é bash.
- SQL em produção no Windows: `npm run sql -- "select 1"`.
- Se o check acusar falta de `.env` ou de token, **pare e peça ao humano**. Não invente valores e não tente outro caminho de acesso.
- As demais regras valem iguais: veja [`AGENTS.md`](../../AGENTS.md) e [04-TESTES](04-TESTES.md).
