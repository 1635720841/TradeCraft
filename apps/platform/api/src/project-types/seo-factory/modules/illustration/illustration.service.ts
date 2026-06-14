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
import { IMAGE_PROVIDER, type IImageProvider } from '@wm/provider-interfaces';
import { PrismaService } from '../../../../core/database/prisma.service';
import { LoggerService } from '../../../../core/logger/logger.service';
import { SWA_MIN_IMAGES } from '../../constants/swa-content';
import {
  buildArticleImageAlt,
  buildArticleImagePrompt,
  extractFirstSectionHint,
} from './article-image-prompt.util';
import { countMarkdownImages, type ArticleImageRecord } from './article-image.util';

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
    @Inject(IMAGE_PROVIDER) private readonly imageProvider: IImageProvider,
  ) {}

  async enrichImagesForJob(ctx: IllustrationJobContext): Promise<void> {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: ctx.jobId, organizationId: ctx.organizationId, projectId: ctx.projectId },
      select: { draftData: true },
    });

    const draftData = (job?.draftData ?? {}) as {
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

    if (draftData.imagesApplied && countMarkdownImages(content) >= SWA_MIN_IMAGES) {
      this.logger.info('Skip illustration: already enriched', {
        traceId: ctx.traceId,
        jobId: ctx.jobId,
        action: 'illustration.skip_already_applied',
        imageCount: countMarkdownImages(content),
      });
      return;
    }

    const generated = await this.generateWithBfl(ctx, content);

    if (countMarkdownImages(generated.content) < SWA_MIN_IMAGES && generated.images.length === 0) {
      this.logger.warn('Illustration finished without enough images', {
        traceId: ctx.traceId,
        jobId: ctx.jobId,
        action: 'illustration.insufficient_images',
        imageCount: countMarkdownImages(generated.content),
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

  private async generateWithBfl(
    ctx: IllustrationJobContext,
    content: string,
  ): Promise<{ content: string; images: ArticleImageRecord[] }> {
    const needed = Math.max(0, SWA_MIN_IMAGES - countMarkdownImages(content));
    if (needed === 0) {
      return { content, images: [] };
    }

    const images: ArticleImageRecord[] = [];
    let nextContent = content;

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
        const alt = buildArticleImageAlt(ctx.targetKeyword, sectionHint);
        const markdownImage = `![${alt}](${result.url})`;
        nextContent = `${nextContent.trim()}\n\n${markdownImage}`;
        images.push({
          alt,
          url: result.url,
          source: 'bfl',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown error';
        this.logger.warn('BFL image generation failed', {
          traceId: ctx.traceId,
          jobId: ctx.jobId,
          action: 'illustration.bfl_failed',
          index,
          error: message,
        });
        break;
      }
    }

    return { content: nextContent.trim(), images };
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

  private async markImagesApplied(
    jobId: string,
    existingDraft: Record<string, unknown>,
    content: string,
    images: ArticleImageRecord[],
  ): Promise<void> {
    const previousImages = Array.isArray(existingDraft.articleImages)
      ? (existingDraft.articleImages as ArticleImageRecord[])
      : [];

    await this.prisma.articleJob.update({
      where: { id: jobId },
      data: {
        draftData: {
          ...existingDraft,
          content,
          articleImages: [...previousImages, ...images],
          imagesApplied: true,
        } as object,
      },
    });
  }
}
