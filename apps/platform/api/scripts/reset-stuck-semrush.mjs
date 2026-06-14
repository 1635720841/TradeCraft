/**
 * 重置卡在 OPTIMIZING 的手动 Semrush 检测（后端被强杀后遗留）。
 * 用法：cd apps/platform/api && node scripts/reset-stuck-semrush.mjs
 */
import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: resolve(apiRoot, '.env') });

const prisma = new PrismaClient();

const jobs = await prisma.articleJob.findMany({
  where: { status: 'OPTIMIZING' },
  select: { id: true, targetKeyword: true, seoCheckData: true, updatedAt: true },
});

if (!jobs.length) {
  console.log('没有 OPTIMIZING 状态的任务');
  await prisma.$disconnect();
  process.exit(0);
}

for (const job of jobs) {
  const data = job.seoCheckData ?? {};
  const semrush = data.semrush ?? {};
  const pending = semrush.pending;
  const restoreStatus = pending?.previousStatus ?? 'COMPLETED';
  const { pending: _p, ...semrushRest } = semrush;

  await prisma.articleJob.update({
    where: { id: job.id },
    data: {
      status: restoreStatus,
      errorMessage: 'Semrush 检测已手动重置（后端中断遗留）',
      seoCheckData: {
        ...data,
        semrush: {
          ...semrushRest,
          lastManualCheckError: 'Semrush 检测已手动重置（后端中断遗留）',
          lastManualCheckEndedAt: new Date().toISOString(),
          cancelled: true,
        },
      },
    },
  });

  console.log(`已重置 ${job.id} (${job.targetKeyword}) → ${restoreStatus}`);
}

await prisma.$disconnect();
