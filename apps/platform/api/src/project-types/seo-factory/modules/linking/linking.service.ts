/**
 * 内链服务：M8 自动匹配并植入站内链接（Semrush 终检前执行）。
 *
 * 边界：
 * - 不负责：Semrush 优化（SeoCheckerService）
 *
 * 入口：
 * - LinkingService
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../core/database/prisma.service';
import { LoggerService } from '../../../../core/logger/logger.service';
import { injectInternalLinks } from './link-match.util';
import { SitePageService } from './site-page.service';
import {
  filterPagesByPreferredTypes,
  resolvePreferredPageTypes,
} from '../../constants/content-form-link-routing.util';

export interface LinkingJobContext {
  jobId: string;
  traceId: string;
  organizationId: string;
  projectId: string;
  siteId: string;
}

@Injectable()
export class LinkingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sitePageService: SitePageService,
    private readonly logger: LoggerService,
  ) {}

  async injectInternalLinksForJob(ctx: LinkingJobContext): Promise<void> {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      select: { draftData: true, searchIntent: true, contentForm: true, targetKeyword: true },
    });

    const draftData = (job?.draftData ?? {}) as {
      content?: string;
      internalLinks?: unknown;
      internalLinksApplied?: boolean;
      optimizeHistory?: unknown;
    };
    const content = draftData.content?.trim();
    if (!content) {
      this.logger.warn('Skip linking: draft content missing', {
        traceId: ctx.traceId,
        jobId: ctx.jobId,
        action: 'linking.skip_no_draft',
      });
      return;
    }

    let candidates = await this.sitePageService.loadCandidates(
      ctx.organizationId,
      ctx.projectId,
      ctx.siteId,
    );

    if (candidates.length === 0) {
      await this.sitePageService.syncFromSitemap(ctx.organizationId, ctx.projectId, ctx.siteId);
      candidates = await this.sitePageService.loadCandidates(
        ctx.organizationId,
        ctx.projectId,
        ctx.siteId,
      );
    }

    if (candidates.length === 0) {
      this.logger.info('Skip linking: no site pages in library', {
        traceId: ctx.traceId,
        jobId: ctx.jobId,
        action: 'linking.skip_empty_library',
      });
      await this.markLinkingApplied(ctx.jobId, draftData, content, []);
      return;
    }

    const preferredTypes = resolvePreferredPageTypes(job?.searchIntent, job?.contentForm);
    candidates = filterPagesByPreferredTypes(candidates, preferredTypes);

    const result = injectInternalLinks(content, candidates, {
      targetKeyword: job?.targetKeyword,
    });

    await this.markLinkingApplied(ctx.jobId, draftData, result.content, result.links);

    this.logger.info('Internal links injected', {
      traceId: ctx.traceId,
      jobId: ctx.jobId,
      action: 'linking.completed',
      linkCount: result.links.length,
      pageLibrarySize: candidates.length,
    });
  }

  private async markLinkingApplied(
    jobId: string,
    existingDraft: Record<string, unknown>,
    content: string,
    links: ReturnType<typeof injectInternalLinks>['links'],
  ): Promise<void> {
    await this.prisma.articleJob.update({
      where: { id: jobId },
      data: {
        draftData: {
          ...existingDraft,
          content,
          internalLinks: links,
          internalLinksApplied: true,
        } as object,
      },
    });
  }
}
