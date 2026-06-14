/**
 * 稿件正文插图：本地上传与读取。
 */

import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import { PrismaService } from '../../../../core/database/prisma.service';
import { StorageService } from '../../../../core/storage/storage.service';
import {
  DRAFT_IMAGE_ALLOWED_MIME as ALLOWED_MIME,
  DRAFT_IMAGE_MAX_BYTES as MAX_BYTES,
} from '../../constants/draft-image';
import {
  assertDraftImageFilename,
  buildDraftImagePublicUrl,
  buildDraftImageStorageKey,
  extensionForDraftImageMime,
} from './draft-image.util';
import { ArticleJobDraftEditService } from './article-job-draft-edit.service';

export interface DraftImageUploadResult {
  url: string;
  filename: string;
  contentType: string;
  size: number;
}

@Injectable()
export class ArticleJobDraftImageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly draftEditService: ArticleJobDraftEditService,
  ) {}

  async uploadDraftImage(
    organizationId: string,
    projectId: string,
    jobId: string,
    file: Express.Multer.File | undefined,
  ): Promise<DraftImageUploadResult> {
    await this.draftEditService.assertDraftEditable(organizationId, projectId, jobId);

    if (!file?.buffer?.length) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '请选择要上传的图片');
    }

    if (file.size > MAX_BYTES) {
      throw new BusinessException(
        ErrorCodes.VALIDATION_ERROR,
        `图片不能超过 ${Math.round(MAX_BYTES / 1024 / 1024)}MB`,
      );
    }

    const contentType = file.mimetype?.trim().toLowerCase() ?? '';
    if (!ALLOWED_MIME.has(contentType)) {
      throw new BusinessException(
        ErrorCodes.VALIDATION_ERROR,
        '仅支持 JPEG、PNG、WebP、GIF 图片',
      );
    }

    const filename = `${uuidv4()}${extensionForDraftImageMime(contentType)}`;
    const key = buildDraftImageStorageKey(organizationId, projectId, jobId, filename);

    await this.storage.putObject(key, file.buffer, contentType);

    return {
      url: buildDraftImagePublicUrl(projectId, jobId, filename),
      filename,
      contentType,
      size: file.size,
    };
  }

  async getDraftImage(
    organizationId: string,
    projectId: string,
    jobId: string,
    filename: string,
  ): Promise<{ body: Buffer; contentType: string }> {
    assertDraftImageFilename(filename);

    const job = await this.prisma.articleJob.findFirst({
      where: { id: jobId, organizationId, projectId },
      select: { id: true },
    });

    if (!job) {
      throw new BusinessException(ErrorCodes.JOB_NOT_FOUND, '任务不存在');
    }

    const key = buildDraftImageStorageKey(organizationId, projectId, jobId, filename);
    const stored = await this.storage.getObject(key);
    if (!stored) {
      throw new BusinessException(ErrorCodes.NOT_FOUND, '图片不存在');
    }

    return {
      body: stored.body,
      contentType: stored.contentType ?? 'application/octet-stream',
    };
  }
}
