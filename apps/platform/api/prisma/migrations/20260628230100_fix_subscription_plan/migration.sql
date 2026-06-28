-- Fix SubscriptionPlan if created with incomplete schema from partial run

ALTER TABLE "SubscriptionPlan" ADD COLUMN IF NOT EXISTS "monthlyArticleQuota" INTEGER;
ALTER TABLE "SubscriptionPlan" ADD COLUMN IF NOT EXISTS "billingCycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY';
ALTER TABLE "SubscriptionPlan" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SubscriptionPlan" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SubscriptionPlan" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "SubscriptionPlan" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "SubscriptionPlan" SET "monthlyArticleQuota" = 100 WHERE "monthlyArticleQuota" IS NULL;
ALTER TABLE "SubscriptionPlan" ALTER COLUMN "monthlyArticleQuota" SET NOT NULL;
