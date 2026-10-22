#!/bin/bash
# Consulta/alteração no banco de produção pela Management API do Supabase (sem db push).
#   scripts/sql.sh "select count(*) from user_posts"
#   scripts/sql.sh -f supabase/migrations/20261024000001_publicacao_pacote.sql
# Token: SUPABASE_ACCESS_TOKEN (se definido) ou o da Supabase CLI no keychain do macOS.
# Resposta 403 = esta conta perdeu acesso ao projeto → PARE e peça ao Raul (não contorne).
set -euo pipefail
REF="${SUPABASE_PROJECT_REF:-djlorvdehedcupeykyes}"
TOK="${SUPABASE_ACCESS_TOKEN:-}"
if [ -z "$TOK" ] && [ "$(uname -s)" = "Darwin" ]; then
  TOK=$(security find-generic-password -s "Supabase CLI" -w 2>/dev/null) || TOK=""
fi
if [[ "$TOK" == go-keyring-base64:* ]]; then
  TOK=$(printf '%s' "${TOK#go-keyring-base64:}" | base64 -d)
fi
[ -n "$TOK" ] || { echo "sem token: defina SUPABASE_ACCESS_TOKEN ou rode 'npx supabase login'" >&2; exit 2; }
if [ "${1:-}" = "-f" ]; then SQL=$(cat "$2"); else SQL="${1:?uso: sql.sh \"<sql>\" | sql.sh -f arquivo.sql}"; fi
BODY=$(python3 -c 'import json,sys;print(json.dumps({"query":sys.argv[1]}))' "$SQL")
OUT=$(curl -s -w '\n%{http_code}' -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
  -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" -d "$BODY")
CODE=$(tail -n1 <<<"$OUT"); echo "$OUT" | sed '$d'
[ "$CODE" = "403" ] && { echo "403: sem acesso ao projeto — pare e peça acesso (não contorne)." >&2; exit 3; }
[ "${CODE:0:1}" = "2" ] || exit 1
