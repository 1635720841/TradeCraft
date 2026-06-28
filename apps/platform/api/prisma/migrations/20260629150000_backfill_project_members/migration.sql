-- 为尚无成员的历史项目回填 ProjectMember（企业 ADMIN→OWNER，MEMBER→EDITOR）
INSERT INTO "ProjectMember" ("id", "projectId", "userId", "role", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  p.id,
  u.id,
  CASE WHEN u.role = 'ADMIN' THEN 'OWNER'::"ProjectMemberRole" ELSE 'EDITOR'::"ProjectMemberRole" END,
  NOW(),
  NOW()
FROM "Project" p
INNER JOIN "User" u ON u."organizationId" = p."organizationId"
WHERE u.role IN ('ADMIN', 'MEMBER')
  AND NOT EXISTS (
    SELECT 1 FROM "ProjectMember" pm WHERE pm."projectId" = p.id
  )
ON CONFLICT ("projectId", "userId") DO NOTHING;
