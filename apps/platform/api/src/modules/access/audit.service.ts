/**
 * 操作审计写入。
 */

import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';

export interface AuditLogInput {
  organizationId?: string;
  actorUserId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  traceId?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: AuditLogInput): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        traceId: input.traceId,
      },
    });
  }

  async list(params: {
    page: number;
    limit: number;
    organizationId?: string;
    actorUserId?: string;
    actorKeyword?: string;
    action?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    const safePage = Math.max(1, params.page);
    const safeLimit = Math.min(100, Math.max(1, params.limit));
    const skip = (safePage - 1) * safeLimit;

    const createdAt: Prisma.DateTimeFilter | undefined =
      params.dateFrom || params.dateTo
        ? {
            ...(params.dateFrom ? { gte: new Date(params.dateFrom) } : {}),
            ...(params.dateTo ? { lte: new Date(params.dateTo) } : {}),
          }
        : undefined;

    let actorUserIdFilter: Prisma.StringFilter | string | undefined;
    if (params.actorUserId) {
      actorUserIdFilter = params.actorUserId;
    } else if (params.actorKeyword?.trim()) {
      const keyword = params.actorKeyword.trim();
      const matchingActors = await this.prisma.user.findMany({
        where: {
          OR: [
            { email: { contains: keyword, mode: 'insensitive' } },
            { name: { contains: keyword, mode: 'insensitive' } },
          ],
        },
        select: { id: true },
      });
      const actorIds = matchingActors.map((user) => user.id);
      actorUserIdFilter = actorIds.length > 0 ? { in: actorIds } : '__no_match__';
    }

    const where: Prisma.AuditLogWhereInput = {
      ...(params.organizationId ? { organizationId: params.organizationId } : {}),
      ...(actorUserIdFilter ? { actorUserId: actorUserIdFilter } : {}),
      ...(params.action ? { action: params.action } : {}),
      ...(createdAt ? { createdAt } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeLimit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    const actorIds = [...new Set(rows.map((row) => row.actorUserId))];
    const orgIds = [
      ...new Set(rows.map((row) => row.organizationId).filter((id): id is string => !!id)),
    ];

    const [actors, organizations] = await Promise.all([
      actorIds.length > 0
        ? this.prisma.user.findMany({
            where: { id: { in: actorIds } },
            select: { id: true, email: true, name: true, role: true },
          })
        : Promise.resolve([]),
      orgIds.length > 0
        ? this.prisma.organization.findMany({
            where: { id: { in: orgIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
    ]);

    const actorMap = new Map(actors.map((user) => [user.id, user]));
    const orgMap = new Map(organizations.map((org) => [org.id, org]));

    const items = rows.map((row) => {
      const actor = actorMap.get(row.actorUserId);
      const organization = row.organizationId ? orgMap.get(row.organizationId) : undefined;
      return {
        ...row,
        actorEmail: actor?.email ?? null,
        actorName: actor?.name ?? null,
        actorRole: actor?.role ?? null,
        organizationName: organization?.name ?? null,
      };
    });

    return { items, page: safePage, limit: safeLimit, total };
  }
}
