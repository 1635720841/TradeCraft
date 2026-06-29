-- ArticleJobActivity 任务时间线

CREATE TABLE "ArticleJobActivity" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArticleJobActivity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ArticleJobActivity_organizationId_projectId_jobId_createdAt_idx"
    ON "ArticleJobActivity"("organizationId", "projectId", "jobId", "createdAt");

ALTER TABLE "ArticleJobActivity"
    ADD CONSTRAINT "ArticleJobActivity_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "ArticleJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
