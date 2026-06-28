/**
 * 文章内容评分试算 HTTP 入口（管理端：无任务上下文）。
 *
 * 边界：
 * - 不负责：评分算法（ArticleScoreService）
 */

import { Body, Controller, Param, Post } from '@nestjs/common';
import type { RequestContext } from '@wm/shared-core';
import { ReqCtx } from '../../../../core/decorators/request-context.decorator';
import { ProjectService } from '../../../../modules/project/project.service';
import { ScoreArticleContentTrialDto } from './dto/score-article-content-trial.dto';
import { ArticleScoreService } from './article-score.service';
import { seoFactoryRoutes } from '../../constants/seo-factory-routes';

@Controller(seoFactoryRoutes('content-score'))
export class ArticleScoreTrialController {
  constructor(
    private readonly articleScoreService: ArticleScoreService,
    private readonly projectService: ProjectService,
  ) {}

  /** 粘贴正文试算 Semrush 式内容分（不跑 RPA、不写库） */
  @Post('trial')
  async trial(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Body() dto: ScoreArticleContentTrialDto,
  ) {
    await this.projectService.assertSeoJobRead(ctx.organizationId, projectId, ctx);
    const data = await this.articleScoreService.scoreTrialContent(
      ctx.organizationId,
      projectId,
      dto,
      ctx.traceId,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }
}
