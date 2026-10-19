#!/bin/bash
# Regressão completa (todos os E2E + unitários, ~40 min) com a máquina acordada e log em arquivo.
#   scripts/regressao.sh                       → suíte inteira (obrigatória antes de push que mexe em src/, supabase/ ou e2e/)
#   scripts/regressao.sh e2e/f26-navegacao-e5.spec.ts   → só os specs indicados (iteração)
# Saída na tela: só o resumo e as falhas. Log completo: $LOG (padrão /tmp/regressao-<data>.log).
# Nunca rode duas suítes ao mesmo tempo: há um único usuário de teste e o cleanup de uma apaga os dados da outra.
set -uo pipefail
cd "$(dirname "$0")/.."
LOG="${LOG:-/tmp/regressao-$(date +%Y%m%d-%H%M).log}"
if pgrep -f "playwright test" >/dev/null; then echo "Já existe uma suíte rodando — espere ela terminar." >&2; exit 2; fi
KEEP=(); command -v caffeinate >/dev/null && KEEP=(caffeinate -i)
echo "Rodando… log em $LOG"
"${KEEP[@]}" npx playwright test --project=e2e --reporter=line "$@" >"$LOG" 2>&1
RC=$?
grep -E "^\s+[0-9]+\) |✘|Error:|expect\(" "$LOG" | head -60
tail -6 "$LOG"
echo "Log completo: $LOG"
exit $RC
