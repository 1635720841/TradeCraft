-- Enterprise UX pack: robot channels, notification preferences

CREATE TABLE "OrgRobotChannel" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "channelType" TEXT NOT NULL,
    "webhookUrl" VARCHAR(500) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "events" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OrgRobotChannel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserNotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "mutedTypes" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserNotificationPreference_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrgRobotChannel_organizationId_isActive_idx" ON "OrgRobotChannel"("organizationId", "isActive");

CREATE UNIQUE INDEX "UserNotificationPreference_userId_organizationId_key" ON "UserNotificationPreference"("userId", "organizationId");
CREATE INDEX "UserNotificationPreference_organizationId_userId_idx" ON "UserNotificationPreference"("organizationId", "userId");
