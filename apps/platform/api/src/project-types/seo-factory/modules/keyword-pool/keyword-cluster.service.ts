/**
 * 主题集群服务：分组管理、进度统计与关键词归属。
 *
 * 边界：
 * - 不负责：关键词优先级计算（KeywordPoolService）
 *
 * 入口：
 * - KeywordClusterService
 */

import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { KeywordStatus } from '@prisma/client';
import { PrismaService } from '../../../../core/database/prisma.service';
import { BusinessException } from '../../../../core/exceptions/business.exception';
import { ErrorCodes } from '../../../../core/exceptions/error-codes';
import type { AssignKeywordsToClusterDto } from './dto/assign-keywords-to-cluster.dto';
import type { CreateKeywordClusterDto } from './dto/create-keyword-cluster.dto';
import type { UpdateKeywordClusterDto } from './dto/update-keyword-cluster.dto';
import { KeywordPoolService } from './keyword-pool.service';

const clusterSelect = {
  id: true,
  name: true,
  description: true,
  pillarKeywordId: true,
  pillarKeyword: { select: { id: true, keyword: true } },
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class KeywordClusterService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => KeywordPoolService))
    private readonly keywordPoolService: KeywordPoolService,
  ) {}

  async findMany(organizationId: string, projectId: string) {
    const clusters = await this.prisma.keywordCluster.findMany({
      where: { organizationId, projectId },
      select: clusterSelect,
      orderBy: [{ name: 'asc' }],
    });

    if (clusters.length === 0) {
      return [];
    }

    const stats = await this.prisma.keywordEntry.groupBy({
      by: ['clusterId', 'status'],
      where: {
        organizationId,
        projectId,
        clusterId: { in: clusters.map((item) => item.id) },
      },
      _count: { _all: true },
    });

    const statsMap = new Map<string, { total: number; pending: number; used: number }>();

    for (const row of stats) {
      if (!row.clusterId) continue;
      const current = statsMap.get(row.clusterId) ?? { total: 0, pending: 0, used: 0 };
      current.total += row._count._all;
      if (row.status === KeywordStatus.USED) {
        current.used += row._count._all;
      } else if (row.status === KeywordStatus.PENDING || row.status === KeywordStatus.APPROVED) {
        current.pending += row._count._all;
      }
      statsMap.set(row.clusterId, current);
    }

    return clusters.map((cluster) => {
      const counts = statsMap.get(cluster.id) ?? { total: 0, pending: 0, used: 0 };
      return {
        ...cluster,
        keywordCount: counts.total,
        pendingCount: counts.pending,
        usedCount: counts.used,
        progressPercent:
          counts.total > 0 ? Math.round((counts.used / counts.total) * 100) : 0,
      };
    });
  }

  async create(organizationId: string, projectId: string, dto: CreateKeywordClusterDto) {
    const name = this.normalizeName(dto.name);

    const existing = await this.prisma.keywordCluster.findFirst({
      where: { projectId, name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });

    if (existing) {
      throw new BusinessException(ErrorCodes.KEYWORD_CLUSTER_EXISTS, '该项目下已存在同名主题集群');
    }

    return this.prisma.keywordCluster.create({
      data: {
        organizationId,
        projectId,
        name,
        description: dto.description?.trim() || null,
      },
      select: clusterSelect,
    });
  }

  async update(
    organizationId: string,
    projectId: string,
    id: string,
    dto: UpdateKeywordClusterDto,
  ) {
    await this.findOne(organizationId, projectId, id);

    if (dto.name) {
      const name = this.normalizeName(dto.name);
      const duplicate = await this.prisma.keywordCluster.findFirst({
        where: {
          projectId,
          id: { not: id },
          name: { equals: name, mode: 'insensitive' },
        },
        select: { id: true },
      });

      if (duplicate) {
        throw new BusinessException(ErrorCodes.KEYWORD_CLUSTER_EXISTS, '该项目下已存在同名主题集群');
      }
    }

    if (dto.pillarKeywordId !== undefined && dto.pillarKeywordId !== null) {
      const pillar = await this.prisma.keywordEntry.findFirst({
        where: {
          id: dto.pillarKeywordId,
          organizationId,
          projectId,
          clusterId: id,
        },
        select: { id: true },
      });

      if (!pillar) {
        throw new BusinessException(
          ErrorCodes.VALIDATION_ERROR,
          '支柱关键词必须属于当前主题集群',
        );
      }
    }

    return this.prisma.keywordCluster.update({
      where: { id },
      data: {
        name: dto.name ? this.normalizeName(dto.name) : undefined,
        description: dto.description === undefined ? undefined : dto.description?.trim() || null,
        pillarKeywordId: dto.pillarKeywordId === undefined ? undefined : dto.pillarKeywordId,
      },
      select: clusterSelect,
    });
  }

  async remove(organizationId: string, projectId: string, id: string) {
    await this.findOne(organizationId, projectId, id);

    await this.prisma.$transaction([
      this.prisma.keywordEntry.updateMany({
        where: { organizationId, projectId, clusterId: id },
        data: { clusterId: null },
      }),
      this.prisma.keywordCluster.delete({ where: { id } }),
    ]);

    return { deleted: true };
  }

  async assignKeywords(
    organizationId: string,
    projectId: string,
    id: string,
    dto: AssignKeywordsToClusterDto,
  ) {
    await this.findOne(organizationId, projectId, id);

    const uniqueIds = [...new Set(dto.keywordIds)];
    const entries = await this.prisma.keywordEntry.findMany({
      where: {
        id: { in: uniqueIds },
        organizationId,
        projectId,
      },
      select: { id: true },
    });

    if (entries.length !== uniqueIds.length) {
      throw new BusinessException(ErrorCodes.KEYWORD_NOT_FOUND, '部分关键词不存在或无权访问');
    }

    await this.prisma.keywordEntry.updateMany({
      where: { id: { in: uniqueIds }, organizationId, projectId },
      data: { clusterId: id },
    });

    return { assigned: uniqueIds.length };
  }

  async createJobsFromCluster(
    organizationId: string,
    projectId: string,
    clusterId: string,
    siteId?: string,
  ) {
    await this.findOne(organizationId, projectId, clusterId);

    const entries = await this.prisma.keywordEntry.findMany({
      where: {
        organizationId,
        projectId,
        clusterId,
        status: { in: [KeywordStatus.PENDING, KeywordStatus.APPROVED] },
      },
      select: { id: true },
      orderBy: [{ priorityScore: 'desc' }, { updatedAt: 'desc' }],
    });

    if (entries.length === 0) {
      throw new BusinessException(
        ErrorCodes.VALIDATION_ERROR,
        '该主题下没有可入队的关键词（需为待筛选或已通过，且未归档）',
      );
    }

    return this.keywordPoolService.createJobsFromKeywords(
      organizationId,
      projectId,
      entries.map((entry) => entry.id),
      siteId,
    );
  }

  async findOrCreateByName(
    organizationId: string,
    projectId: string,
    rawName: string,
  ): Promise<string> {
    const name = this.normalizeName(rawName);
    const existing = await this.prisma.keywordCluster.findFirst({
      where: { projectId, name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });

    if (existing) {
      return existing.id;
    }

    const created = await this.prisma.keywordCluster.create({
      data: { organizationId, projectId, name },
      select: { id: true },
    });

    return created.id;
  }

  private async findOne(organizationId: string, projectId: string, id: string) {
    const cluster = await this.prisma.keywordCluster.findFirst({
      where: { id, organizationId, projectId },
      select: clusterSelect,
    });

    if (!cluster) {
      throw new BusinessException(ErrorCodes.KEYWORD_CLUSTER_NOT_FOUND, '主题集群不存在');
    }

    return cluster;
  }

  private normalizeName(value: string): string {
    return value.trim().replace(/\s+/g, ' ');
  }
}
