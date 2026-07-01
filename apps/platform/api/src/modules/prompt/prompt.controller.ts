/**
 * Prompt 模板管理 HTTP 入口（M12）。
 */

import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import type { RequestContext } from '@wm/shared-core';
import { Role } from '@wm/shared-core';
import { ReqCtx } from '../../core/decorators/request-context.decorator';
import { Permissions } from '../../core/decorators/permissions.decorator';
import { Roles } from '../../core/decorators/roles.decorator';
import { CreatePromptTemplateDto } from './dto/create-prompt-template.dto';
import { UpdatePromptBindingDto } from './dto/update-prompt-binding.dto';
import { UpdatePromptTemplateDto } from './dto/update-prompt-template.dto';
import { AuditService } from '../access/audit.service';
import { parsePageLimit } from '../../core/utils/parse-page-limit.util';
import { PromptBindingService } from './prompt-binding.service';
import { PromptService } from './prompt.service';

@Controller('api/v1/console/prompts')
@Roles(Role.SUPER_ADMIN, Role.PLATFORM_OPERATOR)
export class PromptController {
  constructor(
    private readonly promptService: PromptService,
    private readonly promptBindingService: PromptBindingService,
    private readonly auditService: AuditService,
  ) {}

  @Get('runtime-bindings')
  @Permissions('console:prompt:read')
  async runtimeBindings(@ReqCtx() ctx: RequestContext) {
    const data = await this.promptBindingService.listRuntimeBindings();
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Patch('runtime-bindings/:slotId')
  @Permissions('console:prompt:manage')
  async updateRuntimeBinding(
    @ReqCtx() ctx: RequestContext,
    @Param('slotId') slotId: string,
    @Body() dto: UpdatePromptBindingDto,
  ) {
    const data = await this.promptBindingService.updateBinding(slotId, dto.activeVersion);
    await this.auditService.log({
      actorUserId: ctx.userId,
      action: 'console.prompt.update',
      targetType: 'PromptBinding',
      targetId: slotId,
      metadata: { activeVersion: dto.activeVersion },
      traceId: ctx.traceId,
    });
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Get()
  @Permissions('console:prompt:read')
  async list(
    @ReqCtx() ctx: RequestContext,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const { page: safePage, limit: safeLimit } = parsePageLimit(page, limit);
    const result = await this.promptService.list(safePage, safeLimit);
    return {
      data: result.items,
      meta: {
        traceId: ctx.traceId,
        pagination: { page: result.page, limit: result.limit, total: result.total },
      },
    };
  }

  @Get(':version')
  @Permissions('console:prompt:read')
  async getOne(@ReqCtx() ctx: RequestContext, @Param('version') version: string) {
    const row = await this.promptService.findOne(version);
    return { data: row, meta: { traceId: ctx.traceId } };
  }

  @Post()
  @Permissions('console:prompt:manage')
  async create(@ReqCtx() ctx: RequestContext, @Body() dto: CreatePromptTemplateDto) {
    const row = await this.promptService.create(dto);
    await this.auditService.log({
      actorUserId: ctx.userId,
      action: 'console.prompt.create',
      targetType: 'PromptTemplate',
      targetId: row.version,
      traceId: ctx.traceId,
    });
    return { data: row, meta: { traceId: ctx.traceId } };
  }

  @Patch(':version')
  @Permissions('console:prompt:manage')
  async update(
    @ReqCtx() ctx: RequestContext,
    @Param('version') version: string,
    @Body() dto: UpdatePromptTemplateDto,
  ) {
    const row = await this.promptService.update(version, dto);
    await this.auditService.log({
      actorUserId: ctx.userId,
      action: 'console.prompt.update',
      targetType: 'PromptTemplate',
      targetId: version,
      metadata: { fields: Object.keys(dto) },
      traceId: ctx.traceId,
    });
    return { data: row, meta: { traceId: ctx.traceId } };
  }

  @Delete(':version')
  @Permissions('console:prompt:manage')
  async remove(@ReqCtx() ctx: RequestContext, @Param('version') version: string) {
    const data = await this.promptService.remove(version);
    await this.auditService.log({
      actorUserId: ctx.userId,
      action: 'console.prompt.delete',
      targetType: 'PromptTemplate',
      targetId: version,
      traceId: ctx.traceId,
    });
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Post(':version/cache/clear')
  @Permissions('console:prompt:manage')
  async clearCache(@ReqCtx() ctx: RequestContext, @Param('version') version: string) {
    await this.promptService.findOne(version);
    await this.promptService.invalidateCache(version);
    await this.auditService.log({
      actorUserId: ctx.userId,
      action: 'console.prompt.cache_clear',
      targetType: 'PromptTemplate',
      targetId: version,
      traceId: ctx.traceId,
    });
    return { data: { version, cleared: true }, meta: { traceId: ctx.traceId } };
  }
}
