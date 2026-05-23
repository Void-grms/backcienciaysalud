#!/usr/bin/env bash
# Restore desde un dump .sql.gz generado por backup.sh.
#
# CUIDADO: este script DROPea el schema public y lo recrea. Solo usalo en
# entornos donde realmente quieras pisar los datos.
#
# Uso:
#   ./scripts/restore.sh backups/lab_20260521_120000.sql.gz
#   ./scripts/restore.sh backups/lab_20260521_120000.sql.gz .env.staging

set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "Uso: $0 <archivo.sql.gz> [.env-file]"
  exit 1
fi

DUMP="$1"
ENV_FILE="${2:-.env}"

if [ ! -f "$DUMP" ]; then
  echo "No existe $DUMP"
  exit 1
fi
if [ ! -f "$ENV_FILE" ]; then
  echo "No existe $ENV_FILE"
  exit 1
fi

DATABASE_URL=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d '=' -f2- | tr -d '"' | tr -d "'")
if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL no definida en $ENV_FILE"
  exit 1
fi

read -r -p "Vas a SOBRESCRIBIR la DB de $ENV_FILE con $DUMP. Confirma escribiendo el nombre del archivo: " CONFIRM
if [ "$CONFIRM" != "$(basename "$DUMP")" ]; then
  echo "Cancelado."
  exit 1
fi

echo "Drop + recreate del schema public..."
psql "$DATABASE_URL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

echo "Aplicando dump..."
gunzip -c "$DUMP" | psql "$DATABASE_URL"

echo "Restore completo. Verifica con: psql \"\$DATABASE_URL\" -c '\\dt'"
