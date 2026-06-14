-- CreateEnum
CREATE TYPE "SitePageType" AS ENUM ('PRODUCT', 'SERVICE', 'SOLUTION', 'BLOG', 'PAGE');

-- CreateTable
CREATE TABLE "SitePage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pageType" "SitePageType" NOT NULL DEFAULT 'PAGE',
    "businessValue" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "lastUpdated" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'sitemap',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SitePage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SitePage_organizationId_projectId_siteId_idx" ON "SitePage"("organizationId", "projectId", "siteId");

-- CreateIndex
CREATE UNIQUE INDEX "SitePage_siteId_url_key" ON "SitePage"("siteId", "url");

-- AddForeignKey
ALTER TABLE "SitePage" ADD CONSTRAINT "SitePage_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
