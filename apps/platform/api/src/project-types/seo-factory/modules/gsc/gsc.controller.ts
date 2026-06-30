/**
 * Google Search Console HTTP 入口。
 *
 * 边界：
 * - 不负责：OAuth token 存储加密（后续可接 KMS）
 *
 * 入口：
 * - GscController
 * - GscOAuthController
 */

import { Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { RequestContext } from '@wm/shared-core';
import { Public } from '../../../../core/decorators/public.decorator';
import { ReqCtx } from '../../../../core/decorators/request-context.decorator';
import { LoggerService } from '../../../../core/logger/logger.service';
import { ProjectService } from '../../../../modules/project/project.service';
import { EntitlementsService } from '../../../../modules/billing/entitlements.service';
import { GscService } from './gsc.service';
import { seoFactoryRoutes } from '../../constants/seo-factory-routes';

@Controller(seoFactoryRoutes('sites/:siteId/gsc'))
export class GscController {
  constructor(
    private readonly gscService: GscService,
    private readonly projectService: ProjectService,
    private readonly entitlementsService: EntitlementsService,
  ) {}

  @Get()
  async status(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('siteId') siteId: string,
  ) {
    await this.projectService.assertSeoSiteManage(ctx.organizationId, projectId, ctx);
    const data = await this.gscService.getStatus(ctx.organizationId, projectId, siteId);
    return { data, meta: { traceId: ctx.traceId } };
  }

  @Post('sync')
  async sync(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('siteId') siteId: string,
  ) {
    await this.projectService.assertSeoSiteManage(ctx.organizationId, projectId, ctx);
    await this.entitlementsService.assertEntitlement(ctx.organizationId, 'gscEnabled');
    const data = await this.gscService.sync(ctx.organizationId, projectId, siteId);
    return { data, meta: { traceId: ctx.traceId } };
  }
}

@Controller(seoFactoryRoutes('gsc'))
export class GscProjectController {
  constructor(
    private readonly gscService: GscService,
    private readonly projectService: ProjectService,
  ) {}

  @Get('overview')
  async overview(@ReqCtx() ctx: RequestContext, @Param('projectId') projectId: string) {
    await this.projectService.assertSeoSiteManage(ctx.organizationId, projectId, ctx);
    const data = await this.gscService.getProjectOverview(ctx.organizationId, projectId);
    return { data, meta: { traceId: ctx.traceId } };
  }
}

@Controller('api/v1/oauth/gsc')
export class GscOAuthController {
  constructor(
    private readonly gscService: GscService,
    private readonly logger: LoggerService,
  ) {}

  @Public()
  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    const webOrigin = process.env.WEB_APP_ORIGIN?.trim() || 'http://localhost:5173';

    if (error || !code || !state) {
      res.redirect(`${webOrigin}/console/gsc?gsc=error`);
      return;
    }

    try {
      const redirectUrl = await this.gscService.handleOAuthCallback(code, state);
      res.redirect(redirectUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'GSC OAuth 回调失败';
      this.logger.warn('GSC OAuth callback failed', {
        action: 'gsc.oauth.callback',
        message,
      });
      res.redirect(`${webOrigin}/console/gsc?gsc=error`);
    }
  }
}
