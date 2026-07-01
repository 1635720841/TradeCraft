/**
 * 配图人工编辑、单张重生成与重跑自动配图。
 *
 * 边界：
 * - 不负责：工作流自动配图（IllustrationService）
 */

import { Injectable } from '@nestjs/common';
import { MediaAssetSource } from '@prisma/client';
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import { PrismaService } from '../../../../core/database/prisma.service';
import { LoggerService } from '../../../../core/logger/logger.service';
import { MediaIngestService } from '../../../../modules/media/media-ingest.service';
import { MediaService } from '../../../../modules/media/media.service';
import type { DraftStaleness, DraftStalenessAffected } from '../../constants/draft-edit';
import {
  buildArticleImageAlt,
  buildArticleImagePrompt,
} from '../illustration/article-image-prompt.util';
import { isImageMutationBlocked } from '../../constants/article-job-status';
import type { ArticleImageRecord } from '../illustration/article-image.util';
import { collectArticleImageAssetIds } from '../illustration/article-image.util';
import { IllustrationService } from '../illustration/illustration.service';
import {
  applyArticleImageEditsToContent,
  insertArticleImageMarkdown,
  removeImageMarkdownFromContent,
} from '../illustration/article-images-edit.util';
import type { GenerateArticleImageDto } from './dto/regenerate-article-image.dto';
import type { PatchArticleImagesDto } from './dto/patch-article-images.dto';
import type { RegenerateArticleImageDto } from './dto/regenerate-article-image.dto';

