/**
 * 修复本地开发库迁移漂移（不删业务数据）：
 * 1. 清理 _prisma_migrations 中失败/回滚的幽灵记录
 * 2. 可选：仅打印状态，不执行破坏性操作
 *
 * 用法：node scripts/repair-migration-history.mjs
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

try {
  const ghosts = await prisma.$queryRaw`
    SELECT id, migration_name, started_at, rolled_back_at
    FROM _prisma_migrations
    WHERE finished_at IS NULL AND rolled_back_at IS NOT NULL
    ORDER BY started_at
  `;

  if (!ghosts.length) {
    console.log('No failed migration ghost records to clean.');
  } else {
    console.log(`Removing ${ghosts.length} failed migration ghost record(s):`);
    for (const row of ghosts) {
      console.log(`  - ${row.migration_name} (rolled back ${row.rolled_back_at})`);
    }
    const deleted = await prisma.$executeRaw`
      DELETE FROM _prisma_migrations
      WHERE finished_at IS NULL AND rolled_back_at IS NOT NULL
    `;
    console.log(`Deleted ${deleted} row(s).`);
  }

  const status = await prisma.$queryRaw`
    SELECT migration_name, finished_at IS NOT NULL AS applied
    FROM _prisma_migrations
    WHERE migration_name LIKE '202606301%'
    ORDER BY migration_name, finished_at NULLS LAST
  `;
  console.log('\nRecent 202606301* migration records:');
  for (const row of status) {
    console.log(`  ${row.migration_name}: ${row.applied ? 'applied' : 'incomplete'}`);
  }
} finally {
  await prisma.$disconnect();
}
