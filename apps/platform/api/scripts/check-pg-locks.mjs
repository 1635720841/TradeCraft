import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

try {
  const locks = await prisma.$queryRaw`
    SELECT pid, granted, locktype, classid, objid
    FROM pg_locks
    WHERE locktype = 'advisory'
  `;
  console.log('advisory locks:', locks);

  const migrated = await prisma.$queryRaw`
    SELECT migration_name, finished_at
    FROM _prisma_migrations
    WHERE migration_name = '20260630210000_align_prisma_updated_at'
  `;
  console.log('align migration:', migrated);
} finally {
  await prisma.$disconnect();
}
