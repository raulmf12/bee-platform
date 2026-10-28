# 07 · Armadilhas — bugs que já custaram caro (não repita)

Cada item: **sintoma → causa → regra**. Antes de depurar algo parecido, procure aqui (`grep -n -i "<palavra>" docs/agentes/07-ARMADILHAS.md`). Achou uma armadilha nova? Acrescente no mesmo formato.

---

## Banco e Supabase

- **`db push` duplica dados.**
  - Causa: o histórico remoto de migrations é inconsistente (schema base aplicado pelo dashboard, versões colididas, seeds sem `ON CONFLICT`).
  - Regra: aplique só por `scripts/sql.sh -f`.
- **Erro `40001` trava 60s.**
  - Causa: o PostgREST repete `serialization_failure` em laço.
  - Regra: erros de regra usam `PT409`/`PT422`/`PT404`.
- **Cron "succeeded" mas nada acontece.**
  - Causa: `cron.job_run_details` só registra que o `net.http_post` foi enfileirado. Em set/2026 o header ia como `Bearer ` vazio (GUC nunca setado) e o gateway devolvia 401.
  - Regra:
    - o Bearer do cron vem do Vault (`select decrypted_secret from vault.decrypted_secrets where name='service_role_key'`);
    - a verdade está em `net._http_response.status_code`.
- **Chamada de serviço com 401.**
  - Causa: o env `SUPABASE_SERVICE_ROLE_KEY` das funções virou `sb_secret_…` (rotação de 25/09/2026), mas o cron manda a JWT legacy.
  - Regra: reconheça chamada de serviço com `isServiceCall` (aceita as duas). Nunca compare só com o env.
- **`UPDATE cron.job` → permission denied.**
  - Regra: use `cron.alter_job(jobid, active := false/true)`.
- **`ALTER DATABASE … SET app.x` → negado** para o role da Management API.
  - Regra: configuração vai no Vault ou numa tabela, não em GUC.
- **403 do Supabase.**
  - Causa: a conta foi removida da organização (out/2026).
  - Regra: pare e peça. Não contorne.

## Pacote imutável e publicação

- **Todo pacote parecia adulterado.**
  - Causa: `canonical()` serializava chaves com valor `undefined`, então o hash recalculado divergia.
  - Regra: o manifesto canônico **omite** chaves `undefined`. Não mude `canonical()` sem rodar f23/f25.
- **Adulteração do arquivo não detectada.**
  - Causa: `verifyPackage` lia os bytes pela URL pública (CDN em cache).
  - Regra: leia do storage autenticado (`/storage/v1/object/packages/<path>` com headers de serviço).
- **Post publicado e sumido da fila sem registro.**
  - Causa: portões em `publish.ts` davam `throw` antes de contar a tentativa e gravar o erro, e a janela de 2h virava perda.
  - Regra: toda falha grava `publish_error` e o estágio. Nenhuma falha é silenciosa.
- **Risco de post duplicado.**
  - Causa: o botão "Publicar agora" e o cron disputavam a mesma peça, e o reenvio depois de timeout podia duplicar.
  - Regra:
    - reserva exclusiva em `post_publications` (`acquire` → `mark_sending` → `confirm`/`fail`);
    - `unknown` só sai por reconciliação.
- **Aplicar um candidato bloqueava a troca de pacote.**
  - Causa: o trigger `invalidate_on_edit` marcava `edited_after_approval` também quando a versão avançava.
  - Regra: o trigger ignora escritores explícitos (mudança de `version`, `status` ou aprovação).
- **Agendamento legado.**
  - Causa: peças agendadas antes da E2 não têm `scheduled_package_id`.
  - Regra: o scheduler não as publica. A UI mostra ⚠ e "Confirmar material" (`replace_package` → origem `legacy_confirmed`). Não feche o pacote por SQL.
- **Token LinkedIn de ~60 dias, sem refresh automático.**
  - Sintoma: quando vence, todos os posts LinkedIn falham com `EXPIRED_ACCESS_TOKEN`.
  - Regra: o Marcos cola um token novo em Integrações.
- **Instagram rejeita PNG.**
  - Regra: os renders finais para IG são JPEG (`toJpegDataUrl`).

## Editor (Fabric) {#editor-fabric}

- **Editor em branco ao abrir pela lista.**
  - Causa: `initialFabricJson` chegava `undefined` na montagem e a janela de hidratação (`canvasEpoch`) era perdida.
  - Regra: passe `fabricJson ?? post.carousel_fabric_json?.[0]`, nunca `undefined`.
- **Auto-save apagou a arte.**
  - Causa: com o canvas em branco, o save de 3s gravava `{objects:[]}` por cima do fabric bom.
  - Regra: há uma trava (recusa salvar 0 objetos se o persistido tinha mais de 0). Não remova.
- **Fabric re-serializado não recarrega e dropa o espaço do destaque.**
  - Causa: o `toObject()` do Fabric v6 grava `styles` como array plano; ao recarregar falha, e o range engole o espaço da fronteira.
  - Regra: `serialize()` preserva os styles **aninhados**. Nunca confie no array plano.
- **Render offscreen sai branco.**
  - Causa: `StaticCanvas` fora do DOM falha no mesmo load.
  - Regra: o render confiável é o canvas **ao vivo** do editor. Não existe render no servidor.
