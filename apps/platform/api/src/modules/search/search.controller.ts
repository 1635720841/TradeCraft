/**
 * 全局搜索 HTTP 入口。
 */

import { Controller, Get, Query } from '@nestjs/common';
import type { RequestContext } from '@wm/shared-core';
import { ReqCtx } from '../../core/decorators/request-context.decorator';
import { SearchService } from './search.service';

@Controller('api/v1/org/search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  async search(
    @ReqCtx() ctx: RequestContext,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.searchService.search(ctx, q ?? '', limit ? Number(limit) : 20);
    return { data, meta: { traceId: ctx.traceId } };
  }
}
