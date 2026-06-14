/**
 * 项目服务：CRUD 与 org 隔离查询。
 *
 * 边界：
 * - 不负责：项目类型插件内部业务
 *
 * 入口：
 * - ProjectService
 */

import { Injectable } from '@nestjs/common';
import { ProjectStatus } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { BusinessException } from '../../core/exceptions/business.exception';
import { ErrorCodes } from '../../core/exceptions/error-codes';
import type { CreateProjectDto } from './dto/create-project.dto';

@Injectable()
export class ProjectService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string, page = 1, limit = 20) {
    const safePage = Math.max(page, 1);
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const skip = (safePage - 1) * safeLimit;

    const [items, total] = await Promise.all([
      this.prisma.project.findMany({
        where: { organizationId },
        skip,
        take: safeLimit,
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, projectType: true, status: true, createdAt: true },
      }),
      this.prisma.project.count({ where: { organizationId } }),
    ]);

    return { items, page: safePage, limit: safeLimit, total };
  }

  async create(organizationId: string, dto: CreateProjectDto) {
    return this.prisma.project.create({
      data: {
        organizationId,
        name: dto.name.trim(),
        projectType: dto.projectType,
      },
      select: { id: true, name: true, projectType: true, status: true, createdAt: true },
    });
  }

  async findOne(organizationId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId },
      select: {
        id: true,
        name: true,
        projectType: true,
        status: true,
        config: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!project) {
      throw new BusinessException(ErrorCodes.NOT_FOUND, '项目不存在');
    }

    return project;
  }

  async archive(organizationId: string, projectId: string) {
    await this.assertAccessible(organizationId, projectId);
    return this.prisma.project.update({
      where: { id: projectId },
      data: { status: ProjectStatus.ARCHIVED },
      select: { id: true, name: true, projectType: true, status: true },
    });
  }

  async assertAccessible(organizationId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId },
      select: { id: true, status: true, projectType: true },
    });

    if (!project) {
      throw new BusinessException(ErrorCodes.NOT_FOUND, '项目不存在');
    }

    if (project.status === ProjectStatus.ARCHIVED) {
      throw new BusinessException(ErrorCodes.PROJECT_ARCHIVED, '项目已归档，无法操作');
    }

    return project;
  }
}
