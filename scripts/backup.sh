#!/usr/bin/env bash
# Backup manual de la DB de produccion. Escribe un .sql.gz timestamped en
# ./backups/ y rota los archivos de mas de 14 dias.
#
# Uso (Linux/macOS):
#   ./scripts/backup.sh            # usa DATABASE_URL del .env del proyecto
#   ./scripts/backup.sh staging    # usa .env.staging
#
# Requiere pg_dump en el PATH. En Windows con WSL, ejecutar desde WSL.

set -euo pipefail

ENV_FILE="${1:-.env}"
if [ ! -f "$ENV_FILE" ]; then
  echo "No existe $ENV_FILE — copia .env.example y completa DATABASE_URL"
  exit 1
fi

# Cargamos solo DATABASE_URL para no contaminar el shell con todo el .env.
DATABASE_URL=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d '=' -f2- | tr -d '"' | tr -d "'")
if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL no definida en $ENV_FILE"
  exit 1
fi

BACKUP_DIR="$(dirname "$0")/../backups"
mkdir -p "$BACKUP_DIR"

STAMP=$(date +%Y%m%d_%H%M%S)
OUT="$BACKUP_DIR/lab_${STAMP}.sql.gz"

echo "Generando backup en $OUT..."
pg_dump "$DATABASE_URL" | gzip > "$OUT"

SIZE=$(du -h "$OUT" | cut -f1)
echo "OK ($SIZE)"

# Rotacion: borrar backups mas viejos que 14 dias.
DELETED=$(find "$BACKUP_DIR" -name '*.sql.gz' -mtime +14 -print -delete | wc -l)
if [ "$DELETED" -gt 0 ]; then
  echo "Rotados $DELETED backups viejos (>14 dias)"
fi
