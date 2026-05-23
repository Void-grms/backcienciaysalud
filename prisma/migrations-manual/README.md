# Migraciones manuales

Estos scripts NO son ejecutados por `prisma migrate` porque Prisma no
soporta indices parciales ni indices `gin (... gin_trgm_ops)` declarados desde
`schema.prisma`. Hay dos opciones:

1. **Recomendado**: copia su contenido al final del SQL generado por
   `prisma migrate dev --create-only`, antes de aplicar la migracion.
2. **Alternativa rapida**: aplicalos manualmente despues con `psql`:
   ```powershell
   psql $env:DATABASE_URL -f prisma/migrations-manual/001_trigram_indexes.sql
   ```

Idempotente — todos usan `IF NOT EXISTS`.