- **Editor mostra versão velha.**
  - Causa: hidratava só no `[post.id]`. O store atualizava e o editor não acompanhava.
  - Regra: re-hidrata quando a assinatura do fabric muda e não há edição pendente.
- **Zoom do editor é CSS transform.**
  - Regra: coordenadas de guias e réguas dividem por `getZoom()`.

## App (React)

- **Queries que "penduram" depois do login.**
  - Causa: locks internos do supabase-js v2.46.
  - Regra: queries via `src/lib/db.ts` (REST direto com JWT em cache e renovação antes de expirar).
- **"Voltar" saía da Hive.**
  - Causa: `navigate(-1)` sem histórico, por exemplo em link aberto em nova aba.
  - Regra: `useBack(fallback)`. A origem é validada por `safeInternalPath` (não aceita `//host`, `javascript:` nem caminho fora de `INTERNAL`).
- **Produção abria a primeira campanha sozinha.**
  - Regra: nunca escolha pelo usuário. Use o último trabalho (`hive.lastWork.production.<uid>`), a única campanha existente, ou pergunte.
- **Erro de rede exibido como "Nenhuma campanha".**
  - Regra: estados distintos `loading` / `error` / `empty` (`LoadError`).
- **Resposta antiga sobrescrevendo a nova.**
  - Causa: troca rápida de campanha ou etapa.
  - Regra: guarda `alive`/id da requisição. Descarte respostas de pedidos anteriores.
- **Variável `back` colidindo** (NewCampaign).
  - Regra: ao introduzir `useBack`, verifique os nomes já usados no componente.
- **Hora errada na agenda.**
  - Causa: hora calculada no fuso do navegador.
  - Regra: helpers de `src/lib/schedule.ts` com `user_settings.timezone`.

## IA e conteúdo

- **"A Hive não conseguiu ler seu momento" e toda a IA parada (27/10/2026).**
  - Causa: acabaram os créditos pré-pagos do Gemini. O Google responde **402 RESOURCE_EXHAUSTED** em todos os modelos, e o erro na tela é genérico.
  - Regra: diante de falha geral de IA, teste a chave antes de mexer em código (`curl …/v1beta/models/<modelo>:generateContent?key=…`). A recarga é feita pelo dono da chave em ai.studio/projects → Billing.

- **Sempre o mesmo template (100% M01-B).**
  - Causa: o LLM classifica a voz provocativa sempre como "Tensão".
  - Regra: variedade de forma é **forçada no código** (`IG_VARIANT_ROTATION`).
- **Texto com tiques** (natureza toda vez, "Vê?", pergunta-CTA, moral corporativa).
  - Causa: o próprio prompt mandava fechar com analogia ou virada.
  - Regra: são opcionais, e há a "caça aos tiques" na autochecagem.
- **Repetição de temas.**
  - Causa: RAG fixo por campanha, poucos exemplos, memória só por título.
  - Regra: `content_memory` + juiz. Não reduza a memória.
- **Voz derivando.**
  - Causa: a IA realimentando a metodologia com o próprio output.
  - Regra: tudo minerado passa por `bee_suggestions` → curadoria humana.
- **Coach que "só captura feedback".**
  - Regra: o assistente propõe texto aplicável (`post-chat` `mode:'rewrite'` → cards com "Aplicar"). Ferramenta de IA que não produz resultado acionável é percebida como inútil.

## Testes

- **Mac dormiu no meio da suíte e gerou dezenas de "fetch failed".**
  - Regra: `caffeinate -i` (já no `scripts/regressao.sh`); rode de novo antes de investigar.
- **Duas suítes juntas.**
  - Causa: o cleanup de uma apaga os dados da outra, e as falhas são aleatórias.
  - Regra: uma por vez (o script recusa a segunda).
- **Teste agindo antes de a tela carregar.**
  - Regra: espere um marcador (`queue-count`, painel visível) e use `expect.poll` para o banco.
- **Peça semeada sem conta, imagem ou identidade.**
  - Causa: a prontidão recusa ("Nenhuma conta conectada").
  - Regra: use `seedAccounts()` (token e identidade falsos) e `uploadE2EImage` para imagem real.
- **Bundle velho.**
  - Causa: `campaign-plan.js` desatualizado em relação a `plan.ts`, e o `campaign-tick` se comporta diferente do teste.
  - Regra: `npm run build:edge-shared` + redeploy.
- **Teste de regra do banco recebendo só "HTTP 400".**
  - Causa: helper administrativo (`e2e/helpers/management.ts`) que lança erro sem ler o corpo da resposta. Os testes que conferem a recusa do banco (`/imutável/`, `/fora da seleção/`…) perdem a mensagem.
  - Regra: o erro do helper sempre carrega o corpo (o motivo do banco).
- **Arraste no calendário que só falha em certas datas.**
  - Causa: o dia de destino (ex.: "amanhã" na 5ª ou 6ª semana do mês) fica abaixo da área visível, e o `page.mouse` usa coordenadas da janela.
  - Regra: antes de arrastar, deixe a janela alta o bastante para origem e destino ficarem visíveis (`setViewportSize`). Teste que passa num dia e falha no outro é suspeito de data.
- **Rajada de "Management API: HTTP 502" no fim da suíte.**
  - Causa: instabilidade da API de administração do Supabase, não do app.
  - Regra: rode de novo só os specs afetados antes de investigar.
