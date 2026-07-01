-- 对齐历史开发库漂移（幂等；不清空数据）

CREATE TABLE IF NOT EXISTS "ArticleQuotaTopUp" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "note" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArticleQuotaTopUp_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ArticleQuotaTopUp_organizationId_createdAt_idx"
  ON "ArticleQuotaTopUp"("organizationId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "ArticleQuotaTopUp"
    ADD CONSTRAINT "ArticleQuotaTopUp_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Organization" ALTER COLUMN "planId" SET DEFAULT 'trial';

UPDATE "Organization"
SET "currentPeriodStart" = COALESCE("currentPeriodStart", CURRENT_TIMESTAMP)
WHERE "currentPeriodStart" IS NULL;

UPDATE "Organization"
SET "currentPeriodEnd" = COALESCE("currentPeriodEnd", CURRENT_TIMESTAMP + INTERVAL '30 days')
WHERE "currentPeriodEnd" IS NULL;

ALTER TABLE "Organization" ALTER COLUMN "currentPeriodStart" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Organization" ALTER COLUMN "currentPeriodStart" SET NOT NULL;
ALTER TABLE "Organization" ALTER COLUMN "currentPeriodEnd" SET NOT NULL;

ALTER TABLE "RoleMenuGrant" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "UserMenuGrant" ALTER COLUMN "updatedAt" DROP DEFAULT;
