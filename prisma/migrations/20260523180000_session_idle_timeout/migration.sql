-- Idle timeout & IP tracking en refresh_tokens.
-- last_activity_at: defaultea a NOW(); en tokens existentes se rellena con created_at
--                   para no invalidarlos masivamente al deployar la migracion.
-- last_ip: nullable, se llena en el primer refresh/heartbeat post-migracion.

ALTER TABLE "refresh_tokens"
  ADD COLUMN "last_activity_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN "last_ip" VARCHAR(64);

-- Backfill: usar created_at para no invalidar sesiones vigentes al desplegar.
UPDATE "refresh_tokens" SET "last_activity_at" = "created_at";
