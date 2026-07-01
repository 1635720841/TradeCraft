import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

try {
  const org = await prisma.$queryRaw`
    SELECT column_name, column_default, is_nullable, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Organization'
      AND column_name IN ('planId', 'currentPeriodStart', 'currentPeriodEnd')
    ORDER BY column_name
  `;
  console.log('Organization columns:', org);

  const topUp = await prisma.$queryRaw`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'ArticleQuotaTopUp'
  `;
  console.log('ArticleQuotaTopUp indexes:', topUp);
} finally {
  await prisma.$disconnect();
}
