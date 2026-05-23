-- Indices opcionales para el catalogo y paciente (Sprints 2 y 4).
-- Postgres requiere las extensiones pg_trgm y unaccent ya creadas por la
-- migracion inicial de Prisma (declaradas en schema.prisma).

-- Funcion wrapper IMMUTABLE de `unaccent` (la version stock no es immutable
-- y por eso no puede usarse en indices). Definida ANTES de los indices que
-- la usan.
CREATE OR REPLACE FUNCTION immutable_unaccent(text)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
  AS $$ SELECT public.unaccent('public.unaccent', $1) $$;

-- Codigo unico solo entre pruebas NO eliminadas (soft delete).
CREATE UNIQUE INDEX IF NOT EXISTS uq_tests_code_active
  ON tests (code)
  WHERE deleted_at IS NULL;

-- Mismo criterio para paneles.
CREATE UNIQUE INDEX IF NOT EXISTS uq_panels_code_active
  ON panels (code)
  WHERE deleted_at IS NULL;

-- Tax id unico entre referencias activas (cuando no es NULL).
CREATE UNIQUE INDEX IF NOT EXISTS uq_referring_entities_tax_id
  ON referring_entities (tax_id)
  WHERE tax_id IS NOT NULL AND deleted_at IS NULL;

-- Busqueda por nombre del paciente (combinado nombre + apellido).
CREATE INDEX IF NOT EXISTS idx_patients_name_trgm
  ON patients
  USING gin (lower(immutable_unaccent(first_name || ' ' || last_name)) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_patients_document
  ON patients (document_type, document_number);

-- Busqueda por similitud sobre el nombre de la prueba/categoria, ignorando tildes.
CREATE INDEX IF NOT EXISTS idx_tests_name_trgm
  ON tests USING gin (lower(immutable_unaccent(name)) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_categories_name_trgm
  ON categories USING gin (lower(immutable_unaccent(name)) gin_trgm_ops);
