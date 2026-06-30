-- GSC token encryption + remove per-site refresh token copies
ALTER TABLE "PlatformGscCredential" RENAME COLUMN "refreshToken" TO "refreshTokenEnc";
ALTER TABLE "PlatformGscCredential" ADD COLUMN "cachedPropertyCount" INTEGER;
ALTER TABLE "PlatformGscCredential" ADD COLUMN "propertyCountCachedAt" TIMESTAMP(3);

ALTER TABLE "SiteGscConnection" DROP COLUMN "refreshToken";
