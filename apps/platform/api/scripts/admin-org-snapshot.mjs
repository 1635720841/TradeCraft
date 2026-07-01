import { PrismaClient } from '@prisma/client';
import { writeFile } from 'node:fs/promises';

const prisma = new PrismaClient();

try {
  const orgs = await prisma.organization.findMany({
    select: {
      id: true,
      name: true,
      type: true,
      status: true,
      planId: true,
      planName: true,
      subscriptionStatus: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const users = await prisma.user.findMany({
    where: {
      role: {
        in: ['SUPER_ADMIN', 'PLATFORM_OPERATOR', 'ADMIN'],
      },
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      organizationId: true,
      createdAt: true,
    },
    orderBy: [{ organizationId: 'asc' }, { role: 'asc' }, { email: 'asc' }],
  });

  const payload = JSON.stringify({ orgs, users }, null, 2);
  await writeFile(new URL('./admin-org-snapshot.json', import.meta.url), payload, 'utf8');
  console.log(payload);
} finally {
  await prisma.$disconnect();
}
