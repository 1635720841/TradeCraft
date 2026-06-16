-- CreateTable
CREATE TABLE "KeywordCluster" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KeywordCluster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteGscConnection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "propertyUrl" TEXT,
    "refreshToken" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "summaryData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteGscConnection_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "KeywordEntry" ADD COLUMN "clusterId" TEXT;

-- CreateIndex
CREATE INDEX "KeywordCluster_organizationId_projectId_idx" ON "KeywordCluster"("organizationId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "KeywordCluster_projectId_name_key" ON "KeywordCluster"("projectId", "name");

-- CreateIndex
CREATE INDEX "KeywordEntry_organizationId_projectId_clusterId_idx" ON "KeywordEntry"("organizationId", "projectId", "clusterId");

-- CreateIndex
CREATE UNIQUE INDEX "SiteGscConnection_siteId_key" ON "SiteGscConnection"("siteId");

-- CreateIndex
CREATE INDEX "SiteGscConnection_organizationId_idx" ON "SiteGscConnection"("organizationId");

-- AddForeignKey
ALTER TABLE "KeywordCluster" ADD CONSTRAINT "KeywordCluster_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KeywordEntry" ADD CONSTRAINT "KeywordEntry_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "KeywordCluster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteGscConnection" ADD CONSTRAINT "SiteGscConnection_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
