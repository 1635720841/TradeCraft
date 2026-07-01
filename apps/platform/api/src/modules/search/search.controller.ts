/**
 * 全局搜索 HTTP 入口。
 */

import { Controller, Get, Query } from '@nestjs/common';
import type { RequestContext } from '@wm/shared-core';
import { ReqCtx } from '../../core/decorators/request-context.decorator';
import { parsePageLimit } from '../../core/utils/parse-page-limit.util';
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
    const { limit: safeLimit } = parsePageLimit('1', limit, { page: 1, limit: 20 });
    const data = await this.searchService.search(ctx, q ?? '', safeLimit);
    return { data, meta: { traceId: ctx.traceId } };
  }
}
