-- CreateEnum
CREATE TYPE "MediaAssetSource" AS ENUM ('BFL', 'UPLOAD', 'URL');

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "source" "MediaAssetSource" NOT NULL,
    "sourceMeta" JSONB,
    "contentHash" TEXT,
    "referenceCount" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_storageKey_key" ON "MediaAsset"("storageKey");

-- CreateIndex
CREATE INDEX "MediaAsset_organizationId_projectId_createdAt_idx" ON "MediaAsset"("organizationId", "projectId", "createdAt");

-- CreateIndex
CREATE INDEX "MediaAsset_organizationId_projectId_source_idx" ON "MediaAsset"("organizationId", "projectId", "source");

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
