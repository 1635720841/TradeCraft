-- CreateIndex
CREATE INDEX "MediaAsset_organizationId_projectId_contentHash_idx" ON "MediaAsset"("organizationId", "projectId", "contentHash");
