import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const pids = [94384, 94470, 94508];

try {
  for (const pid of pids) {
    const ok = await prisma.$executeRawUnsafe(`SELECT pg_terminate_backend(${pid})`);
    console.log(pid, ok);
  }
} finally {
  await prisma.$disconnect();
}
