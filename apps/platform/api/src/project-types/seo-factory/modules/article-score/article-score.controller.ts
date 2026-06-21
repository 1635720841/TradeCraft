/**
 * 文章内容评分 HTTP 入口（运营：改稿页即时评分）。
 *
 * 边界：
 * - 不负责：评分算法细节（ArticleScoreService）
 *
 * 入口：
 * - ArticleScoreController
 */

import { Body, Controller, Param, Post } from '@nestjs/common';
import type { RequestContext } from '@wm/shared-core';
import { ReqCtx } from '../../../../core/decorators/request-context.decorator';
import { ProjectService } from '../../../../modules/project/project.service';
import { ScoreArticleContentDto } from './dto/score-article-content.dto';
import { ArticleScoreService } from './article-score.service';

@Controller('api/v1/projects/:projectId/article-jobs')
export class ArticleScoreController {
  constructor(
    private readonly articleScoreService: ArticleScoreService,
    private readonly projectService: ProjectService,
  ) {}

  /** 对当前稿件正文做 Semrush 式内容评分（本地 + 校准，秒级） */
  @Post(':jobId/content-score')
  async scoreContent(
    @ReqCtx() ctx: RequestContext,
    @Param('projectId') projectId: string,
    @Param('jobId') jobId: string,
    @Body() dto: ScoreArticleContentDto,
  ) {
    await this.projectService.assertAccessible(ctx.organizationId, projectId);
    const data = await this.articleScoreService.scoreJobContent(
      ctx.organizationId,
      projectId,
      jobId,
      dto,
      ctx.traceId,
    );
    return { data, meta: { traceId: ctx.traceId } };
  }
}
