/**
 * 主题集群上下文：支柱页与支撑文关系，供 Brief/Draft Prompt 使用。
 */

import type { PrismaService } from '../../../../core/database/prisma.service';

export async function resolveClusterPromptContext(
  prisma: PrismaService,
  organizationId: string,
  projectId: string,
  targetKeyword: string,
): Promise<string | undefined> {
  const entry = await prisma.keywordEntry.findFirst({
    where: {
      organizationId,
      projectId,
      keyword: { equals: targetKeyword.trim(), mode: 'insensitive' },
      clusterId: { not: null },
    },
    select: {
      cluster: {
        select: {
          name: true,
          pillarKeyword: { select: { keyword: true } },
        },
      },
    },
  });

  const cluster = entry?.cluster;
  if (!cluster) return undefined;

  const pillar = cluster.pillarKeyword?.keyword?.trim();
  const lines = [`Topic cluster: **${cluster.name}**`];

  if (pillar) {
    if (pillar.toLowerCase() === targetKeyword.trim().toLowerCase()) {
      lines.push(
        '- This keyword is the **pillar page** for the cluster — plan comprehensive hub content and link out to supporting topics.',
      );
    } else {
      lines.push(
        `- Pillar topic for this cluster: **${pillar}** — treat this article as supporting content; mention the pillar theme and suggest internal links toward it when natural.`,
      );
    }
  } else {
    lines.push('- No pillar keyword set yet — keep cluster theme consistent across sections.');
  }

  return lines.join('\n');
}
