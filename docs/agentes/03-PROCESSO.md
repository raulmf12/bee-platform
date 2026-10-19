# 03 · Processo — como uma mudança vai do pedido à produção

Este é o método com que a Hive foi construída: Campanhas, ACJ, Identidade (6 fases) e Estabilização (E1–E5). Siga na ordem. Pular etapa é o que gera retrabalho.

---

## 0. Ao começar (ou retomar) uma sessão

1. Leia o `AGENTS.md`. Ele está atualizado; não releia o README inteiro de 50 KB.
2. Veja o estado do repositório:

   ```bash
   git status --short && git log --oneline -5
   ```

   Há trabalho não commitado? É seu, de outra sessão, ou do Raul? **Não descarte nada** sem perguntar.
3. Se a tarefa continua uma iniciativa, abra só a ficha dela (ex.: `docs/estabilizacao/ENTREGAS.md`, última seção) e o plano, se existir.
4. Uma sessão interrompida no meio de uma regressão se retoma **rodando a regressão de novo**, não confiando no log parcial. O log fica em `/tmp/regressao-*.log`.

## 1. Entender

- Reescreva o pedido em uma frase: **qual comportamento muda, para quem e como se confere.**
- Se o pedido vem de documento (o Raul costuma mandar `.md`/`.docx` em `~/Downloads/…`), leia **todos** os documentos citados antes de planejar. Eles têm critérios numerados (`T01…`): use esses números nos testes e nas fichas.
- Se o pedido é uma reclamação de uso ("o Coach só captura feedback, não propõe texto"):
  1. reproduza o caminho no código;
  2. ache a causa;
  3. corrija o comportamento, não o sintoma.
- **Pergunte só o que é decisão de produto ou risco.** Traga a recomendação junto: "Recomendo A porque…; a alternativa B custa…".

## 2. Localizar o contrato

