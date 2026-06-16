-- P1: contentForm on ArticleJob, primaryKeyword on SitePage, pillarKeywordId on KeywordCluster

CREATE TYPE "ArticleContentForm" AS ENUM ('ARTICLE', 'PRODUCT_ENHANCED', 'FAQ_PAGE');

ALTER TABLE "ArticleJob" ADD COLUMN "contentForm" "ArticleContentForm" NOT NULL DEFAULT 'ARTICLE';

ALTER TABLE "SitePage" ADD COLUMN "primaryKeyword" TEXT;

ALTER TABLE "KeywordCluster" ADD COLUMN "pillarKeywordId" TEXT;

ALTER TABLE "KeywordCluster" ADD CONSTRAINT "KeywordCluster_pillarKeywordId_fkey"
  FOREIGN KEY ("pillarKeywordId") REFERENCES "KeywordEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "KeywordCluster_pillarKeywordId_idx" ON "KeywordCluster"("pillarKeywordId");
