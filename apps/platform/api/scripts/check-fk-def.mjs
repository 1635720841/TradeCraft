import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

try {
  const fks = await prisma.$queryRaw`
    SELECT conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid = '"ArticleQuotaTopUp"'::regclass AND contype = 'f'
  `;
  console.log(fks);
} finally {
  await prisma.$disconnect();
}
