-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'SDR', 'VIEWER');

-- CreateEnum
CREATE TYPE "PipelineStage" AS ENUM ('NEW', 'SCHEDULED', 'MET', 'QUALIFIED', 'PROPOSED', 'NEGOTIATING', 'FUTURE', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "Temperature" AS ENUM ('COLD', 'WARM', 'HOT');

-- CreateEnum
CREATE TYPE "TagType" AS ENUM ('STAGE', 'ORIGIN', 'TEMP', 'ACTION', 'SYNC');

-- CreateEnum
CREATE TYPE "ActionStatus" AS ENUM ('TRIGGERED', 'COMPLETED', 'FAILED', 'NEEDS_HUMAN');

-- CreateEnum
CREATE TYPE "SyncDirection" AS ENUM ('TO_AFRUS', 'FROM_AFRUS');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'SYNCED', 'FAILED');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "afrus_org_id" TEXT NOT NULL,
    "afrus_api_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "email" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "afrus_lead_id" TEXT,
    "stage" "PipelineStage" NOT NULL DEFAULT 'NEW',
    "temperature" "Temperature" NOT NULL DEFAULT 'COLD',
    "first_name" TEXT,
    "last_name" TEXT,
    "phone" TEXT,
    "phone2" TEXT,
    "need_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "budget_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "urgency_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "deal_value" DECIMAL(65,30),
    "assigned_to_id" TEXT,
    "scheduled_at" TIMESTAMP(3),
    "met_at" TIMESTAMP(3),
    "qualified_at" TIMESTAMP(3),
    "proposed_at" TIMESTAMP(3),
    "negotiating_since" TIMESTAMP(3),
    "won_at" TIMESTAMP(3),
    "deal_value_won" DECIMAL(65,30),
    "lost_at" TIMESTAMP(3),
    "next_contact_date" TIMESTAMP(3),
    "reactivated_at" TIMESTAMP(3),
    "scheduled_by_id" TEXT,
    "met_by_id" TEXT,
    "qualified_by_id" TEXT,
    "proposed_by_id" TEXT,
    "negotiating_by_id" TEXT,
    "won_by_id" TEXT,
    "lost_by_id" TEXT,
    "origin_id" TEXT,
    "stage_entered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("email")
);

-- CreateTable
CREATE TABLE "origins" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "origins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "lead_email" TEXT NOT NULL,
    "tagType" "TagType" NOT NULL,
    "tag_value" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lost_reasons" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lost_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_tags" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "tag_value" TEXT NOT NULL,
    "afrus_tag_name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stage_transition_log" (
    "id" TEXT NOT NULL,
    "lead_email" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "from_stage" TEXT,
    "to_stage" TEXT NOT NULL,
    "triggered_by_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stage_transition_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "action_tag_log" (
    "id" TEXT NOT NULL,
    "lead_email" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "action_tag" TEXT NOT NULL,
    "alma_sequence" TEXT,
    "status" "ActionStatus" NOT NULL,
    "alma_response" JSONB,
    "triggered_by_id" TEXT NOT NULL,
    "triggered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "action_tag_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_log" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "lead_email" TEXT NOT NULL,
    "direction" "SyncDirection" NOT NULL,
    "status" "SyncStatus" NOT NULL,
    "payload" JSONB,
    "error_message" TEXT,
    "synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_afrus_org_id_key" ON "organizations"("afrus_org_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_organization_id_idx" ON "users"("organization_id");

-- CreateIndex
CREATE INDEX "leads_organization_id_idx" ON "leads"("organization_id");

-- CreateIndex
CREATE INDEX "leads_stage_idx" ON "leads"("stage");

-- CreateIndex
CREATE INDEX "leads_temperature_idx" ON "leads"("temperature");

-- CreateIndex
CREATE INDEX "leads_organization_id_stage_idx" ON "leads"("organization_id", "stage");

-- CreateIndex
CREATE INDEX "leads_assigned_to_id_idx" ON "leads"("assigned_to_id");

-- CreateIndex
CREATE UNIQUE INDEX "origins_organization_id_name_key" ON "origins"("organization_id", "name");

-- CreateIndex
CREATE INDEX "tags_organization_id_idx" ON "tags"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "tags_lead_email_organization_id_tagType_key" ON "tags"("lead_email", "organization_id", "tagType");

-- CreateIndex
CREATE UNIQUE INDEX "lost_reasons_organization_id_reason_key" ON "lost_reasons"("organization_id", "reason");

-- CreateIndex
CREATE UNIQUE INDEX "sync_tags_organization_id_tag_value_key" ON "sync_tags"("organization_id", "tag_value");

-- CreateIndex
CREATE INDEX "stage_transition_log_lead_email_idx" ON "stage_transition_log"("lead_email");

-- CreateIndex
CREATE INDEX "stage_transition_log_organization_id_idx" ON "stage_transition_log"("organization_id");

-- CreateIndex
CREATE INDEX "stage_transition_log_created_at_idx" ON "stage_transition_log"("created_at");

-- CreateIndex
CREATE INDEX "action_tag_log_lead_email_idx" ON "action_tag_log"("lead_email");

-- CreateIndex
CREATE INDEX "action_tag_log_organization_id_idx" ON "action_tag_log"("organization_id");

-- CreateIndex
CREATE INDEX "action_tag_log_status_idx" ON "action_tag_log"("status");

-- CreateIndex
CREATE INDEX "sync_log_organization_id_idx" ON "sync_log"("organization_id");

-- CreateIndex
CREATE INDEX "sync_log_lead_email_idx" ON "sync_log"("lead_email");

-- CreateIndex
CREATE INDEX "sync_log_status_idx" ON "sync_log"("status");

-- CreateIndex
CREATE INDEX "sync_log_created_at_idx" ON "sync_log"("created_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_origin_id_fkey" FOREIGN KEY ("origin_id") REFERENCES "origins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_scheduled_by_id_fkey" FOREIGN KEY ("scheduled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_met_by_id_fkey" FOREIGN KEY ("met_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_qualified_by_id_fkey" FOREIGN KEY ("qualified_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_proposed_by_id_fkey" FOREIGN KEY ("proposed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_negotiating_by_id_fkey" FOREIGN KEY ("negotiating_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_won_by_id_fkey" FOREIGN KEY ("won_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_lost_by_id_fkey" FOREIGN KEY ("lost_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "origins" ADD CONSTRAINT "origins_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_lead_email_fkey" FOREIGN KEY ("lead_email") REFERENCES "leads"("email") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lost_reasons" ADD CONSTRAINT "lost_reasons_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_tags" ADD CONSTRAINT "sync_tags_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_transition_log" ADD CONSTRAINT "stage_transition_log_lead_email_fkey" FOREIGN KEY ("lead_email") REFERENCES "leads"("email") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_transition_log" ADD CONSTRAINT "stage_transition_log_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_transition_log" ADD CONSTRAINT "stage_transition_log_triggered_by_id_fkey" FOREIGN KEY ("triggered_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_tag_log" ADD CONSTRAINT "action_tag_log_lead_email_fkey" FOREIGN KEY ("lead_email") REFERENCES "leads"("email") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_tag_log" ADD CONSTRAINT "action_tag_log_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_tag_log" ADD CONSTRAINT "action_tag_log_triggered_by_id_fkey" FOREIGN KEY ("triggered_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_log" ADD CONSTRAINT "sync_log_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_log" ADD CONSTRAINT "sync_log_lead_email_fkey" FOREIGN KEY ("lead_email") REFERENCES "leads"("email") ON DELETE CASCADE ON UPDATE CASCADE;

