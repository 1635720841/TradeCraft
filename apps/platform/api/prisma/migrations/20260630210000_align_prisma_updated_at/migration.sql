-- Prisma @updatedAt 列不应保留数据库 DEFAULT now()
ALTER TABLE "Organization" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "SubscriptionPlan" ALTER COLUMN "updatedAt" DROP DEFAULT;
