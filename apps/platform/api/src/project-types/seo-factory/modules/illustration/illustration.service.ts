/**
 * 配图服务：Semrush 终检前通过 BFL 官方 API 补足 SWA 所需图片。
 *
 * 边界：
 * - 不负责：Semrush 优化（SeoCheckerService）
 *
 * 入口：
 * - IllustrationService
 */

import { Inject, Injectable } from '@nestjs/common';
import { MediaAssetSource } from '@prisma/client';
import { IMAGE_PROVIDER, type IImageProvider } from '@wm/provider-interfaces';
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import { PrismaService } from '../../../../core/database/prisma.service';
import { LoggerService } from '../../../../core/logger/logger.service';
import { MediaIngestService } from '../../../../modules/media/media-ingest.service';
import { MediaService } from '../../../../modules/media/media.service';
import { parseSiteWorkflowSettings } from '../../constants/brief-approval';
import { SWA_MIN_IMAGES } from '../../constants/swa-content';
import {
  buildArticleImageAlt,
  buildArticleImagePrompt,
  extractFirstSectionHint,
  finalizeArticleImagePrompt,
} from './article-image-prompt.util';
import {
  countEffectiveMarkdownImages,
  countMarkdownImages,
  isPlaceholderImageUrl,
  stripAllMarkdownImages,
  stripPlaceholderMarkdownImages,
  type ArticleImageRecord,
} from './article-image.util';
import { insertArticleImageMarkdown } from './article-images-edit.util';

export interface IllustrationJobContext {
  jobId: string;
  traceId: string;
  organizationId: string;
  projectId: string;
  siteId: string;
  targetKeyword: string;
}

