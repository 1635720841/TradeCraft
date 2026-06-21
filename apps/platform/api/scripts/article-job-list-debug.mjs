/**
 * 诊断文章任务列表为空：统计 DB 任务数与列表过滤结果。
 * 运行：node apps/platform/api/scripts/article-job-list-debug.mjs
 */
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

try {
  const projects = await prisma.project.findMany({
    select: { id: true, name: true, organizationId: true },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  console.log('projects:', projects);

  const totalJobs = await prisma.articleJob.count();
  const labJobs = await prisma.articleJob.count({
    where: { id: { startsWith: 'lab-manual-' } },
  });
  console.log('totalJobs:', totalJobs, 'labManualJobs:', labJobs);

  for (const project of projects) {
    const orgId = project.organizationId;
    const projectId = project.id;

    const allInProject = await prisma.articleJob.count({
      where: { organizationId: orgId, projectId },
    });

    const brokenFilter = await prisma.articleJob.count({
      where: {
        organizationId: orgId,
        projectId,
        NOT: {
          seoCheckData: {
            path: ['calibrationLabImport'],
            equals: true,
          },
        },
      },
    });

    const fixedOrFilter = await prisma.articleJob.count({
      where: {
        organizationId: orgId,
        projectId,
        OR: [
          { seoCheckData: { equals: Prisma.DbNull } },
          {
            NOT: {
              seoCheckData: {
                path: ['calibrationLabImport'],
                equals: true,
              },
            },
          },
        ],
      },
    });

    const prefixFilter = await prisma.articleJob.count({
      where: {
        organizationId: orgId,
        projectId,
        NOT: { id: { startsWith: 'lab-manual-' } },
      },
    });

    console.log(`\n[${project.name}]`);
    console.log('  allInProject:', allInProject);
    console.log('  brokenFilter (old NOT path):', brokenFilter);
    console.log('  fixedOrFilter:', fixedOrFilter);
    console.log('  prefixFilter (lab-manual-):', prefixFilter);
  }
} finally {
  await prisma.$disconnect();
}
