/**
 * Prompt 模板服务：DB 存储、Redis 缓存、文件 fallback 加载。
 *
 * 边界：
 * - 不负责：LLM 调用（由 OpenAiCompatibleAdapter 处理）
 *
 * 入口：
 * - PromptService
 */

import { Injectable } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PrismaService } from '../../core/database/prisma.service';
import { BusinessException } from '../../core/exceptions/business.exception';
import { ErrorCodes } from '../../core/exceptions/error-codes';
import { LoggerService } from '../../core/logger/logger.service';
import { RedisService } from '../../core/redis/redis.service';
import type { CreatePromptTemplateDto } from './dto/create-prompt-template.dto';
import type { UpdatePromptTemplateDto } from './dto/update-prompt-template.dto';
import { buildPromptCacheKey, PROMPT_CACHE_TTL_SECONDS } from './prompt-cache.util';
import { getSlotMetadata, isPromptRuntimeSlotId } from './prompt-slot-metadata';

@Injectable()
export class PromptService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly logger: LoggerService,
  ) {}

  async list(page = 1, limit = 20) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
    const skip = (safePage - 1) * safeLimit;

    const [items, total] = await Promise.all([
      this.prisma.promptTemplate.findMany({
        skip,
        take: safeLimit,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          version: true,
          name: true,
          description: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.promptTemplate.count(),
    ]);

    return { items, page: safePage, limit: safeLimit, total };
  }

  async findOne(version: string) {
    const row = await this.prisma.promptTemplate.findUnique({
      where: { version },
    });

    if (!row) {
      throw new BusinessException(ErrorCodes.PROMPT_NOT_FOUND, `Prompt 模板不存在：${version}`);
    }

    return row;
  }

  async create(dto: CreatePromptTemplateDto) {
    const existing = await this.prisma.promptTemplate.findUnique({
      where: { version: dto.version },
      select: { id: true },
    });
    if (existing) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, `版本 ${dto.version} 已存在`);
    }

    const row = await this.prisma.promptTemplate.create({
      data: {
        version: dto.version,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        content: dto.content,
        isActive: dto.isActive ?? true,
      },
    });

    await this.invalidateCache(row.version);
    return row;
  }

  async update(version: string, dto: UpdatePromptTemplateDto) {
    await this.findOne(version);

    const row = await this.prisma.promptTemplate.update({
      where: { version },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description.trim() || null }
          : {}),
        ...(dto.content !== undefined ? { content: dto.content } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });

    await this.invalidateCache(version);
    return row;
  }

  async remove(version: string): Promise<{ version: string; deleted: true }> {
    await this.findOne(version);

    const bindings = await this.prisma.promptRuntimeBinding.findMany({
      where: { activeVersion: version },
      select: { slotId: true },
    });

    if (bindings.length > 0) {
      const labels = bindings.map((row) => {
        if (isPromptRuntimeSlotId(row.slotId)) {
          return getSlotMetadata(row.slotId).label;
        }
        return row.slotId;
      });
      throw new BusinessException(
        ErrorCodes.VALIDATION_ERROR,
        `无法删除：该版本正被「${labels.join('、')}」使用，请先在「当前线上配置」切换到其他版本`,
      );
    }

    await this.prisma.promptTemplate.delete({ where: { version } });
    await this.invalidateCache(version);

    this.logger.info('Prompt template deleted', {
      action: 'prompt.deleted',
      version,
    });

    return { version, deleted: true };
  }

  /** LLM 运行时加载：Redis → DB（isActive）→ prompts/*.md */
  async resolveContent(version: string): Promise<string> {
    const cacheKey = buildPromptCacheKey(version);
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return cached;
    }

    const row = await this.prisma.promptTemplate.findUnique({
      where: { version },
      select: { content: true, isActive: true },
    });

    if (row?.isActive) {
      await this.redis.setex(cacheKey, PROMPT_CACHE_TTL_SECONDS, row.content);
      return row.content;
    }

    const fileContent = await this.loadFromFile(version);
    if (fileContent) {
      await this.redis.setex(cacheKey, PROMPT_CACHE_TTL_SECONDS, fileContent);
      return fileContent;
    }

    throw new BusinessException(ErrorCodes.PROMPT_NOT_FOUND, `Prompt 模板不存在：${version}`);
  }

  async invalidateCache(version: string): Promise<void> {
    await this.redis.del(buildPromptCacheKey(version));
    this.logger.info('Prompt cache invalidated', {
      action: 'prompt.cache_invalidated',
      version,
    });
  }

  private getPromptsDir(): string {
    return join(process.cwd(), 'prompts');
  }

  private async loadFromFile(version: string): Promise<string | null> {
    const filePath = join(this.getPromptsDir(), `${version}.md`);
    try {
      return await readFile(filePath, 'utf-8');
    } catch {
      return null;
    }
  }
}
