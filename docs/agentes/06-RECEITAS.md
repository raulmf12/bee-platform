# 06 · Receitas — passo a passo das tarefas comuns

Cada receita parte do princípio de que você já leu o `AGENTS.md`. Os caminhos e comandos são reais. Nomes entre `<>` são para substituir.

**Construir:**

- [R1 Migration nova](#r1-migration-nova)
- [R2 Edge function nova](#r2-edge-function-nova)
- [R3 Mudar um módulo `_shared`](#r3-mudar-um-módulo-_shared)
- [R4 Tela ou rota nova](#r4-tela-ou-rota-nova)
- [R5 Tela que agenda, aprova ou publica](#r5-tela-que-agenda-aprova-ou-publica)
- [R6 Novo requisito de prontidão](#r6-novo-requisito-de-prontidão)
- [R7 Mudar o prompt ou a voz da IA](#r7-mudar-o-prompt-ou-a-voz-da-ia)

**Diagnosticar e operar:**

- [R8 Peça agendada não publicou](#r8-peça-agendada-não-publicou)
- [R9 "A aprovação não fica" / "a agenda mostra outra coisa"](#r9-a-aprovação-não-fica--a-agenda-mostra-outra-coisa)
- [R10 Editor abre em branco](#r10-editor-abre-em-branco)
- [R11 Corrigir dado em produção](#r11-corrigir-dado-em-produção)
- [R12 Resultado de publicação incerto (`unknown`)](#r12-resultado-de-publicação-incerto)

---

## R1 Migration nova

1. Escolha a versão:

   ```bash
   ls supabase/migrations | tail -3
   ```

   Use a próxima data/sequência livre, maior que a última (`AAAAMMDD0000NN`).
2. Escreva `supabase/migrations/<versão>_<nome>.sql`:

   ```sql
   -- <Iniciativa> <entrega> — <o que faz> (doc XX §Y · decisão de DD/MM).
   --   * <efeito 1>
   --   * <efeito 2>
   BEGIN;

   ALTER TABLE public.user_posts ADD COLUMN IF NOT EXISTS <col> <tipo>;

   CREATE OR REPLACE FUNCTION public.<fn>(p_post uuid) RETURNS jsonb
   LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
   DECLARE r public.user_posts;
   BEGIN
     SELECT * INTO r FROM public.user_posts WHERE id = p_post AND user_id = auth.uid();
     IF NOT FOUND THEN RAISE EXCEPTION 'Peça não encontrada.' USING ERRCODE = 'PT404'; END IF;
     IF r.status = 'published' THEN
       RAISE EXCEPTION 'Este conteúdo já foi publicado e permanece no histórico.' USING ERRCODE = 'PT409';
     END IF;
     -- …
     RETURN to_jsonb(r);
   END $$;
   GRANT EXECUTE ON FUNCTION public.<fn>(uuid) TO authenticated;

   COMMIT;
   ```

   - `SECURITY DEFINER` **sempre** com `SET search_path` e com checagem de dono (`auth.uid()`).
   - Funções só para o servidor: `REVOKE … FROM authenticated, anon` e `GRANT … TO service_role`.
3. Escreva `supabase/rollback/<versão>_<nome>_rollback.sql`. Ele volta exatamente ao estado anterior: recria a versão antiga da função (pegue com `pg_get_functiondef` **antes** de aplicar), dropa o que foi criado e preserva dados.
4. Aplique e verifique:

   ```bash
   scripts/sql.sh "select pg_get_functiondef('public.<fn>'::regproc)" > /tmp/antes.sql   # se for alterar função existente
   scripts/sql.sh -f supabase/migrations/<versão>_<nome>.sql
   scripts/sql.sh "select proname from pg_proc where proname='<fn>'"
   ```
5. Exercite com dados do usuário de teste (num spec, com `seed` + `sql`).
6. Tabela nova com `user_id`: habilite RLS + policy de dono, e adicione-a em `E2E_OWNED_TABLES` (`e2e/helpers/admin.ts`).

## R2 Edge function nova

1. Crie `supabase/functions/<nome>/index.ts`, seguindo o padrão de `schedule-piece/index.ts`:

   ```ts
   // Edge function: <nome> — <o que faz> (<doc/iniciativa>).
   // Entrada: { … }  Saída: { success, … } | { success:false, error, code }
   import { errorResponse, jsonResponse, preflight, userIdFromAuth } from '../_shared/security.ts';
   import { rest, rpc } from '../_shared/package.ts';

   Deno.serve(async (req: Request) => {
     const cors = preflight(req);
     if (cors) return cors;
     if (req.method !== 'POST') return errorResponse('Use POST', 405);
     const userId = userIdFromAuth(req);
     if (!userId) return errorResponse('Nao autenticado', 401);
     const b = await req.json().catch(() => ({}));
     // validar entrada (uuid, enum, datas) → 400/422
     try {
       // conferir dono do recurso → 404 se não for dele
       // regra de negócio preferencialmente numa RPC (PTxxx vira HTTP certo)
       return jsonResponse({ success: true });
     } catch (e) {
       const err = e as Error & { code?: string };
       console.error('[<nome>]', err.message);
       return jsonResponse({ success: false, error: err.message, code: err.code ?? null }, 500);
     }
   });
   export {};
   ```

   - Chamada pelo cron ou por outra função: aceite `isServiceCall(req)` + `internalUserId(req)` (header `x-bee-user-id`).
   - Função de IA: `resolveContext`/`contextBlock` de `_shared/context.ts`, a chave do usuário (`getUserGeminiKey`) e `logUsage`.
2. Deploy:

   ```bash
   npx supabase functions deploy <nome> --project-ref djlorvdehedcupeykyes
   ```
3. No cliente, adicione um wrapper tipado em `src/lib/edge.ts`. Não chame `fetch` solto na tela.
4. Teste: `callEdgeAsService` (servidor) e/ou um fluxo pela UI. Funções de IA são mockadas com `mockEdge` nos specs de tela.
5. Precisa de cron? Migration com `cron.schedule(...)` usando o Bearer do Vault (veja `20260812000001_publish_scheduler_cron.sql`).

## R3 Mudar um módulo `_shared`

1. Descubra quem depende dele:

   ```bash
   grep -l "_shared/<modulo>.ts" supabase/functions/*/index.ts supabase/functions/_shared/*.ts
   ```

   Repita para os módulos `_shared` que importam o seu (dependência indireta).
2. Mude o módulo.
3. Redeploy de **todas** as funções da lista. Uma função não redeployada continua com a versão antiga embutida.
4. `campaign-plan.js` é exceção: edite `src/lib/campaign/plan.ts`, rode `npm run build:edge-shared` e redeploy do `campaign-tick`.
5. Rode a regressão completa: mudança em `_shared` afeta várias telas.

## R4 Tela ou rota nova

1. Crie a página em `src/pages/<area>/<Nome>.tsx`.
2. Registre a rota em `src/App.tsx`, dentro do bloco protegido (perto das outras da área).
3. Item de menu: `src/components/layout/Sidebar.tsx`, no grupo certo. O mesmo `SidebarNav` serve o celular.
4. **Pode ser destino de "Voltar"?** Adicione a regex em `INTERNAL` (`src/lib/navigation.ts`) e o rótulo em `LABELS` (usado por `backLabel`).
5. Padrões obrigatórios da tela:
   - "Voltar" com `useBack('<pai>')`, nunca `navigate(-1)`;
   - carregamento com `Loading`, e erro com `LoadError`, que tem "Tentar novamente" (`src/components/shared/LoadState.tsx`);
   - erro ≠ vazio;
   - mensagens de erro com `userMessage(e)`;
   - foco por query (`?focus=<id>`) quando a tela lista peças;
   - componentes de UI de `src/components/ui/` (Radix + Tailwind).
6. Tem edição que pode se perder? Use `useBlocker` (padrão do `PostEditor`: diálogo `leave-dialog` com Salvar e sair / Sair sem salvar / Continuar editando).
7. Teste E2E: abrir, ação principal, Voltar e estado de erro.

## R5 Tela que agenda, aprova ou publica

**Nunca** grave `status`, `scheduled_date` ou aprovação direto. Use:

| Ação | Cliente | Servidor |
|---|---|---|
| Agendar / reagendar | `scheduleAt(post, iso, {commandId, planId})` | `schedule-piece` → `commit_schedule` |
| Tirar da agenda | `unschedule(postId)` | idem |
| Adotar a versão atual no pacote / confirmar legado | `runScheduleCommand({intent:'replace_package'})` (ou `updateScheduledPackage` em `src/lib/pieces/ops.ts`) | idem |
| Aprovar componente / peça | `mergeReview` / `approvePieceOnServer` (`src/lib/approval.ts`) | `merge_post_review` / `approve_piece` |
| Mostrar o que falta | `useReadiness(postId, 'schedule')` | `piece_readiness` |
| Publicar agora | wrapper em `src/lib/edge.ts` (trata `PublishStateError` 409) | `publish-post` → `publishOne` |
| Verificar (sem publicar) | `dry_run: true` | `inspectOne` |

- Gere o `command_id` **uma vez por intenção do usuário** e reutilize-o na retentativa. Um timeout pergunta ao `schedule_commands` se o comando já foi gravado: o `scheduling.ts` faz isso.
- Peça publicada (`isPublishedHistory`): esconda ou trave as ações e mostre `PUBLISHED_HISTORY_MSG`.

## R6 Novo requisito de prontidão

1. A regra vai **no banco**, dentro de `piece_readiness`. Assim, agenda, editor, produção e publicação passam a enxergá-la ao mesmo tempo.
2. Pegue a definição vigente:

   ```bash
   scripts/sql.sh "select pg_get_functiondef('public.piece_readiness'::regproc)"
   ```
3. Migration nova com `CREATE OR REPLACE` completo, ou um `DO $$` que troca um trecho (precedente na E4). O motivo vai em `missing[].reason`, em português, para o Marcos: "Há alterações ainda não aprovadas."
4. Rollback com a definição anterior.
5. Teste: peça sem o requisito → `scheduleAt` recusa com PT422 e a UI mostra o motivo.

## R7 Mudar o prompt ou a voz da IA

1. Leia [01-CONTEXTO §7](01-CONTEXTO.md#7-ia-como-o-texto-é-gerado) e as memórias de voz. Vícios proibidos: analogia de natureza sempre, pergunta-CTA/"Vê?" no fim, moral corporativa forçada.
2. A geração principal está em `generate-content/index.ts` (procure o trecho de `buildSystemPrompt`). Os agentes de correção usam `_shared/bee-context.ts`.
3. Conteúdo específico do especialista vem do **banco** (Genesis, diretrizes, perfil), não do prompt. Antes de pôr texto fixo no código, veja se ele cabe numa diretriz (`/diretrizes`) ou no perfil.
4. Variedade de forma (template) é forçada no código, não pedida ao LLM.
5. Testes com mock garantem o encanamento, não a qualidade do texto. A qualidade se confere com a suíte `@live`, **só com pedido do Raul** (custa dinheiro), ou mostrando amostras a ele.

---

## R8 Peça agendada não publicou

Siga em ordem e pare no primeiro achado:

```bash
# 1. Estado da peça
scripts/sql.sh "select id, status, scheduled_date, scheduled_package_id, publish_attempts, left(publish_error,120) err,
  account_id, metadata->>'scheduled_outdated' outdated from user_posts where id='<id>'"
# 2. Reservas/tentativas de publicação
scripts/sql.sh "select stage, status, failure_class, left(error,120) e, started_at, finished_at, url from post_publications where post_id='<id>' order by started_at"
# 3. O cron está chamando e recebendo 200?
scripts/sql.sh "select status_code, left(content::text,160), created from net._http_response order by created desc limit 5"
```

| Achado | Causa | Solução |
|---|---|---|
| `scheduled_package_id` nulo | Agendamento **legado** | O Marcos clica "Confirmar material" na agenda (decisão 2). Não feche o pacote por SQL |
| Vencida há mais de 2h | Fora da janela de graça (`GRACE_MS`) | Reagendar pela UI |
| `stage='unknown'` / `needs_reconciliation` | Resultado incerto | [R12](#r12-resultado-de-publicação-incerto) |
| Cron com 401 | O Bearer do Vault sumiu ou mudou | Checar `vault.decrypted_secrets` (`service_role_key`); veja [07-ARMADILHAS](07-ARMADILHAS.md) |
| `EXPIRED_ACCESS_TOKEN` (LinkedIn) | Token de ~60 dias venceu | O Marcos cola um token novo em Configurações → Integrações |
| Sem imagem renderizada | O render é client-side | Abrir a peça no editor (renderiza sozinha) e confirmar o pacote |

## R9 "A aprovação não fica" / "a agenda mostra outra coisa"

1. Compare o banco com a tela (a verdade é o banco):

   ```bash
   scripts/sql.sh "select status, image_approved, approved_version, version, metadata->>'titulo_status' t,
     metadata->>'legenda_status' l, metadata->>'edited_after_approval' e from user_posts where id='<id>'"
   ```
2. O banco diz aprovado e a tela não? Store desatualizado (`postStore`) ou tela calculando estado por conta própria. Faça a tela ler do servidor ou usar os contratos de R5.
3. O banco diz pendente? Alguém editou depois de aprovar (`invalidate_on_edit`, decisão 1: comportamento correto) ou a tela não chamou o contrato. Procure `postApi.update(` / `updatePost` / `update user_posts` na tela.
4. Ache **todos** os caminhos que escrevem aquele campo antes de corrigir:

   ```bash
   grep -rn "status: 'approved'\|scheduled_date:" src --include=*.ts*
   ```

   A correção é fazer todos passarem pelo contrato.

## R10 Editor abre em branco

1. Veja a armadilha completa em [07-ARMADILHAS](07-ARMADILHAS.md#editor-fabric). Resumo: o `initialFabricJson` nunca pode ser `undefined` na montagem, e o fabric re-serializado com estilos em array plano não recarrega.
2. Confira o fabric salvo:

   ```bash
   scripts/sql.sh "select carousel_fabric_json->0->>'version' v, jsonb_array_length(carousel_fabric_json->0->'objects') n from user_posts where id='<id>'"
   ```

   `n=0` com `version` 6.9.1 indica que um canvas vazio foi gravado por cima.
3. Recuperação: botão **Hive** no editor recompõe pelo seed (`visual_decision`).

## R11 Corrigir dado em produção

1. **Mostre antes:**

   ```bash
   scripts/sql.sh "select id, status, left(title,50) from user_posts where <condição>"
   ```
2. Diga ao Raul quantas linhas e quais, e o que vai mudar. **Espere o "pode".**
3. Aplique com `WHERE id IN (<ids exatos>)`, nunca pela condição genérica (ela pode ter mudado entre o SELECT e o UPDATE). Prefira a RPC ou o contrato (ex.: `replace_package`) ao UPDATE cru: os triggers protegem por um motivo.
4. Rode o mesmo SELECT depois e registre na ficha da iniciativa o que foi corrigido e por quê.

## R12 Resultado de publicação incerto

- Estágio `unknown`: a chamada decisiva saiu e não houve resposta (ou houve 5xx). **O post pode estar no ar.**
- **Nunca** reenvie às cegas: o resultado seria post duplicado.
- O caminho é a reconciliação:
  1. o editor mostra o aviso e o `ReconcileDialog`;
  2. "Procurar no Instagram" (`find_on_instagram`) tenta achar o post;
  3. o Marcos confirma "foi publicado" (registra a URL) ou "não foi" (libera nova tentativa).
- Por SQL, só com o Raul ao lado e com a evidência (URL do post ou a confirmação de que ele não existe).