Antes de escrever código, responda: **qual contrato já cuida disso?** (veja [01-CONTEXTO §5](01-CONTEXTO.md#5-contratos-compartilhados-c1c6))

```bash
grep -rn "scheduleAt\|approvePiece\|piece_readiness" src --include=*.ts* | head   # quem já usa
grep -l "_shared/package.ts" supabase/functions/*/index.ts                       # quem depende
```

- **Existe contrato:** use ou estenda. Mudar o contrato muda **todas** as telas que o usam: liste-as.
- **Não existe:** crie **um**, no lugar certo (banco para regra e garantia, `_shared/` para servidor, `src/lib/` para cliente), e faça as telas usarem ele.

## 3. Planejar

| Tamanho | Plano |
|---|---|
| Pequeno (1–3 arquivos, sem banco) | Mental: siga para implementar |
| Médio (banco + função + tela) | Lista curta no relatório ou numa tarefa: migration → função → cliente → teste |
| Grande (iniciativa com documentos) | `docs/<iniciativa>/PLANO-IMPLEMENTACAO.md` com: decisões necessárias (e a recomendação), contratos, entregas em ordem (E1, E2…) que valem sozinhas em produção, critérios por entrega, testes, riscos e rollback. Apresente ao Raul **antes** de implementar |

Para iniciativas grandes, faça um **inventário E0** primeiro: o estado real no banco que a mudança vai afetar. Exemplo da estabilização: "6 agendamentos legados sem pacote; 1 parado desde 09/09". Grave em `docs/<iniciativa>/inventarios/`. Ele decide a migração de dados e as notas para o Marcos.

**Ordem das entregas:** primeiro **proteções** (impedir o dano: triggers, bloqueios), depois a **fundação** (contratos), depois as **telas** que consomem a fundação. Cada entrega é implantável e reversível sozinha.

## 4. Implementar

- Uma entrega por vez, do banco para a tela:
  1. migration (+ rollback);
  2. `_shared` e funções;
  3. `src/lib`;
  4. telas;
  5. testes.
- Diff mínimo, no estilo do arquivo ([02-REGRAS C2/C3](02-REGRAS.md#c-código)).
- Mensagens ao usuário em português, para o Marcos: o que aconteceu e o que fazer. Nunca "Error 409".
- Ao mexer num arquivo grande, leia só a região relevante (veja [05-TOKENS](05-TOKENS.md)).
- **Mantenha o build verde o tempo todo:** rode `npm run build` ao fim de cada bloco lógico, não só no final.

## 5. Verificar em camadas (rápido → lento)

| Camada | Comando | Quando |
|---|---|---|
| Tipos + build | `npm run build` | A cada bloco |
| Banco | `scripts/sql.sh "select …"` exercitando a função/trigger nova com dado do usuário de teste | Logo após aplicar a migration |
| Função | `callEdgeAsService` num spec, ou curl com JWT de teste | Logo após o deploy |
| Spec da área | `scripts/regressao.sh e2e/fNN-*.spec.ts` | Ao terminar a entrega |
| **Regressão completa** | `scripts/regressao.sh` | **Antes do push. Sempre.** |

Falhou? Leia o erro, o trace e o screenshot (`test-results/<teste>/`). Ache a causa, corrija e rode **só aquele spec** até passar. Depois, a regressão completa de novo.

## 6. Deploy (ordem fixa)

```
1. Migration ADITIVA        scripts/sql.sh -f supabase/migrations/<arquivo>.sql   → verificar no banco
2. Edge functions           npx supabase functions deploy <nome> --project-ref djlorvdehedcupeykyes
                            (mudou um _shared? redeploy de TODAS as funções que o importam)
3. Regressão completa       scripts/regressao.sh   (roda contra o banco/funções novos + app local novo)
4. App                      git commit + git push origin main   → Netlify publica (~2–3 min)
5. Migration que ENDURECE   só depois do app novo no ar
6. Conferência pós-deploy   crons respondendo 200; nenhuma peça real em estado estranho
```

**Por que as funções e o banco vão antes da regressão:** os E2E rodam o app **local** contra o Supabase de **produção**. A regressão só prova algo se o servidor já estiver na versão nova.

**A janela de risco:** entre o passo 2 e o 4, o app de produção ainda é o antigo falando com o servidor novo. O servidor precisa aceitar os dois (compatibilidade para trás). Se não der, combine a janela com o Raul.

**Conferência dos crons depois de mexer em publicação:**

```bash
scripts/sql.sh "select r.status_code, left(r.content::text,160) c, r.created from net._http_response r order by r.created desc limit 5"
```

**Pausar o agendador** durante uma troca arriscada (só se houver peça vencendo na janela):

```bash
scripts/sql.sh "select cron.alter_job((select jobid from cron.job where jobname='publish-scheduler'), active := false)"
```

Reative no fim, com `active := true`.

## 7. Rollback

- **App:** `git revert <commit>` + push.
- **Função:** redeploy a partir do commit anterior (`git stash`/`git checkout <sha> -- supabase/functions/<nome>` → deploy → volte o arquivo).
- **Banco:** `scripts/sql.sh -f supabase/rollback/<nome>_rollback.sql`. Rollback de dados é caso a caso. Por isso as migrations não destroem dados.

## 8. Commit e push

```bash
git add <arquivos da entrega>            # nunca "git add -A" às cegas: confira o que entra
git commit -m "$(cat <<'EOF'
<Iniciativa> <entrega>: <efeito em uma linha>

- o que mudou (banco, funções, app, testes)
- evidência: regressão N/N

Co-Authored-By: <modelo> <noreply@…>
EOF
)"
gh auth switch --user raulmf12 && git push origin main
```

Nunca entram no commit: `.env*`, `test-results/`, `playwright-report/`, `e2e/.auth/`, arquivos de `~/Downloads`. O `.gitignore` cobre a maior parte, mas confira `git status`.

## 9. Documentar

Para cada entrega, no doc da iniciativa (modelo: `docs/estabilizacao/ENTREGAS.md`):

```markdown
## E<n> — <nome> · implantada em DD/MM/AAAA

| Campo | Informação |
|---|---|
| Banco | migrations + o que fazem |
| Funções | quais, o que mudou |
| App | telas e libs |
| Critérios | IDs do documento atendidos · parciais |
| Evidência | spec(s) N/N + regressão completa N/N (data, duração) |
| Limitações | o que NÃO foi feito ou testado (ex.: publicação real) |
| Retorno | como reverter |

### Nota para o Marcos — o que mudou
1. **<frase de uso>.** *Antes:* … *Agora:* …
```

Se a sessão tem memória persistente (Claude Code: `~/.claude/projects/.../memory/`), atualize o status da iniciativa lá também.

## 10. Relatar

Use o formato de [08-COMUNICACAO](08-COMUNICACAO.md):

1. o que ficou pronto (com evidência);
2. o que o Marcos ou o Raul precisam fazer;
3. o que não foi feito ou testado.

Sem enfeite.

---

## Tarefas longas (regressão de ~40 min, deploys em lote)

- Rode a regressão **em background**, quando a ferramenta permitir, e não fique consultando o log a cada minuto. Espere a notificação ou cheque em intervalos longos.
- `caffeinate -i` (macOS) já está no script: suspensão do Mac no meio da suíte gera dezenas de "fetch failed" falsos.
- Enquanto a regressão roda, só leia e documente. **Não edite `src/`, `supabase/` ou `e2e/`.**
- Muitas falhas de rede ao mesmo tempo ("fetch failed", timeout em todos) = ambiente (sono, rede, Supabase fora). Rode de novo antes de investigar código.
