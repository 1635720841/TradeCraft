/**
 * M10 导出文件下载 HTTP 入口。
 */

import { Controller, Get, Header, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { RequestContext } from '@wm/shared-core';
import { ReqCtx } from '../../../../core/decorators/request-context.decorator';
import { ProjectService } from '../../../../modules/project/project.service';
import { ExportService } from './export.service';
import { seoFactoryRoutes } from '../../constants/seo-factory-routes';

@Controller(seoFactoryRoutes('article-jobs'))
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
    await this.projectService.assertSeoJobRead(ctx.organizationId, projectId, ctx);
    const file = await this.exportService.getFreshExportHtml(
      ctx.organizationId,
      projectId,
      id,
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
    await this.projectService.assertSeoJobRead(ctx.organizationId, projectId, ctx);
    const file = await this.exportService.getExportObject(
      ctx.organizationId,
      projectId,
      id,
      'jsonld',
    );
    res.setHeader('Content-Type', file.contentType);
    res.send(file.body);
  }

  @Get(':id/export/package')
  @Header('Cache-Control', 'private, no-store')
  async downloadPackage(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.projectService.assertSeoJobRead(ctx.organizationId, projectId, ctx);
    const pack = await this.exportService.buildExportPackage(
      ctx.organizationId,
      projectId,
      id,
    );
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(pack.fileName)}`,
    );
    res.send(pack.buffer);
  }
}
