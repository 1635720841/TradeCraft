-- CreateTable
CREATE TABLE "PlatformGscCredential" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "refreshToken" TEXT NOT NULL,
    "googleEmail" TEXT,
    "connectedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformGscCredential_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "SiteGscConnection" ADD COLUMN "managedByPlatform" BOOLEAN NOT NULL DEFAULT false;
