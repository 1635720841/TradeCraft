/**
 * M10 导出文件下载 HTTP 入口。
 */

import { Controller, Get, Header, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { RequestContext } from '@wm/shared-core';
import { ReqCtx } from '../../../../core/decorators/request-context.decorator';
import { ProjectService } from '../../../../modules/project/project.service';
import { ExportService } from './export.service';

@Controller('api/v1/projects/:projectId/article-jobs')
export class ExportController {
  constructor(
    private readonly exportService: ExportService,
    private readonly projectService: ProjectService,
  ) {}

  @Get(':id/export/html')
  @Header('Cache-Control', 'private, max-age=60')
  async downloadHtml(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.projectService.assertAccessible(ctx.organizationId, projectId);
    const file = await this.exportService.getExportObject(
      ctx.organizationId,
      projectId,
      id,
      'html',
    );
    res.setHeader('Content-Type', file.contentType);
    res.send(file.body);
  }

  @Get(':id/export/jsonld')
  @Header('Cache-Control', 'private, max-age=60')
  async downloadJsonLd(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.projectService.assertAccessible(ctx.organizationId, projectId);
    const file = await this.exportService.getExportObject(
      ctx.organizationId,
      projectId,
      id,
      'jsonld',
    );
    res.setHeader('Content-Type', file.contentType);
    res.send(file.body);
  }
}
