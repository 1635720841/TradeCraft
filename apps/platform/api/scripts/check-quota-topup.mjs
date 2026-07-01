import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

try {
  const count = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS count FROM "ArticleQuotaTopUp"
  `;
  console.log('ArticleQuotaTopUp rows:', count);

  const cols = await prisma.$queryRaw`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ArticleQuotaTopUp'
    ORDER BY ordinal_position
  `;
  console.log('ArticleQuotaTopUp columns:', cols);
} catch (e) {
  console.error('ArticleQuotaTopUp check failed:', e.message);
} finally {
  await prisma.$disconnect();
}
