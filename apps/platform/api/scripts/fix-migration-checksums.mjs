import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '../prisma/migrations');

const stubMigrations = [
  '20260628120000_subscription_plans',
  '20260628180000_rbac_permissions',
  '20260628200000_platform_menus',
  '20260628210000_user_menu_grants',
  '20260630200000_reconcile_dev_drift',
];

function checksumFor(name) {
  const sql = readFileSync(join(migrationsDir, name, 'migration.sql'));
  return createHash('sha256').update(sql).digest('hex');
}

try {
  for (const name of stubMigrations) {
    const checksum = checksumFor(name);
    const updated = await prisma.$executeRaw`
      UPDATE _prisma_migrations
      SET checksum = ${checksum}
      WHERE migration_name = ${name}
        AND finished_at IS NOT NULL
        AND rolled_back_at IS NULL
    `;
    console.log(`${name}: checksum updated (${updated} row)`);
  }
} finally {
  await prisma.$disconnect();
}
