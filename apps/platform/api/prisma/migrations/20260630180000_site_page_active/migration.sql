-- 页面库：标记 sitemap 已下线页面，不参与内链匹配
ALTER TABLE "SitePage" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "SitePage_siteId_active_idx" ON "SitePage"("siteId", "active");
