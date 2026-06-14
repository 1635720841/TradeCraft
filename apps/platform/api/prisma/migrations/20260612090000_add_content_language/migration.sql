-- AlterTable
ALTER TABLE "Site" ADD COLUMN "contentLanguage" TEXT NOT NULL DEFAULT 'en';

-- AlterTable
ALTER TABLE "ArticleJob" ADD COLUMN "contentLanguage" TEXT NOT NULL DEFAULT 'en';
