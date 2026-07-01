/**
 * 媒体资产库：查询、读取、引用计数与删除。
 *
 * 边界：
 * - 不负责：远程下载入库（MediaIngestService）
 *
 * 入口：
 * - MediaService
 */

import { Injectable } from '@nestjs/common';
import { MediaAssetSource } from '@prisma/client';
import { BusinessException } from '../../core/exceptions/business.exception';
import { ErrorCodes } from '../../core/exceptions/error-codes';
import { PrismaService } from '../../core/database/prisma.service';
import { LoggerService } from '../../core/logger/logger.service';
import { StorageService } from '../../core/storage/storage.service';
import { parsePageLimit } from '../../core/utils/parse-page-limit.util';
import { fromMediaAssetSource } from './media-source.util';
import { buildMediaAssetPublicUrl } from './media-url.util';

export interface MediaAssetDto {
  id: string;
  projectId: string;
  contentType: string;
  sizeBytes: number;
  source: 'bfl' | 'upload' | 'url';
  sourceMeta: Record<string, unknown> | null;
  referenceCount: number;
  url: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly logger: LoggerService,
  ) {}

  async list(
    organizationId: string,
    projectId: string,
    page?: string,
    limit?: string,
    source?: MediaAssetSource,
  ) {
    const { page: safePage, limit: safeLimit } = parsePageLimit(page, limit);
    const skip = (safePage - 1) * safeLimit;

    const where = {
      organizationId,
      projectId,
      ...(source ? { source } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.mediaAsset.findMany({
        where,
        skip,
        take: safeLimit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.mediaAsset.count({ where }),
    ]);

    return {
      items: rows.map((row) => this.toDto(row, projectId)),
      page: safePage,
      limit: safeLimit,
      total,
    };
  }

  async getOne(organizationId: string, projectId: string, assetId: string): Promise<MediaAssetDto> {
    const row = await this.findAssetOrThrow(organizationId, projectId, assetId);
    return this.toDto(row, projectId);
  }

  async getOneForPublicServe(projectId: string, assetId: string) {
    const row = await this.prisma.mediaAsset.findFirst({
      where: { id: assetId, projectId },
      select: { id: true, organizationId: true },
    });

    if (!row) {
      throw new BusinessException(ErrorCodes.MEDIA_ASSET_NOT_FOUND, '媒体资产不存在');
    }

    return row;
  }

  async getObjectBytes(
    organizationId: string,
    projectId: string,
    assetId: string,
  ): Promise<{ body: Buffer; contentType: string }> {
    const row = await this.findAssetOrThrow(organizationId, projectId, assetId);
    const stored = await this.storage.getObject(row.storageKey);
    if (!stored) {
      throw new BusinessException(ErrorCodes.MEDIA_ASSET_NOT_FOUND, '媒体文件不存在');
    }

    return {
      body: stored.body,
      contentType: stored.contentType ?? row.contentType,
    };
  }

  async bindAsset(organizationId: string, projectId: string, assetId: string): Promise<void> {
    const updated = await this.prisma.mediaAsset.updateMany({
      where: { id: assetId, organizationId, projectId },
      data: { referenceCount: { increment: 1 } },
    });

    if (updated.count === 0) {
      throw new BusinessException(ErrorCodes.MEDIA_ASSET_NOT_FOUND, '媒体资产不存在');
    }
  }

  async unbindAsset(organizationId: string, projectId: string, assetId: string): Promise<void> {
    const row = await this.findAssetOrThrow(organizationId, projectId, assetId);
    if (row.referenceCount <= 0) return;

    await this.prisma.mediaAsset.update({
      where: { id: assetId },
      data: { referenceCount: { decrement: 1 } },
    });
  }

  async syncAssetBindings(
    organizationId: string,
    projectId: string,
    previousAssetIds: string[],
    nextAssetIds: string[],
  ): Promise<void> {
    const prev = new Set(previousAssetIds.filter(Boolean));
    const next = new Set(nextAssetIds.filter(Boolean));

    const toUnbind = [...prev].filter((id) => !next.has(id));
    const toBind = [...next].filter((id) => !prev.has(id));

    await Promise.all([
      ...toUnbind.map((assetId) => this.unbindAsset(organizationId, projectId, assetId)),
      ...toBind.map((assetId) => this.bindAsset(organizationId, projectId, assetId)),
    ]);
  }

  async deleteAsset(
    organizationId: string,
    projectId: string,
    assetId: string,
  ): Promise<void> {
    const row = await this.findAssetOrThrow(organizationId, projectId, assetId);

    if (row.referenceCount > 0) {
      throw new BusinessException(
        ErrorCodes.VALIDATION_ERROR,
        '该文件仍被引用，无法删除',
      );
    }

    await this.storage.deleteByPrefix(row.storageKey);
    await this.prisma.mediaAsset.delete({ where: { id: assetId } });

    this.logger.info('Media asset deleted', {
      action: 'media.delete',
      assetId,
      organizationId,
      projectId,
    });
  }

  private async findAssetOrThrow(
    organizationId: string,
    projectId: string,
    assetId: string,
  ) {
    const row = await this.prisma.mediaAsset.findFirst({
      where: { id: assetId, organizationId, projectId },
    });

    if (!row) {
      throw new BusinessException(ErrorCodes.MEDIA_ASSET_NOT_FOUND, '媒体资产不存在');
    }

    return row;
  }

  private toDto(
    row: {
      id: string;
      projectId: string;
      contentType: string;
      sizeBytes: number;
      source: MediaAssetSource;
      sourceMeta: unknown;
      referenceCount: number;
      createdBy: string | null;
      createdAt: Date;
      updatedAt: Date;
    },
    projectId: string,
  ): MediaAssetDto {
    return {
      id: row.id,
      projectId: row.projectId,
      contentType: row.contentType,
      sizeBytes: row.sizeBytes,
      source: fromMediaAssetSource(row.source),
      sourceMeta:
        row.sourceMeta && typeof row.sourceMeta === 'object'
          ? (row.sourceMeta as Record<string, unknown>)
          : null,
      referenceCount: row.referenceCount,
      url: buildMediaAssetPublicUrl(projectId, row.id),
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
