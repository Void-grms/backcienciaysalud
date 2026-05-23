-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'reference_user', 'patient');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'blocked', 'pending_password');

-- CreateEnum
CREATE TYPE "ResultType" AS ENUM ('numeric', 'text', 'qualitative', 'observation');

-- CreateEnum
CREATE TYPE "CatalogStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('M', 'F', 'A');

-- CreateEnum
CREATE TYPE "PhysiologicalState" AS ENUM ('none', 'pregnancy', 'lactation');

-- CreateEnum
CREATE TYPE "ImportJobStatus" AS ENUM ('pending_confirmation', 'confirmed', 'failed', 'expired');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('DNI', 'CE', 'PAS');

-- CreateEnum
CREATE TYPE "ReferenceStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "OrderState" AS ENUM ('draft', 'in_progress', 'validated', 'delivered', 'amended', 'cancelled');

-- CreateEnum
CREATE TYPE "ResultFlag" AS ENUM ('normal', 'high', 'low', 'critical_high', 'critical_low', 'abnormal', 'none');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('pending', 'sent', 'failed', 'skipped', 'no_recipient');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('email', 'whatsapp');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(180),
    "document_number" VARCHAR(20),
    "password_hash" VARCHAR(255) NOT NULL,
    "role" "UserRole" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ,
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "full_name" VARCHAR(180),
    "reference_id" UUID,
    "patient_id" UUID,
    "last_login_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patients" (
    "id" UUID NOT NULL,
    "document_type" "DocumentType" NOT NULL,
    "document_number" VARCHAR(20) NOT NULL,
    "first_name" VARCHAR(80) NOT NULL,
    "last_name" VARCHAR(80) NOT NULL,
    "birth_date" DATE,
    "sex" "Sex" NOT NULL DEFAULT 'A',
    "phone" VARCHAR(20),
    "email" VARCHAR(180),
    "address" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referring_entities" (
    "id" UUID NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "tax_id" VARCHAR(20),
    "contact_name" VARCHAR(120),
    "contact_email" VARCHAR(180),
    "contact_phone" VARCHAR(20),
    "address" TEXT,
    "notes" TEXT,
    "status" "ReferenceStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "referring_entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "jti" VARCHAR(64) NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "user_agent" TEXT,
    "ip" VARCHAR(64),
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "professionals" (
    "id" UUID NOT NULL,
    "full_name" VARCHAR(180) NOT NULL,
    "professional_title" VARCHAR(80),
    "license_number" VARCHAR(40),
    "signature_storage_key" VARCHAR(255),
    "status" "CatalogStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "professionals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "color" VARCHAR(7) NOT NULL DEFAULT '#0F766E',
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "default_professional_id" UUID,
    "status" "CatalogStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tests" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "short_name" VARCHAR(80),
    "category_id" UUID NOT NULL,
    "result_type" "ResultType" NOT NULL,
    "unit" VARCHAR(40),
    "method" VARCHAR(120),
    "decimals" SMALLINT NOT NULL DEFAULT 2,
    "min_critical" DECIMAL(12,4),
    "max_critical" DECIMAL(12,4),
    "reference_text" TEXT,
    "professional_id" UUID,
    "status" "CatalogStatus" NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "tests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_options" (
    "id" UUID NOT NULL,
    "test_id" UUID NOT NULL,
    "value" VARCHAR(80) NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reference_ranges" (
    "id" UUID NOT NULL,
    "test_id" UUID NOT NULL,
    "sex" "Sex" NOT NULL DEFAULT 'A',
    "age_min_days" INTEGER,
    "age_max_days" INTEGER,
    "physiological_state" "PhysiologicalState",
    "value_min" DECIMAL(12,4),
    "value_max" DECIMAL(12,4),
    "qualitative_expected" VARCHAR(80),
    "display_text" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "effective_from" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" DATE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "reference_ranges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tests_history" (
    "id" UUID NOT NULL,
    "test_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "short_name" VARCHAR(80),
    "category_id" UUID NOT NULL,
    "result_type" "ResultType" NOT NULL,
    "unit" VARCHAR(40),
    "method" VARCHAR(120),
    "decimals" SMALLINT NOT NULL,
    "min_critical" DECIMAL(12,4),
    "max_critical" DECIMAL(12,4),
    "reference_text" TEXT,
    "professional_id" UUID,
    "status" "CatalogStatus" NOT NULL,
    "valid_from" TIMESTAMPTZ NOT NULL,
    "valid_to" TIMESTAMPTZ,
    "changed_by_user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tests_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reference_ranges_history" (
    "id" UUID NOT NULL,
    "range_id" UUID NOT NULL,
    "test_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "sex" "Sex" NOT NULL,
    "age_min_days" INTEGER,
    "age_max_days" INTEGER,
    "physiological_state" "PhysiologicalState",
    "value_min" DECIMAL(12,4),
    "value_max" DECIMAL(12,4),
    "qualitative_expected" VARCHAR(80),
    "display_text" TEXT,
    "priority" INTEGER NOT NULL,
    "valid_from" TIMESTAMPTZ NOT NULL,
    "valid_to" TIMESTAMPTZ,
    "changed_by_user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reference_ranges_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "panels" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "description" TEXT,
    "default_professional_id" UUID,
    "status" "CatalogStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "panels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "panel_tests" (
    "panel_id" UUID NOT NULL,
    "test_id" UUID NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "panel_tests_pkey" PRIMARY KEY ("panel_id","test_id")
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" UUID NOT NULL,
    "type" VARCHAR(40) NOT NULL,
    "status" "ImportJobStatus" NOT NULL DEFAULT 'pending_confirmation',
    "created_by_user_id" UUID,
    "filename" VARCHAR(255),
    "summary" JSONB NOT NULL,
    "payload" JSONB NOT NULL,
    "errors" JSONB NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "confirmed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "patient_id" UUID NOT NULL,
    "reference_id" UUID,
    "requesting_doctor" VARCHAR(180),
    "clinical_info" TEXT,
    "sample_taken_at" TIMESTAMPTZ,
    "state" "OrderState" NOT NULL DEFAULT 'draft',
    "state_reason" TEXT,
    "validated_at" TIMESTAMPTZ,
    "delivered_at" TIMESTAMPTZ,
    "cancelled_at" TIMESTAMPTZ,
    "previous_order_id" UUID,
    "created_by_user_id" UUID,
    "validated_by_user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "test_id" UUID NOT NULL,
    "test_version" INTEGER NOT NULL,
    "panel_id" UUID,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "results" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "test_id" UUID NOT NULL,
    "value_numeric" DECIMAL(12,4),
    "value_text" TEXT,
    "applied_range_id" UUID,
    "flag" "ResultFlag" NOT NULL DEFAULT 'none',
    "observation" TEXT,
    "entered_by_user_id" UUID,
    "entered_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_events" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "from_state" "OrderState" NOT NULL,
    "to_state" "OrderState" NOT NULL,
    "actor_user_id" UUID,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_sequences" (
    "year" INTEGER NOT NULL,
    "last_number" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "order_sequences_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "pdf_storage_key" VARCHAR(255) NOT NULL,
    "hash_sha256" VARCHAR(64) NOT NULL,
    "generated_by_user_id" UUID,
    "generated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_tokens" (
    "id" UUID NOT NULL,
    "report_id" UUID NOT NULL,
    "token" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications_log" (
    "id" UUID NOT NULL,
    "order_id" UUID,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'email',
    "recipient" VARCHAR(180) NOT NULL,
    "template" VARCHAR(80) NOT NULL,
    "subject" VARCHAR(255),
    "status" "NotificationStatus" NOT NULL DEFAULT 'pending',
    "provider_id" VARCHAR(120),
    "error_message" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "notifications_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_config" (
    "id" UUID NOT NULL,
    "commercial_name" VARCHAR(180) NOT NULL,
    "tax_id" VARCHAR(20),
    "address" TEXT,
    "phone" VARCHAR(40),
    "email" VARCHAR(180),
    "logo_storage_key" VARCHAR(255),
    "primary_color" VARCHAR(7) NOT NULL DEFAULT '#0F766E',
    "header_html" TEXT,
    "footer_html" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "lab_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_document_number_key" ON "users"("document_number");

-- CreateIndex
CREATE INDEX "users_role_status_idx" ON "users"("role", "status");

-- CreateIndex
CREATE INDEX "users_reference_id_idx" ON "users"("reference_id");

-- CreateIndex
CREATE INDEX "users_patient_id_idx" ON "users"("patient_id");

-- CreateIndex
CREATE UNIQUE INDEX "patients_document_type_document_number_key" ON "patients"("document_type", "document_number");

-- CreateIndex
CREATE INDEX "referring_entities_status_idx" ON "referring_entities"("status");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_jti_key" ON "refresh_tokens"("jti");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE INDEX "tests_category_id_idx" ON "tests"("category_id");

-- CreateIndex
CREATE INDEX "tests_status_idx" ON "tests"("status");

-- CreateIndex
CREATE UNIQUE INDEX "test_options_test_id_value_key" ON "test_options"("test_id", "value");

-- CreateIndex
CREATE INDEX "reference_ranges_test_id_effective_to_idx" ON "reference_ranges"("test_id", "effective_to");

-- CreateIndex
CREATE INDEX "tests_history_test_id_version_idx" ON "tests_history"("test_id", "version");

-- CreateIndex
CREATE INDEX "reference_ranges_history_range_id_version_idx" ON "reference_ranges_history"("range_id", "version");

-- CreateIndex
CREATE INDEX "reference_ranges_history_test_id_idx" ON "reference_ranges_history"("test_id");

-- CreateIndex
CREATE INDEX "panels_status_idx" ON "panels"("status");

-- CreateIndex
CREATE INDEX "panel_tests_test_id_idx" ON "panel_tests"("test_id");

-- CreateIndex
CREATE INDEX "import_jobs_status_idx" ON "import_jobs"("status");

-- CreateIndex
CREATE INDEX "import_jobs_created_by_user_id_idx" ON "import_jobs"("created_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_code_key" ON "orders"("code");

-- CreateIndex
CREATE INDEX "orders_patient_id_state_idx" ON "orders"("patient_id", "state");

-- CreateIndex
CREATE INDEX "orders_reference_id_state_idx" ON "orders"("reference_id", "state");

-- CreateIndex
CREATE INDEX "orders_state_delivered_at_idx" ON "orders"("state", "delivered_at");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_items_order_id_test_id_key" ON "order_items"("order_id", "test_id");

-- CreateIndex
CREATE UNIQUE INDEX "results_order_item_id_key" ON "results"("order_item_id");

-- CreateIndex
CREATE INDEX "results_order_id_idx" ON "results"("order_id");

-- CreateIndex
CREATE INDEX "results_test_id_idx" ON "results"("test_id");

-- CreateIndex
CREATE INDEX "order_events_order_id_created_at_idx" ON "order_events"("order_id", "created_at");

-- CreateIndex
CREATE INDEX "reports_order_id_idx" ON "reports"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "reports_order_id_version_key" ON "reports"("order_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "report_tokens_token_key" ON "report_tokens"("token");

-- CreateIndex
CREATE INDEX "report_tokens_report_id_idx" ON "report_tokens"("report_id");

-- CreateIndex
CREATE INDEX "notifications_log_order_id_idx" ON "notifications_log"("order_id");

-- CreateIndex
CREATE INDEX "notifications_log_status_created_at_idx" ON "notifications_log"("status", "created_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_reference_id_fkey" FOREIGN KEY ("reference_id") REFERENCES "referring_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_default_professional_id_fkey" FOREIGN KEY ("default_professional_id") REFERENCES "professionals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tests" ADD CONSTRAINT "tests_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tests" ADD CONSTRAINT "tests_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_options" ADD CONSTRAINT "test_options_test_id_fkey" FOREIGN KEY ("test_id") REFERENCES "tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reference_ranges" ADD CONSTRAINT "reference_ranges_test_id_fkey" FOREIGN KEY ("test_id") REFERENCES "tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "panel_tests" ADD CONSTRAINT "panel_tests_panel_id_fkey" FOREIGN KEY ("panel_id") REFERENCES "panels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "panel_tests" ADD CONSTRAINT "panel_tests_test_id_fkey" FOREIGN KEY ("test_id") REFERENCES "tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_reference_id_fkey" FOREIGN KEY ("reference_id") REFERENCES "referring_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_previous_order_id_fkey" FOREIGN KEY ("previous_order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_validated_by_user_id_fkey" FOREIGN KEY ("validated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_test_id_fkey" FOREIGN KEY ("test_id") REFERENCES "tests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_panel_id_fkey" FOREIGN KEY ("panel_id") REFERENCES "panels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "results" ADD CONSTRAINT "results_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "results" ADD CONSTRAINT "results_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "results" ADD CONSTRAINT "results_test_id_fkey" FOREIGN KEY ("test_id") REFERENCES "tests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "results" ADD CONSTRAINT "results_applied_range_id_fkey" FOREIGN KEY ("applied_range_id") REFERENCES "reference_ranges"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "results" ADD CONSTRAINT "results_entered_by_user_id_fkey" FOREIGN KEY ("entered_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_tokens" ADD CONSTRAINT "report_tokens_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
