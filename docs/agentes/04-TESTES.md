# 04 · Testes — regressão, como rodar, como escrever

## 1. O que é a "regressão completa"

É rodar **todos** os testes automatizados de uma vez: hoje, **174 testes em ~38 min**. Cada teste abre o app num navegador de verdade, faz o que o Marcos faria (agendar, aprovar, voltar, publicar com token falso…) e confere o resultado na tela e no banco. Os testes `unit-*` testam funções puras, em milissegundos.

**Por que toda mudança exige a regressão completa:** a Hive é muito acoplada. Agenda, editor, produção e publicação compartilham contratos. Uma mudança "só na agenda" já quebrou o editor e a produção (um trigger novo da E4 bloqueou a aplicação de candidatos na F16). Só a suíte inteira pega isso.

| Mudou… | Exige |
|---|---|
| `src/`, `supabase/` (migration, função, `_shared`), `e2e/`, `package.json`, configs de build | **Regressão completa verde antes do push** |
| Só `docs/`, `*.md`, `scripts/` que não afetam app nem testes | `npm run build` (por garantia) |
| Banco ou função em produção sem mudar arquivo (correção de dado) | Spec da área + justificativa no relatório |

## 2. Como rodar

```bash
scripts/regressao.sh                                   # suíte inteira (~38 min), log em /tmp/regressao-*.log
scripts/regressao.sh e2e/f24-aprovacao-agenda-e3.spec.ts   # um spec
scripts/regressao.sh e2e/f25-publicacao-e4.spec.ts -g "reconcilia"   # um teste pelo nome
npx playwright show-report                             # relatório HTML da última execução
```

**Pré-requisitos** (uma vez por máquina):

- `.env.local`: `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`.
- `.env.e2e.local`: `E2E_EMAIL`, `E2E_PASSWORD` e `E2E_USER_ID` do usuário de teste isolado. **Peça ao Raul; nunca invente.**
- Token de gestão do Supabase: a Supabase CLI logada (`npx supabase login`, que fica no keychain do macOS). Os helpers `e2e/helpers/admin.ts` leem dali para semear e limpar dados.
- `npx playwright install chromium`.

**Como a suíte funciona:**

- O Playwright sobe `npm run dev` na porta 5199 (`E2E_PORT` muda isso; útil em worktree).
- O projeto `setup` faz login pela tela e salva a sessão em `e2e/.auth/user.json`.
- O projeto `e2e` roda todos os specs **em série** (`workers: 1`), no fuso `America/Sao_Paulo` e com locale `pt-BR`.
- `@live` (IA real) e `@tool` (ferramentas em `e2e/tools`) ficam **fora** por padrão.

**Lendo o resultado:**

- O script mostra só as falhas e o resumo; o log completo fica no arquivo.
- Para cada falha, `test-results/<pasta-do-teste>/` tem `error-context.md`, screenshot, vídeo e `trace.zip` (`npx playwright show-trace <zip>`).
- Leia primeiro a mensagem de erro no log e o `error-context.md`, se existir. São texto, baratos e geralmente bastam. Screenshot e trace ficam para quando o texto não explicar.

## 3. Diagnóstico de falhas: os padrões já vistos

| Sintoma | Causa provável | Ação |
|---|---|---|
| Dezenas de "fetch failed" ou timeouts em sequência | Mac dormiu, rede caiu, Supabase instável | Rode de novo (o script usa `caffeinate`) antes de olhar código |
| Clique "não fez nada" / elemento não encontrado logo no começo do teste | Teste agiu antes da tela carregar | Espere um marcador de carregado (`await expect(getByTestId('queue-count')).toBeVisible()`) antes de agir |
| `strict mode violation: resolved to 2 elements` | Texto duplicado na tela | Seletor mais específico (`exact: true`, escopo por `getByTestId(...)`, `.first()` só se for de fato equivalente) |
| Arraste no calendário falha às vezes | `boundingBox()` nulo durante re-render | Helper com retentativa do `box()` (veja `f22`) |
| Teste de editor falha no export | Peça semeada sem `carousel_fabric_json` | Semeie com fabric válido e espere o canvas renderizar (`rendered_slides` preenchido) |
| Agendar recusa com "Nenhuma conta conectada" | Peça sem `account_id` | Use `seedAccounts()` e passe `account_id` |
| Pacote parece "adulterado" sem ter sido | Hash calculado com campo `undefined` / leitura via CDN | Já corrigido em `canonical()` / `verifyPackage`. Não reintroduza |
| Falha só depois de mexer numa função `_shared` | Outra função que importa o módulo não foi redeployada, ou o bundle `campaign-plan.js` está velho | `grep -l "_shared/<mod>" supabase/functions/*/index.ts` e redeploy; `npm run build:edge-shared` |

