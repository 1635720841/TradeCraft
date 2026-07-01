import { readFile } from 'node:fs/promises';
import { scryptSync } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function hashPassword(password) {
  const salt = scryptSync(password, 'wm-auth-salt', 16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

const DEFAULT_PASSWORD = 'Reset123456!';
const DEFAULT_PERIOD_DAYS = 30;

function toDate(input, fallback = new Date()) {
  if (!input) return fallback;
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

try {
  const raw = await readFile(new URL('./admin-org-snapshot.json', import.meta.url), 'utf8');
  const snapshot = JSON.parse(raw);
  const orgs = Array.isArray(snapshot.orgs) ? snapshot.orgs : [];
  const users = Array.isArray(snapshot.users) ? snapshot.users : [];

  for (const org of orgs) {
    const createdAt = toDate(org.createdAt);
    const currentPeriodEnd = new Date(createdAt.getTime() + DEFAULT_PERIOD_DAYS * 24 * 60 * 60 * 1000);

    await prisma.organization.upsert({
      where: { id: org.id },
      update: {
        name: org.name,
        type: org.type,
        status: org.status,
        planId: org.planId ?? 'trial',
        planName: org.planName ?? 'trial',
        subscriptionStatus: org.subscriptionStatus ?? 'ACTIVE',
      },
      create: {
        id: org.id,
        name: org.name,
        type: org.type,
        status: org.status,
        planId: org.planId ?? 'trial',
        planName: org.planName ?? 'trial',
        subscriptionStatus: org.subscriptionStatus ?? 'ACTIVE',
        currentPeriodEnd,
      },
    });
  }

  const passwordHash = hashPassword(DEFAULT_PASSWORD);

  for (const user of users) {
    await prisma.user.upsert({
      where: { id: user.id },
      update: {
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
        organizationId: user.organizationId,
      },
      create: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
        organizationId: user.organizationId,
        passwordHash,
      },
    });
  }

  console.log(
    JSON.stringify(
      {
        restoredOrgs: orgs.length,
        restoredUsers: users.length,
        defaultPassword: DEFAULT_PASSWORD,
      },
      null,
      2,
    ),
  );
} finally {
  await prisma.$disconnect();
}
