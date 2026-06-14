-- CreateEnum
CREATE TYPE "KeywordIntent" AS ENUM ('INFORMATIONAL', 'COMMERCIAL', 'TRANSACTIONAL', 'BRAND', 'COMPETITOR');

-- CreateEnum
CREATE TYPE "KeywordStatus" AS ENUM ('PENDING', 'APPROVED', 'ARCHIVED', 'USED');

-- CreateEnum
CREATE TYPE "KeywordSource" AS ENUM ('MANUAL', 'IMPORT', 'AI_SEED');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "monthlyArticleQuota" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "planName" TEXT NOT NULL DEFAULT 'trial';

-- AlterTable
ALTER TABLE "Site" ADD COLUMN     "cmsConfig" JSONB,
ADD COLUMN     "cmsType" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "authSubject" TEXT,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "name" TEXT,
ADD COLUMN     "passwordHash" TEXT;

-- CreateTable
CREATE TABLE "PromptTemplate" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "content" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromptTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptRuntimeBinding" (
    "slotId" TEXT NOT NULL,
    "activeVersion" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromptRuntimeBinding_pkey" PRIMARY KEY ("slotId")
);

-- CreateTable
CREATE TABLE "KeywordEntry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "siteId" TEXT,
    "keyword" TEXT NOT NULL,
    "intent" "KeywordIntent" NOT NULL DEFAULT 'INFORMATIONAL',
    "status" "KeywordStatus" NOT NULL DEFAULT 'PENDING',
    "source" "KeywordSource" NOT NULL DEFAULT 'MANUAL',
    "searchVolume" INTEGER,
    "keywordDifficulty" DOUBLE PRECISION,
    "cpc" DOUBLE PRECISION,
    "businessValueScore" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "contentFitScore" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "priorityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "lastJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KeywordEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PromptTemplate_version_key" ON "PromptTemplate"("version");

-- CreateIndex
CREATE INDEX "PromptTemplate_isActive_idx" ON "PromptTemplate"("isActive");

-- CreateIndex
CREATE INDEX "PromptTemplate_updatedAt_idx" ON "PromptTemplate"("updatedAt");

-- CreateIndex
CREATE INDEX "KeywordEntry_organizationId_projectId_status_idx" ON "KeywordEntry"("organizationId", "projectId", "status");

-- CreateIndex
CREATE INDEX "KeywordEntry_organizationId_projectId_priorityScore_idx" ON "KeywordEntry"("organizationId", "projectId", "priorityScore");

-- CreateIndex
CREATE UNIQUE INDEX "KeywordEntry_projectId_keyword_key" ON "KeywordEntry"("projectId", "keyword");

-- CreateIndex
CREATE UNIQUE INDEX "User_authSubject_key" ON "User"("authSubject");

-- CreateIndex
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");

-- AddForeignKey
ALTER TABLE "KeywordEntry" ADD CONSTRAINT "KeywordEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KeywordEntry" ADD CONSTRAINT "KeywordEntry_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;
