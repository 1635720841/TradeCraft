-- 软删除字段（幂等，可安全重复执行）
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "ArticleJob" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "KeywordEntry" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "KeywordCluster" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "SitePage" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Project_organizationId_deletedAt_idx" ON "Project"("organizationId", "deletedAt");
CREATE INDEX IF NOT EXISTS "Site_organizationId_projectId_deletedAt_idx" ON "Site"("organizationId", "projectId", "deletedAt");
CREATE INDEX IF NOT EXISTS "ArticleJob_organizationId_projectId_deletedAt_idx" ON "ArticleJob"("organizationId", "projectId", "deletedAt");
CREATE INDEX IF NOT EXISTS "KeywordEntry_organizationId_projectId_deletedAt_idx" ON "KeywordEntry"("organizationId", "projectId", "deletedAt");
CREATE INDEX IF NOT EXISTS "KeywordCluster_organizationId_projectId_deletedAt_idx" ON "KeywordCluster"("organizationId", "projectId", "deletedAt");
CREATE INDEX IF NOT EXISTS "SitePage_organizationId_projectId_deletedAt_idx" ON "SitePage"("organizationId", "projectId", "deletedAt");

-- CreditUsage 防双扣
CREATE UNIQUE INDEX IF NOT EXISTS "CreditUsage_traceId_serviceType_key" ON "CreditUsage"("traceId", "serviceType");

-- 项目访问申请：同一用户同一项目仅一条待审批
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectAccessRequest_projectId_userId_pending_key"
  ON "ProjectAccessRequest"("projectId", "userId")
  WHERE "status" = 'PENDING';
