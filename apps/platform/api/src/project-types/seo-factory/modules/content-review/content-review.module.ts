/**
 * 内容审查模块（M7 YMYL）。
 *
 * 边界：
 * - 不负责：工作流编排（WorkflowService）
 */

import { Module } from '@nestjs/common';
import { ContentReviewService } from './content-review.service';

@Module({
  providers: [ContentReviewService],
  exports: [ContentReviewService],
})
export class ContentReviewModule {}
