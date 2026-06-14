/**
 * Prompt 模板管理 HTTP 入口（M12）。
 */

import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import type { RequestContext } from '@wm/shared-core';
import { Role } from '@wm/shared-core';
import { ReqCtx } from '../../core/decorators/request-context.decorator';
import { Roles } from '../../core/decorators/roles.decorator';
import { CreatePromptTemplateDto } from './dto/create-prompt-template.dto';
import { UpdatePromptBindingDto } from './dto/update-prompt-binding.dto';
import { UpdatePromptTemplateDto } from './dto/update-prompt-template.dto';
import { PromptBindingService } from './prompt-binding.service';
import { PromptService } from './prompt.service';

@Controller('api/v1/platform/prompts')
export class PromptController {
  constructor(
    private readonly promptService: PromptService,
    private readonly promptBindingService: PromptBindingService,
  ) {}

  @Get('runtime-bindings')
  async runtimeBindings(@ReqCtx() ctx: RequestContext) {
    const data = await this.promptBindingService.listRuntimeBindings();
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Patch('runtime-bindings/:slotId')
  @Roles(Role.ADMIN)
  async updateRuntimeBinding(
    @ReqCtx() ctx: RequestContext,
    @Param('slotId') slotId: string,
    @Body() dto: UpdatePromptBindingDto,
  ) {
    const data = await this.promptBindingService.updateBinding(slotId, dto.activeVersion);
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Get()
  async list(
    @ReqCtx() ctx: RequestContext,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.promptService.list(
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
    );
    return {
      data: result.items,
      meta: {
        traceId: ctx.traceId,
        pagination: { page: result.page, limit: result.limit, total: result.total },
      },
    };
  }

  @Get(':version')
  async getOne(@ReqCtx() ctx: RequestContext, @Param('version') version: string) {
    const row = await this.promptService.findOne(version);
    return { data: row, meta: { traceId: ctx.traceId } };
  }

  @Post()
  @Roles(Role.ADMIN)
  async create(@ReqCtx() ctx: RequestContext, @Body() dto: CreatePromptTemplateDto) {
    const row = await this.promptService.create(dto);
    return { data: row, meta: { traceId: ctx.traceId } };
  }

  @Patch(':version')
  @Roles(Role.ADMIN)
  async update(
    @ReqCtx() ctx: RequestContext,
    @Param('version') version: string,
    @Body() dto: UpdatePromptTemplateDto,
  ) {
    const row = await this.promptService.update(version, dto);
    return { data: row, meta: { traceId: ctx.traceId } };
  }

  @Delete(':version')
  @Roles(Role.ADMIN)
  async remove(@ReqCtx() ctx: RequestContext, @Param('version') version: string) {
    const data = await this.promptService.remove(version);
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Post(':version/cache/clear')
  @Roles(Role.ADMIN)
  async clearCache(@ReqCtx() ctx: RequestContext, @Param('version') version: string) {
    await this.promptService.findOne(version);
    await this.promptService.invalidateCache(version);
    return { data: { version, cleared: true }, meta: { traceId: ctx.traceId } };
  }
}