@Injectable()
export class IllustrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly mediaIngestService: MediaIngestService,
    private readonly mediaService: MediaService,
    @Inject(IMAGE_PROVIDER) private readonly imageProvider: IImageProvider,
  ) {}

  async enrichImagesForJob(
    ctx: IllustrationJobContext,
    options?: { force?: boolean },
  ): Promise<void> {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      select: { draftData: true, site: { select: { settings: true } } },
    });

    if (!job) {
      this.logger.warn('Skip illustration: job not found', {
        traceId: ctx.traceId,
        jobId: ctx.jobId,
        action: 'illustration.skip_job_missing',
      });
      return;
    }

    const siteWorkflow = parseSiteWorkflowSettings(job.site?.settings);
    if (!siteWorkflow.enableIllustration) {
      if (options?.force) {
        throw new BusinessException(
          ErrorCodes.VALIDATION_ERROR,
          '站点已关闭自动配图，请在「项目配置」中开启「自动配图」',
        );
      }
      await this.markSkipped(ctx, job.draftData);
      return;
    }

    const draftData = (job.draftData ?? {}) as {
      content?: string;
      articleImages?: ArticleImageRecord[];
      imagesApplied?: boolean;
    };
    const content = draftData.content?.trim();
    if (!content) {
      this.logger.warn('Skip illustration: draft content missing', {
        traceId: ctx.traceId,
        jobId: ctx.jobId,
        action: 'illustration.skip_no_draft',
      });
      return;
    }

    const strippedContent = stripPlaceholderMarkdownImages(content);
    const placeholderCount = countMarkdownImages(content) - countEffectiveMarkdownImages(strippedContent);
    const workingContent = strippedContent;
    const effectiveImageCount = countEffectiveMarkdownImages(workingContent);

    if (placeholderCount > 0) {
      await this.prisma.articleJob.update({
        where: { id: ctx.jobId },
        data: {
          draftData: {
            ...draftData,
            content: workingContent,
            articleImages: (draftData.articleImages ?? []).filter(
              (image) => !isPlaceholderImageUrl(image.url),
            ),
          } as object,
        },
      });
      this.logger.info('Removed draft placeholder images before illustration', {
        traceId: ctx.traceId,
        jobId: ctx.jobId,
        action: 'illustration.placeholder_removed',
        placeholderCount,
      });
    }

    if (
      !options?.force &&
      draftData.imagesApplied &&
      effectiveImageCount >= SWA_MIN_IMAGES
    ) {
      this.logger.info('Skip illustration: already enriched', {
        traceId: ctx.traceId,
        jobId: ctx.jobId,
        action: 'illustration.skip_already_applied',
        imageCount: effectiveImageCount,
      });
      return;
    }

    const generated = await this.generateWithBfl(ctx, workingContent);

    if (
      countEffectiveMarkdownImages(generated.content) < SWA_MIN_IMAGES &&
      generated.images.length === 0
    ) {
      const errorMessage =
        generated.lastError ??
        'BFL 未生成足够配图，请查看服务端日志或检查网络/代理';
      await this.markIllustrationFailed(ctx.jobId, draftData, errorMessage);
      this.logger.error('Illustration finished without enough images', {
        traceId: ctx.traceId,
        jobId: ctx.jobId,
        action: 'illustration.insufficient_images',
        imageCount: countEffectiveMarkdownImages(generated.content),
        error: errorMessage,
      });
      return;
    }

    await this.markImagesApplied(ctx.jobId, draftData, generated.content, generated.images);

    this.logger.info('Article images enriched', {
      traceId: ctx.traceId,
      jobId: ctx.jobId,
      action: 'illustration.completed',
      imageCount: countMarkdownImages(generated.content),
      insertedCount: generated.images.length,
      provider: 'bfl',
    });
  }

  /** 清除已有 BFL 配图后重新自动补足（人工「重跑自动配图」） */
  async reapplyImagesForJob(ctx: IllustrationJobContext): Promise<void> {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      select: { draftData: true, site: { select: { settings: true } } },
    });

    if (!job) {
      this.logger.warn('Skip illustration reapply: job not found', {
        traceId: ctx.traceId,
        jobId: ctx.jobId,
        action: 'illustration.reapply_job_missing',
      });
      return;
    }

    const draftData = (job.draftData ?? {}) as {
      content?: string;
      articleImages?: ArticleImageRecord[];
    };
    const content = draftData.content?.trim();
    if (!content) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '正文为空，无法重跑配图');
    }

    const keptUploads = (draftData.articleImages ?? []).filter((image) => image.source === 'upload');
    const removedBflAssetIds = (draftData.articleImages ?? [])
      .filter((image) => image.source === 'bfl' && image.assetId)
      .map((image) => image.assetId as string);

    for (const assetId of removedBflAssetIds) {
      await this.mediaService.unbindAsset(ctx.organizationId, ctx.projectId, assetId);
    }

    let strippedContent = stripAllMarkdownImages(content);
    for (const image of keptUploads) {
      strippedContent = insertArticleImageMarkdown(
        strippedContent,
        image.alt,
        image.url,
        image.insertAfterHeading,
      );
    }

    await this.prisma.articleJob.update({
      where: { id: ctx.jobId },
      data: {
        draftData: {
          ...(job.draftData as object),
          content: strippedContent,
          articleImages: keptUploads,
          imagesApplied: false,
          illustrationError: null,
        } as object,
      },
    });

    await this.enrichImagesForJob(ctx, { force: true });

    const after = await this.prisma.articleJob.findFirst({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      select: { draftData: true },
    });
    const afterDraft = (after?.draftData ?? {}) as {
      content?: string;
      articleImages?: ArticleImageRecord[];
      illustrationError?: string;
    };
    const bflCount = (afterDraft.articleImages ?? []).filter((i) => i.source === 'bfl').length;
    const markdownCount = countEffectiveMarkdownImages(afterDraft.content ?? '');
    if (bflCount === 0 && markdownCount < SWA_MIN_IMAGES) {
      throw new BusinessException(
        ErrorCodes.EXTERNAL_API_ERROR,
        afterDraft.illustrationError?.trim() ||
          '自动配图未生成任何图片，请稍后重试或手动按描述生成',
      );
    }
  }

  /** 按 prompt 调用 BFL 生图（人工单张生成/重生成入口） */
  async generateImageFromPrompt(prompt: string) {
    return this.imageProvider.generateImage(finalizeArticleImagePrompt(prompt));
  }

  private async generateWithBfl(
    ctx: IllustrationJobContext,
    content: string,
  ): Promise<{ content: string; images: ArticleImageRecord[]; lastError?: string }> {
    const needed = Math.max(0, SWA_MIN_IMAGES - countEffectiveMarkdownImages(content));
    if (needed === 0) {
      return { content, images: [] };
    }

    const images: ArticleImageRecord[] = [];
    let nextContent = content;
    let lastError: string | undefined;

    const sectionHints = this.collectSectionHints(content, needed);

    for (let index = 0; index < needed; index += 1) {
      const sectionHint = sectionHints[index];
      const prompt = buildArticleImagePrompt({
        keyword: ctx.targetKeyword,
        index,
        sectionHint,
      });
      try {
        const result = await this.imageProvider.generateImage(prompt);
        const ingested = await this.mediaIngestService.ingestFromRemoteUrl({
          organizationId: ctx.organizationId,
          projectId: ctx.projectId,
          remoteUrl: result.url,
          source: MediaAssetSource.BFL,
          sourceMeta: {
            provider: 'bfl',
            jobId: ctx.jobId,
            prompt,
            sectionHint,
          },
          bind: true,
        });
        const alt = buildArticleImageAlt(ctx.targetKeyword, sectionHint);
        const insertAfterHeading = sectionHint?.trim() || undefined;
        nextContent = insertArticleImageMarkdown(
          nextContent,
          alt,
          ingested.url,
          insertAfterHeading,
        );
        images.push({
          alt,
          url: ingested.url,
          assetId: ingested.assetId,
          source: 'bfl',
          insertAfterHeading,
        });
      } catch (error) {
        const errMessage = error instanceof Error ? error.message : 'unknown error';
        lastError = errMessage;
        this.logger.error('BFL image generation failed', {
          traceId: ctx.traceId,
          jobId: ctx.jobId,
          action: 'illustration.bfl_failed',
          index,
          error: errMessage,
        });
        break;
      }
    }

    return { content: nextContent.trim(), images, lastError };
  }

  private collectSectionHints(content: string, count: number): string[] {
    const headings = [...content.matchAll(/^##\s+(.+)$/gm)]
      .map((match) => match[1]?.trim())
      .filter((heading): heading is string => Boolean(heading && heading.length >= 2));

    if (headings.length === 0) {
      const fallback = extractFirstSectionHint(content);
      return Array.from({ length: count }, () => fallback ?? '');
    }

    return Array.from({ length: count }, (_item, index) => headings[index % headings.length] ?? headings[0] ?? '');
  }

  private async markSkipped(ctx: IllustrationJobContext, draftData: unknown): Promise<void> {
    const existingDraft = (draftData ?? {}) as Record<string, unknown>;

    await this.prisma.articleJob.update({
      where: { id: ctx.jobId },
      data: {
        draftData: {
          ...existingDraft,
          imagesApplied: true,
        } as object,
      },
    });

    this.logger.info('Article illustration skipped', {
      traceId: ctx.traceId,
      jobId: ctx.jobId,
      action: 'illustration.skipped',
      reason: '站点已关闭自动配图',
    });
  }

  private async markIllustrationFailed(
    jobId: string,
    existingDraft: Record<string, unknown>,
    errorMessage: string,
  ): Promise<void> {
    await this.prisma.articleJob.update({
      where: { id: jobId },
      data: {
        draftData: {
          ...existingDraft,
          illustrationError: errorMessage,
          imagesApplied: false,
        } as object,
      },
    });
  }

  private async markImagesApplied(
    jobId: string,
    existingDraft: Record<string, unknown>,
    content: string,
    images: ArticleImageRecord[],
  ): Promise<void> {
    const previousImages = Array.isArray(existingDraft.articleImages)
      ? (existingDraft.articleImages as ArticleImageRecord[]).filter(
          (image) => !isPlaceholderImageUrl(image.url),
        )
      : [];

    await this.prisma.articleJob.update({
      where: { id: jobId },
      data: {
        draftData: {
          ...existingDraft,
          content,
          articleImages: [...previousImages, ...images],
          imagesApplied: true,
          illustrationError: null,
        } as object,
      },
    });
  }
}