@Injectable()
export class ArticleJobImagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly illustrationService: IllustrationService,
    private readonly mediaIngestService: MediaIngestService,
    private readonly mediaService: MediaService,
  ) {}

  async patchArticleImages(
    organizationId: string,
    projectId: string,
    jobId: string,
    userId: string,
    dto: PatchArticleImagesDto,
  ) {
    const job = await this.loadJob(organizationId, projectId, jobId);
    this.assertImageMutationAllowed(job.status);

    const draftData = (job.draftData ?? {}) as {
      content?: string;
      articleImages?: ArticleImageRecord[];
      imagesApplied?: boolean;
      staleness?: DraftStaleness | null;
    };

    if (!draftData.content?.trim()) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '正文为空，无法编辑配图');
    }

    const previousImages = draftData.articleImages ?? [];
    const { content, images } = applyArticleImageEditsToContent(
      draftData.content,
      previousImages,
      dto.articleImages,
    );

    await this.mediaService.syncAssetBindings(
      organizationId,
      projectId,
      collectArticleImageAssetIds(previousImages),
      collectArticleImageAssetIds(images),
    );

    await this.persistDraftImages(jobId, job.draftData, {
      content,
      articleImages: images,
      imagesApplied: true,
      staleness: this.mergeImageEditStaleness(draftData.staleness, userId),
    });

    this.logger.info('Article images patched', {
      jobId,
      organizationId,
      projectId,
      action: 'article_job.images_patch',
      imageCount: images.length,
    });

    return this.findOneDraftImages(organizationId, projectId, jobId);
  }

  async regenerateArticleImage(
    organizationId: string,
    projectId: string,
    jobId: string,
    userId: string,
    index: number,
    dto: RegenerateArticleImageDto,
  ) {
    const job = await this.loadJob(organizationId, projectId, jobId);
    this.assertImageMutationAllowed(job.status);

    const draftData = (job.draftData ?? {}) as {
      content?: string;
      articleImages?: ArticleImageRecord[];
      imagesApplied?: boolean;
      staleness?: DraftStaleness | null;
    };

    if (!draftData.imagesApplied || !draftData.content?.trim()) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '配图尚未植入，无法重新生成');
    }

    const images = [...(draftData.articleImages ?? [])];
    if (index < 0 || index >= images.length) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '配图索引无效');
    }

    const current = images[index];
    const prompt =
      dto.prompt?.trim() ||
      buildArticleImagePrompt({
        keyword: job.targetKeyword,
        index,
        sectionHint: current.insertAfterHeading,
      });

    const generated = await this.illustrationService.generateImageFromPrompt(prompt);
    const ingested = await this.mediaIngestService.ingestFromRemoteUrl({
      organizationId,
      projectId,
      remoteUrl: generated.url,
      source: MediaAssetSource.BFL,
      sourceMeta: {
        provider: 'bfl',
        jobId,
        prompt,
        index,
      },
      createdBy: userId,
      bind: true,
    });

    if (current.assetId) {
      await this.mediaService.unbindAsset(organizationId, projectId, current.assetId);
    }

    const alt =
      current.alt?.trim() ||
      buildArticleImageAlt(job.targetKeyword, current.insertAfterHeading);

    let content = removeImageMarkdownFromContent(draftData.content, current.url);
    content = insertArticleImageMarkdown(
      content,
      alt,
      ingested.url,
      current.insertAfterHeading,
    );

    images[index] = {
      alt,
      url: ingested.url,
      assetId: ingested.assetId,
      source: 'bfl',
      insertAfterHeading: current.insertAfterHeading,
    };

    await this.persistDraftImages(jobId, job.draftData, {
      content,
      articleImages: images,
      imagesApplied: true,
      staleness: this.mergeImageEditStaleness(draftData.staleness, userId),
    });

    this.logger.info('Article image regenerated', {
      jobId,
      organizationId,
      projectId,
      action: 'article_job.image_regenerate',
      index,
    });

    return this.findOneDraftImages(organizationId, projectId, jobId);
  }

  async generateArticleImage(
    organizationId: string,
    projectId: string,
    jobId: string,
    userId: string,
    dto: GenerateArticleImageDto,
  ) {
    const job = await this.loadJob(organizationId, projectId, jobId);
    this.assertImageMutationAllowed(job.status);

    const draftData = (job.draftData ?? {}) as {
      content?: string;
      articleImages?: ArticleImageRecord[];
      imagesApplied?: boolean;
      staleness?: DraftStaleness | null;
    };

    if (!draftData.content?.trim()) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '正文为空，无法生成配图');
    }

    const prompt = dto.prompt.trim();
    const generated = await this.illustrationService.generateImageFromPrompt(prompt);
    const ingested = await this.mediaIngestService.ingestFromRemoteUrl({
      organizationId,
      projectId,
      remoteUrl: generated.url,
      source: MediaAssetSource.BFL,
      sourceMeta: {
        provider: 'bfl',
        jobId,
        prompt,
      },
      createdBy: userId,
      bind: true,
    });
    const alt =
      dto.alt?.trim() ||
      buildArticleImageAlt(job.targetKeyword, dto.insertAfterHeading);
    const images = [...(draftData.articleImages ?? [])];
    const nextImage: ArticleImageRecord = {
      alt,
      url: ingested.url,
      assetId: ingested.assetId,
      source: 'bfl',
      insertAfterHeading: dto.insertAfterHeading?.trim() || undefined,
    };
    images.push(nextImage);

    const content = insertArticleImageMarkdown(
      draftData.content,
      alt,
      ingested.url,
      nextImage.insertAfterHeading,
    );

    await this.persistDraftImages(jobId, job.draftData, {
      content,
      articleImages: images,
      imagesApplied: true,
      staleness: this.mergeImageEditStaleness(draftData.staleness, userId),
    });

    this.logger.info('Article image generated', {
      jobId,
      organizationId,
      projectId,
      action: 'article_job.image_generate',
      imageCount: images.length,
    });

    return this.findOneDraftImages(organizationId, projectId, jobId);
  }

  async reapplyArticleImages(organizationId: string, projectId: string, jobId: string) {
    const job = await this.loadJob(organizationId, projectId, jobId);
    this.assertImageMutationAllowed(job.status);

    const draftData = job.draftData as { content?: string } | null;
    if (!draftData?.content?.trim()) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '正文为空，无法重跑配图');
    }

    await this.illustrationService.reapplyImagesForJob({
      jobId,
      traceId: job.traceId,
      organizationId,
      projectId,
      siteId: job.siteId,
      targetKeyword: job.targetKeyword,
    });

    return this.findOneDraftImages(organizationId, projectId, jobId);
  }

  private assertImageMutationAllowed(status: string) {
    if (isImageMutationBlocked(status)) {
      throw new BusinessException(
        ErrorCodes.VALIDATION_ERROR,
        '任务进行中，请稍后再编辑配图',
      );
    }
  }

  private mergeImageEditStaleness(
    existing: DraftStaleness | null | undefined,
    userId: string,
  ): DraftStaleness {
    const affected: DraftStalenessAffected = {
      localSeo: true,
      semrush: existing?.affected.semrush ?? false,
      paraphrase: existing?.affected.paraphrase ?? false,
      ymyl: existing?.affected.ymyl ?? false,
      export: true,
      internalLinks: existing?.affected.internalLinks ?? false,
      images: false,
    };

    return {
      contentChanged: true,
      titleMetaChanged: existing?.titleMetaChanged ?? false,
      invalidatedAt: new Date().toISOString(),
      invalidatedBy: userId,
      affected,
      postSaveAction: existing?.postSaveAction,
    };
  }

  private async persistDraftImages(
    jobId: string,
    existingDraft: unknown,
    patch: {
      content: string;
      articleImages: ArticleImageRecord[];
      imagesApplied: boolean;
      staleness: DraftStaleness;
    },
  ) {
    await this.prisma.articleJob.update({
      where: { id: jobId },
      data: {
        draftData: {
          ...(existingDraft as object),
          ...patch,
        } as object,
      },
    });
  }

  private async loadJob(organizationId: string, projectId: string, jobId: string) {
    const job = await this.prisma.articleJob.findFirst({
      where: { id: jobId, organizationId, projectId },
      select: {
        id: true,
        traceId: true,
        siteId: true,
        status: true,
        targetKeyword: true,
        draftData: true,
      },
    });

    if (!job) {
      throw new BusinessException(ErrorCodes.JOB_NOT_FOUND, '任务不存在');
    }

    return job;
  }

  private async findOneDraftImages(organizationId: string, projectId: string, jobId: string) {
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
      articleImages?: ArticleImageRecord[];
      imagesApplied?: boolean;
      content?: string;
    } | null;

    return {
      id: job.id,
      traceId: job.traceId,
      articleImages: draftData?.articleImages ?? [],
      imagesApplied: draftData?.imagesApplied === true,
      updatedAt: job.updatedAt,
    };
  }
}
