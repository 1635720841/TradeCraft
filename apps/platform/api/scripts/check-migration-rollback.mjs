import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

try {
  const rows = await prisma.$queryRaw`
    SELECT migration_name, started_at, finished_at, rolled_back_at, logs
    FROM _prisma_migrations
    WHERE rolled_back_at IS NOT NULL OR finished_at IS NULL
    ORDER BY started_at
  `;
  console.log(JSON.stringify(rows, null, 2));

  const pending = await prisma.$queryRaw`
    SELECT migration_name FROM _prisma_migrations
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
    ORDER BY finished_at
  `;
  console.log('\nApplied count:', pending.length);
} finally {
  await prisma.$disconnect();
}
