# Guia para agentes de IA — índice

Guia completo para qualquer agente (Claude Code, Codex, Cursor, Gemini, Copilot…) desenvolver na Hive com o mesmo método, cuidado e economia com que ela foi construída.

**Comece sempre por [`AGENTS.md`](../../AGENTS.md)**, o resumo obrigatório. Depois abra **só** o documento de que a tarefa precisa:

| # | Documento | Abra quando… |
|---|---|---|
| 01 | [CONTEXTO](01-CONTEXTO.md) | Precisar entender o produto, o domínio, o ciclo da peça, os contratos C1–C6, os dados, a IA, o visual ou os crons |
| 02 | [REGRAS](02-REGRAS.md) | Antes da primeira mudança na sessão, e sempre que estiver em dúvida se algo é permitido |
| 03 | [PROCESSO](03-PROCESSO.md) | Começar, retomar ou entregar uma mudança (entender → contrato → plano → implementar → verificar → deploy → regressão → commit → documentar → relatar) |
| 04 | [TESTES](04-TESTES.md) | Rodar a regressão, diagnosticar falha ou escrever teste |
| 05 | [TOKENS](05-TOKENS.md) | Sempre: são as estratégias para gastar menos contexto e tempo |
| 06 | [RECEITAS](06-RECEITAS.md) | Fazer algo comum (migration, função, tela, prontidão, prompt) ou diagnosticar (publicação, aprovação, editor, dado) |
| 07 | [ARMADILHAS](07-ARMADILHAS.md) | Antes de depurar: o bug provavelmente já aconteceu |
| 08 | [COMUNICACAO](08-COMUNICACAO.md) | Escrever relatório, plano, nota para o Marcos, mensagem de UI ou commit |

## Ferramentas de apoio

| Script | Uso |
|---|---|
| `scripts/sql.sh` | SQL em produção pela Management API (`"select …"` ou `-f arquivo.sql`). Para com aviso em caso de 403 |
| `scripts/regressao.sh` | Regressão completa ou specs escolhidos, com `caffeinate`, log em arquivo, saída filtrada e trava contra duas suítes |

## Manter este guia vivo

- Mudou um contrato, um processo ou um comando? Atualize o doc correspondente **no mesmo commit**.
- Pagou um bug não óbvio? Uma entrada em [07-ARMADILHAS](07-ARMADILHAS.md).
- Iniciativa nova? Uma linha na tabela de [01-CONTEXTO §11](01-CONTEXTO.md#11-histórico-de-iniciativas).
- O número de testes da regressão muda com o tempo. O que vale é "todos verdes" (hoje: 174).
