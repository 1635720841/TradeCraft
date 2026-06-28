-- Recreate SubscriptionPlan with correct schema

ALTER TABLE "Organization" DROP CONSTRAINT IF EXISTS "Organization_planId_fkey";
ALTER TABLE "Organization" ALTER COLUMN "planId" DROP NOT NULL;

DROP TABLE IF EXISTS "SubscriptionPlan" CASCADE;

CREATE TABLE "SubscriptionPlan" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "monthlyArticleQuota" INTEGER NOT NULL,
  "billingCycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);

INSERT INTO "SubscriptionPlan" ("id", "name", "monthlyArticleQuota", "billingCycle", "sortOrder")
VALUES
  ('trial', '试用版', 100, 'MONTHLY', 0),
  ('standard', '标准版', 500, 'MONTHLY', 1),
  ('enterprise', '企业版', 2000, 'YEARLY', 2)
ON CONFLICT ("id") DO NOTHING;

UPDATE "Organization" SET "planId" = "planName" WHERE "planId" IS NULL AND "planName" IN ('trial', 'standard', 'enterprise');

ALTER TABLE "Organization"
  ADD CONSTRAINT "Organization_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
