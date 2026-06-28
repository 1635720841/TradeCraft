-- Enterprise platform: invites, access requests, notifications, billing requests, webhooks

CREATE TYPE "AccessRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "BillingRequestType" AS ENUM ('RENEW', 'UPGRADE', 'TOPUP');
CREATE TYPE "BillingRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "MemberInvite" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "tokenHash" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MemberInvite_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectAccessRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "message" VARCHAR(500),
    "status" "AccessRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectAccessRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserNotification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" VARCHAR(500),
    "linkPath" VARCHAR(500),
    "readAt" TIMESTAMP(3),
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserNotification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BillingChangeRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "type" "BillingRequestType" NOT NULL,
    "targetPlanId" TEXT,
    "topUpAmount" INTEGER,
    "message" VARCHAR(500),
    "status" "BillingRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BillingChangeRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrgWebhook" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "url" VARCHAR(500) NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OrgWebhook_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WebhookDeliveryLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "statusCode" INTEGER,
    "success" BOOLEAN NOT NULL,
    "errorMessage" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebhookDeliveryLog_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "User" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'zh-CN';

CREATE UNIQUE INDEX "MemberInvite_tokenHash_key" ON "MemberInvite"("tokenHash");
CREATE UNIQUE INDEX "MemberInvite_organizationId_email_key" ON "MemberInvite"("organizationId", "email");
CREATE INDEX "MemberInvite_tokenHash_idx" ON "MemberInvite"("tokenHash");
CREATE INDEX "MemberInvite_organizationId_createdAt_idx" ON "MemberInvite"("organizationId", "createdAt");

CREATE INDEX "ProjectAccessRequest_organizationId_projectId_status_idx" ON "ProjectAccessRequest"("organizationId", "projectId", "status");
CREATE INDEX "ProjectAccessRequest_organizationId_status_createdAt_idx" ON "ProjectAccessRequest"("organizationId", "status", "createdAt");

CREATE INDEX "UserNotification_userId_readAt_createdAt_idx" ON "UserNotification"("userId", "readAt", "createdAt");
CREATE INDEX "UserNotification_organizationId_userId_createdAt_idx" ON "UserNotification"("organizationId", "userId", "createdAt");

CREATE INDEX "BillingChangeRequest_organizationId_status_createdAt_idx" ON "BillingChangeRequest"("organizationId", "status", "createdAt");
CREATE INDEX "BillingChangeRequest_status_createdAt_idx" ON "BillingChangeRequest"("status", "createdAt");

CREATE INDEX "OrgWebhook_organizationId_isActive_idx" ON "OrgWebhook"("organizationId", "isActive");

CREATE INDEX "WebhookDeliveryLog_organizationId_webhookId_createdAt_idx" ON "WebhookDeliveryLog"("organizationId", "webhookId", "createdAt");

INSERT INTO "Permission" ("id", "name", "module", "description", "sortOrder", "createdAt")
VALUES
  ('org:audit:read', '查看操作审计', 'org', '查看本企业操作日志', 24, NOW()),
  ('org:integration:manage', '管理集成', 'org', '配置 Webhook 等集成', 25, NOW())
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "PlatformMenu" ("id", "title", "routePath", "permissionId", "targetRoles", "sortOrder", "createdAt")
VALUES ('org:audit', '操作审计', '/org/audit', 'org:audit:read', ARRAY['ADMIN']::"Role"[], 14, NOW())
ON CONFLICT ("id") DO NOTHING;
