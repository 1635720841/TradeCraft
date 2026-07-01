/**
 * 媒体资产入库：下载远程图、写入对象存储并登记 MediaAsset。
 *
 * 边界：
 * - 不负责：业务配图植入（seo-factory illustration）
 *
 * 入口：
 * - MediaIngestService
 */

import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { MediaAssetSource } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { fetch } from 'undici';
import { BusinessException } from '../../core/exceptions/business.exception';
import { ErrorCodes } from '../../core/exceptions/error-codes';
import { PrismaService } from '../../core/database/prisma.service';
import { LoggerService } from '../../core/logger/logger.service';
import { StorageService } from '../../core/storage/storage.service';
import {
  MEDIA_ASSET_ALLOWED_MIME,
  MEDIA_ASSET_MAX_BYTES,
  MEDIA_ASSET_REMOTE_FETCH_TIMEOUT_MS,
} from './constants/media-asset';
import {
  buildMediaAssetPublicUrl,
  buildMediaAssetStorageKey,
  extensionForMediaMime,
} from './media-url.util';

export interface IngestMediaAssetResult {
  assetId: string;
  url: string;
  storageKey: string;
  contentType: string;
  sizeBytes: number;
}

interface IngestMediaBaseInput {
  organizationId: string;
  projectId: string;
  source: MediaAssetSource;
  sourceMeta?: Record<string, unknown>;
  createdBy?: string;
  /** 入库后立即增加引用计数（配图植入时 true） */
  bind?: boolean;
}

interface IngestFromBufferInput extends IngestMediaBaseInput {
  buffer: Buffer;
  contentType: string;
}

interface IngestFromRemoteUrlInput extends IngestMediaBaseInput {
  remoteUrl: string;
}

@Injectable()
export class MediaIngestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly logger: LoggerService,
  ) {}

  async ingestFromBuffer(input: IngestFromBufferInput): Promise<IngestMediaAssetResult> {
    this.assertBufferAllowed(input.buffer, input.contentType);
    return this.persistAsset(input.buffer, input.contentType, input);
  }

  async ingestFromRemoteUrl(input: IngestFromRemoteUrlInput): Promise<IngestMediaAssetResult> {
    const remoteUrl = input.remoteUrl.trim();
    if (!remoteUrl) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '远程图片地址不能为空');
    }

    const fetched = await this.fetchRemoteImage(remoteUrl);
    if (!fetched) {
      throw new BusinessException(
        ErrorCodes.EXTERNAL_API_ERROR,
        '远程图片下载失败，请稍后重试',
      );
    }

    this.assertBufferAllowed(fetched.body, fetched.contentType);

    return this.persistAsset(fetched.body, fetched.contentType, {
      ...input,
      sourceMeta: {
        ...(input.sourceMeta ?? {}),
        originalUrl: remoteUrl,
      },
    });
  }

  private async persistAsset(
    body: Buffer,
    contentType: string,
    input: IngestMediaBaseInput,
  ): Promise<IngestMediaAssetResult> {
    const assetId = uuidv4();
    const extension = extensionForMediaMime(contentType);
    const storageKey = buildMediaAssetStorageKey(
      input.organizationId,
      input.projectId,
      assetId,
      extension,
    );
    const contentHash = createHash('sha256').update(body).digest('hex');
    const referenceCount = input.bind ? 1 : 0;

    const existing = await this.prisma.mediaAsset.findFirst({
      where: {
        organizationId: input.organizationId,
        projectId: input.projectId,
        contentHash,
      },
    });

    if (existing) {
      try {
        await this.storage.deleteByPrefix(storageKey);
      } catch (cleanupError) {
        this.logger.warn('Media dedup orphan cleanup failed', {
          action: 'media.dedup_orphan_cleanup_failed',
          storageKey,
          error: cleanupError instanceof Error ? cleanupError.message : 'unknown',
        });
      }

      if (input.bind) {
        await this.prisma.mediaAsset.update({
          where: { id: existing.id },
          data: { referenceCount: { increment: 1 } },
        });
      }

      const url = buildMediaAssetPublicUrl(input.projectId, existing.id);

      this.logger.info('Media asset deduped by contentHash', {
        action: 'media.dedup',
        assetId: existing.id,
        organizationId: input.organizationId,
        projectId: input.projectId,
        contentHash,
        bind: input.bind === true,
      });

      return {
        assetId: existing.id,
        url,
        storageKey: existing.storageKey,
        contentType: existing.contentType,
        sizeBytes: existing.sizeBytes,
      };
    }

    await this.storage.putObject(storageKey, body, contentType);

    try {
      await this.prisma.mediaAsset.create({
        data: {
          id: assetId,
          organizationId: input.organizationId,
          projectId: input.projectId,
          storageKey,
          contentType,
          sizeBytes: body.length,
          source: input.source,
          sourceMeta: input.sourceMeta as object | undefined,
          contentHash,
          referenceCount,
          createdBy: input.createdBy,
        },
      });
    } catch (error) {
      try {
        await this.storage.deleteByPrefix(storageKey);
      } catch (cleanupError) {
        this.logger.warn('Media ingest rollback failed', {
          action: 'media.ingest_rollback_failed',
          storageKey,
          error: cleanupError instanceof Error ? cleanupError.message : 'unknown',
        });
      }
      throw error;
    }

    const url = buildMediaAssetPublicUrl(input.projectId, assetId);

    this.logger.info('Media asset ingested', {
      action: 'media.ingest',
      assetId,
      organizationId: input.organizationId,
      projectId: input.projectId,
      source: input.source,
      sizeBytes: body.length,
      bind: input.bind === true,
    });

    return {
      assetId,
      url,
      storageKey,
      contentType,
      sizeBytes: body.length,
    };
  }

  private assertBufferAllowed(buffer: Buffer, contentType: string): void {
    if (!buffer.length) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, '图片内容为空');
    }

    if (buffer.length > MEDIA_ASSET_MAX_BYTES) {
      throw new BusinessException(
        ErrorCodes.VALIDATION_ERROR,
        `图片不能超过 ${Math.round(MEDIA_ASSET_MAX_BYTES / 1024 / 1024)}MB`,
      );
    }

    const normalizedMime = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
    if (!MEDIA_ASSET_ALLOWED_MIME.has(normalizedMime)) {
      throw new BusinessException(
        ErrorCodes.VALIDATION_ERROR,
        '仅支持 JPEG、PNG、WebP、GIF 图片',
      );
    }
  }

  private async fetchRemoteImage(
    url: string,
  ): Promise<{ body: Buffer; contentType: string } | null> {
    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(MEDIA_ASSET_REMOTE_FETCH_TIMEOUT_MS),
        headers: { 'User-Agent': 'wm-media-ingest/1.0' },
      });

      if (!response.ok) return null;

      const arrayBuffer = await response.arrayBuffer();
      const body = Buffer.from(arrayBuffer);
      const rawContentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
      const contentType = MEDIA_ASSET_ALLOWED_MIME.has(rawContentType)
        ? rawContentType
        : `image/jpeg`;

      return { body, contentType };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn('Remote media fetch failed', {
        action: 'media.remote_fetch_failed',
        error: message,
      });
      return null;
    }
  }
}
