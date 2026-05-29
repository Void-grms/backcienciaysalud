-- Limpia rangos referenciales que quedaron con ageMin=0 AND ageMax=0.
-- Esa combinacion no tiene sentido clinico (solo aplicaria al instante 0
-- de vida) y casi siempre fue la huella de un import o una creacion sin
-- elegir limites de edad. Los normalizamos a NULL/NULL = "cualquier edad".

UPDATE "reference_ranges"
SET "age_min_days" = NULL, "age_max_days" = NULL
WHERE "age_min_days" = 0 AND "age_max_days" = 0;
