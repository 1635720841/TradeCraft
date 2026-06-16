/**
 * 内链人工编辑与重跑植入。
 *
 * 边界：
 * - 不负责：自动匹配算法（LinkingService / link-match.util）
 */

import { Injectable } from '@nestjs/common';
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import { PrismaService } from '../../../../core/database/prisma.service';
import { LoggerService } from '../../../../core/logger/logger.service';
import type { InternalLinkRecord } from '../linking/link-match.util';
import { LinkingService } from '../linking/linking.service';
import type { PatchInternalLinksDto } from './dto/patch-internal-links.dto';
import { applyInternalLinkEditsToContent } from './internal-links.util';

@Injectable()
export class ArticleJobInternalLinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly linkingService: LinkingService,
    private readonly logger: LoggerService,
  ) {}

  async patchInternalLinks(
    organizationId: string,
    projectId: string,
    jobId: string,
    dto: PatchInternalLinksDto,
  ) {
    const job = await this.loadJob(organizationId, projectId, jobId);
    const draftData = (job.draftData ?? {}) as {
      content?: string;
      internalLinks?: InternalLinkRecord[];
      internalLinksApplied?: boolean;
    };

    if (!draftData.internalLinksApplied || !draftData.content?.trim()) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '内链尚未植入，无法编辑');
    }

    const previousLinks = draftData.internalLinks ?? [];
    const { content, links: nextLinks } = applyInternalLinkEditsToContent(
      draftData.content,
      previousLinks,
      dto.internalLinks,
    );

    await this.prisma.articleJob.update({
      where: { id: jobId },
      data: {
        draftData: {
          ...(job.draftData as object),
          content,
          internalLinks: nextLinks,
          internalLinksApplied: true,
        } as object,
      },
    });

    this.logger.info('Internal links patched', {
      jobId,
      organizationId,
      projectId,
      action: 'article_job.internal_links_patch',
      linkCount: nextLinks.length,
    });

    return this.findOneDraftLinks(organizationId, projectId, jobId);
  }

  async reapplyInternalLinks(organizationId: string, projectId: string, jobId: string) {
    const job = await this.loadJob(organizationId, projectId, jobId);
    const draftData = job.draftData as { content?: string } | null;

    if (!draftData?.content?.trim()) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '正文为空，无法重跑内链');
    }

    await this.linkingService.injectInternalLinksForJob({
      jobId,
      traceId: job.traceId,
      organizationId,
      projectId,
      siteId: job.siteId,
    });

    return this.findOneDraftLinks(organizationId, projectId, jobId);
  }

  private async loadJob(organizationId: string, projectId: string, jobId: string) {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: jobId, organizationId, projectId },
      select: {
        id: true,
        traceId: true,
        siteId: true,
        draftData: true,
      },
    });

    if (!job) {
      throw new BusinessException(ErrorCodes.JOB_NOT_FOUND, '任务不存在');
    }

    return job;
  }

  private async findOneDraftLinks(organizationId: string, projectId: string, jobId: string) {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: jobId, organizationId, projectId },
      select: {
        id: true,
        traceId: true,
        draftData: true,
        updatedAt: true,
      },
    });

    if (!job) {
      throw new BusinessException(ErrorCodes.JOB_NOT_FOUND, '任务不存在');
    }

    const draftData = job.draftData as {
      internalLinks?: InternalLinkRecord[];
      internalLinksApplied?: boolean;
    } | null;

    return {
      id: job.id,
      traceId: job.traceId,
      internalLinks: draftData?.internalLinks ?? [],
      internalLinksApplied: draftData?.internalLinksApplied === true,
      updatedAt: job.updatedAt,
    };
  }
}
