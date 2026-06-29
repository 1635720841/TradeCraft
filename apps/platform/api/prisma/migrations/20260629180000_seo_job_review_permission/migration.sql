-- 新增 seo:job:review 权限目录项
INSERT INTO "Permission" ("id", "name", "module", "description", "sortOrder")
VALUES ('seo:job:review', '审核任务', 'seo', '确认大纲与敏感审核', 72)
ON CONFLICT ("id") DO NOTHING;

-- 为已有站点管理员（审核岗）补 review 权限
INSERT INTO "ProjectMemberPermission" ("id", "memberId", "permissionId")
SELECT gen_random_uuid()::text, pm.id, 'seo:job:review'
FROM "ProjectMember" pm
JOIN "Project" p ON p.id = pm."projectId"
WHERE p."projectType" = 'seo-factory'
  AND EXISTS (
    SELECT 1 FROM "ProjectMemberPermission" pmp
    WHERE pmp."memberId" = pm.id AND pmp."permissionId" = 'seo:site:manage'
  )
  AND NOT EXISTS (
    SELECT 1 FROM "ProjectMemberPermission" pmp
    WHERE pmp."memberId" = pm.id AND pmp."permissionId" = 'seo:job:review'
  )
ON CONFLICT DO NOTHING;

-- 审核岗（有 site:manage 且无 keyword:manage）移除 create，避免执行+审核重叠
DELETE FROM "ProjectMemberPermission" pmp
USING "ProjectMember" pm, "Project" p
WHERE pmp."memberId" = pm.id
  AND pm."projectId" = p.id
  AND p."projectType" = 'seo-factory'
  AND pmp."permissionId" = 'seo:job:create'
  AND EXISTS (
    SELECT 1 FROM "ProjectMemberPermission" x
    WHERE x."memberId" = pm.id AND x."permissionId" = 'seo:site:manage'
  )
  AND NOT EXISTS (
    SELECT 1 FROM "ProjectMemberPermission" x
    WHERE x."memberId" = pm.id AND x."permissionId" = 'seo:keyword:manage'
  );
