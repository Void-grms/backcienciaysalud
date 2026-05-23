#!/usr/bin/env bash
# Smoke check post-deploy. Verifica que los endpoints criticos responden y
# que la DB esta poblada con el seed minimo.
#
# Uso:
#   API_URL=https://api.midominio.com ADMIN_EMAIL=admin@... ADMIN_PASSWORD=... ./scripts/post-deploy-check.sh
#
# Exit code != 0 si algo falla -> integrable con CI/Pipeline de release.

set -euo pipefail

API_URL="${API_URL:-http://localhost:3000}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@laboratorio.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Admin123!}"

BASE="$API_URL/api/v1"
say() { printf '\033[1;36m==>\033[0m %s\n' "$1"; }
fail() { printf '\033[1;31mFAIL:\033[0m %s\n' "$1"; exit 1; }

say "1/5 Health"
HEALTH=$(curl -fs "$BASE/health") || fail "health no responde"
echo "$HEALTH" | grep -q '"status":"ok"' || fail "health no devolvio status=ok"

say "2/5 Login admin"
TOKEN=$(curl -fs -X POST "$BASE/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"identifier\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" \
  | python -c "import sys,json;print(json.load(sys.stdin)['accessToken'])") \
  || fail "login admin fallo (verifica seed)"
[ "${#TOKEN}" -gt 50 ] || fail "accessToken sospechoso"

say "3/5 GET /auth/me"
curl -fs "$BASE/auth/me" -H "Authorization: Bearer $TOKEN" > /dev/null || fail "auth/me fallo"

say "4/5 GET /catalog/categories (catalogo poblado)"
COUNT=$(curl -fs "$BASE/catalog/categories" -H "Authorization: Bearer $TOKEN" \
  | python -c "import sys,json;print(json.load(sys.stdin)['total'])")
[ "$COUNT" -gt 0 ] || fail "catalogo vacio (corre db:seed)"

say "5/5 GET /admin/dashboard/overview (kpis)"
curl -fs "$BASE/admin/dashboard/overview" -H "Authorization: Bearer $TOKEN" > /dev/null \
  || fail "dashboard overview fallo"

printf '\n\033[1;32m✔ Smoke check completo.\033[0m  API en %s responde correctamente.\n' "$API_URL"
