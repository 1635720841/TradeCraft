import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

try {
  const migrations = await prisma.$queryRaw`
    SELECT migration_name, finished_at, rolled_back_at
    FROM _prisma_migrations
    ORDER BY finished_at
  `;
  console.log('=== _prisma_migrations ===');
  for (const row of migrations) {
    console.log(row.migration_name, row.finished_at ? 'applied' : 'pending', row.rolled_back_at ?? '');
  }

  const deletedAtCols = await prisma.$queryRaw`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'deletedAt'
    ORDER BY table_name
  `;
  console.log('\n=== deletedAt columns ===');
  console.log(deletedAtCols);

  const tables = await prisma.$queryRaw`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('ArticleQuotaTopUp', 'PlatformGscCredential', 'CreditUsage')
    ORDER BY table_name
  `;
  console.log('\n=== key tables ===');
  console.log(tables);

  const creditUnique = await prisma.$queryRaw`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public' AND indexname LIKE '%CreditUsage%'
  `;
  console.log('\n=== CreditUsage indexes ===');
  console.log(creditUnique);
} finally {
  await prisma.$disconnect();
}