**Nunca "conserte" com:** `retries`, `test.skip`, `waitForTimeout` longo, ou afrouxar o `expect` até passar. Espera tem que ser por **condição**: `expect(...).toBeVisible()`, `expect.poll(() => sql(...))`.

## 4. Como escrever um teste

**Onde:** no spec da iniciativa (`e2e/fNN-<tema>.spec.ts`), ou num spec novo com o próximo número livre para uma iniciativa nova. Função pura vai em `e2e/unit-<tema>.spec.ts`, importando de `../src/lib/...`.

**Esqueleto padrão** (ilustrativo: confira os nomes de botões e testids reais no componente):

```ts
import { test, expect } from '@playwright/test';
import { cleanupE2EData, seed, sql } from './helpers/admin';
import { seedAccounts } from './helpers/fixtures';
import { mockEdge } from './helpers/mocks';

// FNN — <Iniciativa> (doc XX): <o que este arquivo garante, em uma linha>.
test.describe('FNN · <tema>', () => {
  test.beforeEach(async () => { await cleanupE2EData(); });
  test.afterAll(async () => { await cleanupE2EData(); });

  test('<comportamento em linguagem de uso> (04/T03)', async ({ page }) => {
    const acc = await seedAccounts();                       // contas com TOKEN FALSO
    const pid = await seed('user_posts', { platform: 'linkedin', format: 'image', status: 'approved',
      title: 'X', caption: 'L', carousel_text: { quote: 'X' }, account_id: acc.linkedin,
      rendered_slides: { slide1: 'https://example.com/x.jpg' }, metadata: { editorial_slug: 'diagnostico-sistemico' } });
    await mockEdge(page, 'generate-content', () => ({ success: true /* … */ }));   // IA sempre mockada
    await page.goto(`/posts/${pid}`);
    await page.getByRole('button', { name: 'Aprovar' }).click();
    await expect(page.getByTestId('approval-state')).toContainText('Aprovada');      // o que o usuário vê
    await expect.poll(async () => (await sql<{ s: string }>(`select status s from user_posts where id='${pid}'`))[0].s)
      .toBe('approved');                                                              // o que o banco gravou
  });
});
```

**Regras dos testes:**

1. **Dados:** só do usuário de teste, via `seed()` / `fixtures`. Limpe no `beforeEach` e no `afterAll`. Tabela nova com `user_id` → adicione em `E2E_OWNED_TABLES` (`e2e/helpers/admin.ts`), filhos antes dos pais. Arquivos no Storage → só na pasta `<E2E_USER_ID>/`.
2. **Confira os dois lados:** a tela (o que o Marcos vê) **e** o banco (o que ficou gravado). Bug de "a tela mente" só aparece assim.
3. **Seletores:** prefira `getByRole` com nome acessível e `getByTestId`. Adicione `data-testid` estável no componente quando precisar (nome em kebab-case: `scheduled-package`, `reconcile-yes`). Não use classe CSS nem texto que muda.
4. **IA:** sempre `mockEdge`. Respostas realistas ficam em `e2e/helpers/mocks.ts`.
5. **Publicação:** só contas de `seedAccounts()` (token falso → 4xx antes de enviar). Para simular resultado incerto, intercepte (`page.route`) ou grave o estágio direto no banco do usuário de teste. Nunca use conta real.
6. **Chamadas de serviço** (como o cron faz): `callEdgeAsService(fn, body)`, escopado ao usuário de teste.
7. **Nome do teste** = comportamento + critério do documento, entre parênteses.
8. **Teste o caminho de erro também:** recusa do banco (PT409/PT422), timeout, retentativa com o mesmo `command_id`, sessão expirada.

## 5. Checklist antes de declarar verde

- [ ] `npm run build` ok
- [ ] Spec(s) da área ok, incluindo os testes novos
- [ ] `scripts/regressao.sh` → **N/N passed**, com N anotado (hoje 174 + os novos)
- [ ] Nenhum `skip`/`only`/`retries` novo (`git diff | grep -E "\.only|\.skip|retries"`)
- [ ] Banco do usuário de teste limpo (o `afterAll` cuida disso)
- [ ] Relatório com a linha de evidência: "regressão completa N/N (DD/MM, X min)"
