-- 协作评论/指派 + 计费明细 breakdown
ALTER TABLE "CreditUsage" ADD COLUMN IF NOT EXISTS "breakdown" JSONB;

CREATE TABLE IF NOT EXISTS "ArticleJobComment" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "authorUserId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ArticleJobComment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ArticleJobAssignee" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "assignedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ArticleJobAssignee_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ArticleJobAssignee_jobId_userId_key" ON "ArticleJobAssignee"("jobId", "userId");
CREATE INDEX IF NOT EXISTS "ArticleJobComment_organizationId_projectId_jobId_createdAt_idx" ON "ArticleJobComment"("organizationId", "projectId", "jobId", "createdAt");
CREATE INDEX IF NOT EXISTS "ArticleJobAssignee_organizationId_projectId_userId_idx" ON "ArticleJobAssignee"("organizationId", "projectId", "userId");

ALTER TABLE "ArticleJobComment" ADD CONSTRAINT "ArticleJobComment_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ArticleJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ArticleJobAssignee" ADD CONSTRAINT "ArticleJobAssignee_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ArticleJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
