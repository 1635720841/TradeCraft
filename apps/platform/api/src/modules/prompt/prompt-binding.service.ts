/**
 * Prompt 功能槽位 ↔ 版本绑定：DB 持久化 + Redis 缓存，供 LLM 运行时读取。
 */

import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { BusinessException } from '../../core/exceptions/business.exception';
import { ErrorCodes } from '../../core/exceptions/error-codes';
import { LoggerService } from '../../core/logger/logger.service';
import { RedisService } from '../../core/redis/redis.service';
import {
  getSlotMetadata,
  isPromptRuntimeSlotId,
  PROMPT_DEFAULT_VERSIONS,
  PROMPT_LEGACY_VERSION_HINTS,
  PROMPT_RUNTIME_SLOT_IDS,
  type PromptRuntimeSlot,
  type PromptRuntimeSlotId,
} from './prompt-slot-metadata';
import { PromptService } from './prompt.service';

const BINDINGS_CACHE_KEY = 'prompt:bindings:map';
const BINDINGS_CACHE_TTL_SECONDS = 300;

@Injectable()
export class PromptBindingService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly promptService: PromptService,
    private readonly logger: LoggerService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureDefaultBindings();
  }

  async getActiveVersion(slotId: PromptRuntimeSlotId): Promise<string> {
    const map = await this.loadBindingMap();
    return map.get(slotId) ?? PROMPT_DEFAULT_VERSIONS[slotId];
  }

  async listRuntimeBindings(): Promise<PromptRuntimeSlot[]> {
    const map = await this.loadBindingMap();
    const rows = await this.prisma.promptRuntimeBinding.findMany({
      select: { slotId: true, updatedAt: true },
    });
    const updatedAtMap = new Map(rows.map((row) => [row.slotId, row.updatedAt]));

    return PROMPT_RUNTIME_SLOT_IDS.map((slotId) => {
      const meta = getSlotMetadata(slotId);
      return {
        ...meta,
        activeVersion: map.get(slotId) ?? PROMPT_DEFAULT_VERSIONS[slotId],
        bindingUpdatedAt: updatedAtMap.get(slotId)?.toISOString(),
      };
    });
  }

  async updateBinding(
    slotId: string,
    activeVersion: string,
  ): Promise<PromptRuntimeSlot> {
    if (!isPromptRuntimeSlotId(slotId)) {
      throw new BusinessException(ErrorCodes.VALIDATION_ERROR, `无效的功能槽位：${slotId}`);
    }

    const template = await this.prisma.promptTemplate.findUnique({
      where: { version: activeVersion },
      select: { version: true, isActive: true, name: true },
    });

    if (!template) {
      throw new BusinessException(
        ErrorCodes.PROMPT_NOT_FOUND,
        `版本 ${activeVersion} 不存在，请先在版本库中创建`,
      );
    }

    if (!template.isActive) {
      throw new BusinessException(
        ErrorCodes.VALIDATION_ERROR,
        `版本 ${activeVersion} 已停用，请启用后再绑定`,
      );
    }

    const row = await this.prisma.promptRuntimeBinding.upsert({
      where: { slotId },
      create: { slotId, activeVersion },
      update: { activeVersion },
    });

    await this.invalidateBindingsCache();
    await this.promptService.invalidateCache(activeVersion);

    this.logger.info('Prompt binding updated', {
      action: 'prompt.binding_updated',
      slotId,
      activeVersion,
    });

    const meta = getSlotMetadata(slotId);
    return {
      ...meta,
      activeVersion: row.activeVersion,
      bindingUpdatedAt: row.updatedAt.toISOString(),
    };
  }

  describePromptUsage(
    version: string,
    bindings?: PromptRuntimeSlot[],
  ): { category: 'active' | 'legacy' | 'unused'; label: string; hint?: string } {
    const slots = bindings ?? [];
    const slot = slots.find((item) => item.activeVersion === version);
    if (slot) {
      return { category: 'active', label: slot.label };
    }
    const legacyHint = PROMPT_LEGACY_VERSION_HINTS[version];
    if (legacyHint) {
      return { category: 'legacy', label: '历史版本', hint: legacyHint };
    }
    return {
      category: 'unused',
      label: '未接入',
      hint: '可在上方「当前线上配置」中绑定到某个功能',
    };
  }

  private async ensureDefaultBindings(): Promise<void> {
    for (const slotId of PROMPT_RUNTIME_SLOT_IDS) {
      await this.prisma.promptRuntimeBinding.upsert({
        where: { slotId },
        create: {
          slotId,
          activeVersion: PROMPT_DEFAULT_VERSIONS[slotId],
        },
        update: {},
      });
    }
  }

  private async loadBindingMap(): Promise<Map<string, string>> {
    const cached = await this.redis.get(BINDINGS_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as Record<string, string>;
      return new Map(Object.entries(parsed));
    }

    const rows = await this.prisma.promptRuntimeBinding.findMany({
      select: { slotId: true, activeVersion: true },
    });

    if (rows.length === 0) {
      await this.ensureDefaultBindings();
      return this.loadBindingMap();
    }

    const map = new Map(rows.map((row) => [row.slotId, row.activeVersion]));
    await this.redis.setex(
      BINDINGS_CACHE_KEY,
      BINDINGS_CACHE_TTL_SECONDS,
      JSON.stringify(Object.fromEntries(map)),
    );
    return map;
  }

  private async invalidateBindingsCache(): Promise<void> {
    await this.redis.del(BINDINGS_CACHE_KEY);
  }
}
