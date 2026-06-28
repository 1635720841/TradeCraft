-- 清理租户用户上已废弃的企业级 seo / 续期 额外授权
DELETE FROM "UserPermission" AS up
USING "User" AS u
WHERE up."userId" = u.id
  AND u.role IN ('ADMIN', 'MEMBER')
  AND (
    up."permissionId" LIKE 'seo:%'
    OR up."permissionId" = 'org:billing:manage'
  );
