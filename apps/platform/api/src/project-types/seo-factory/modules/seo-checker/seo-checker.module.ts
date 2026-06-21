/**
 * SEO 查分模块：本地评分 + Semrush 终检。
 */

import { Module } from '@nestjs/common';
import { PlaywrightQueueModule } from '../../playwright-queue.module';
import { ScoreCalibrationModule } from '../score-calibration/score-calibration.module';
import { LlmModule } from '../llm/llm.module';
import { SeoCheckerService } from './seo-checker.service';

@Module({
  imports: [LlmModule, PlaywrightQueueModule, ScoreCalibrationModule],
  providers: [SeoCheckerService],
  exports: [SeoCheckerService],
})
export class SeoCheckerModule {}
