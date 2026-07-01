/**
 * 配图重跑冒烟：对最近一篇有正文的任务执行 reapplyImagesForJob。
 * 用法：cd apps/platform/api && node scripts/illustration-reapply.smoke.mjs
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { initHttpDispatcher } from '../dist/core/http/http-fetch.js';
import { IllustrationService } from '../dist/project-types/seo-factory/modules/illustration/illustration.service.js';
import { BflImageAdapter } from '../dist/project-types/seo-factory/providers/bfl/bfl-image.adapter.js';
import { LoggerService } from '../dist/core/logger/logger.service.js';

initHttpDispatcher();

const prisma = new PrismaClient();
const logger = new LoggerService();
const bfl = new BflImageAdapter(logger);
const service = new IllustrationService(prisma, logger, bfl);

const job = await prisma.articleJob.findFirst({
  where: { draftData: { path: ['content'], not: '' } },
  orderBy: { updatedAt: 'desc' },
  select: {
    id: true,
    traceId: true,
    organizationId: true,
    projectId: true,
    siteId: true,
    targetKeyword: true,
    draftData: true,
  },
});

if (!job) {
  console.error('no job with draft content');
  process.exit(1);
}

const before = job.draftData ?? {};
console.log(
  'job',
  job.id.slice(0, 8),
  'md',
  String(before.content ?? '').match(/!\[/g)?.length ?? 0,
  'bflMeta',
  (before.articleImages ?? []).filter((i) => i.source === 'bfl').length,
);

try {
  await service.reapplyImagesForJob({
    jobId: job.id,
    traceId: job.traceId,
    organizationId: job.organizationId,
    projectId: job.projectId,
    siteId: job.siteId,
    targetKeyword: job.targetKeyword,
  });
  const after = await prisma.articleJob.findFirst({
    where: { id: job.id },
    select: { draftData: true },
  });
  const d = after?.draftData ?? {};
  const bflCount = (d.articleImages ?? []).filter((i) => i.source === 'bfl').length;
  console.log(
    'REAPPLY_OK bfl=',
    bflCount,
    'md=',
    String(d.content ?? '').match(/!\[/g)?.length ?? 0,
  );
} catch (error) {
  console.error('REAPPLY_FAIL', error instanceof Error ? error.message : error);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
