-- Umbrales criticos (panico) por rango referencial.
-- Antes vivian como un par global en tests.min_critical/max_critical y no
-- variaban por paciente. Se movieron a reference_ranges para que el flagger
-- los resuelva via el rango aplicable (sexo, edad, estado fisiologico).
--
-- Backfill: copiamos los valores existentes de cada test a TODOS sus rangos
-- vigentes para no perder el comportamiento de critico tras desplegar. El
-- admin puede afinar por rango despues. Los rangos historicos (effective_to)
-- no se tocan — solo aplican a resultados ya emitidos.

ALTER TABLE "reference_ranges"
  ADD COLUMN "critical_min" DECIMAL(12, 4),
  ADD COLUMN "critical_max" DECIMAL(12, 4);

ALTER TABLE "reference_ranges_history"
  ADD COLUMN "critical_min" DECIMAL(12, 4),
  ADD COLUMN "critical_max" DECIMAL(12, 4);

UPDATE "reference_ranges" r
SET
  "critical_min" = t."min_critical",
  "critical_max" = t."max_critical"
FROM "tests" t
WHERE
  r."test_id" = t."id"
  AND r."effective_to" IS NULL
  AND (t."min_critical" IS NOT NULL OR t."max_critical" IS NOT NULL);
