/**
 * SEO 查分模块：本地评分 + Semrush 终检。
 */

import { Module } from '@nestjs/common';
import { PlaywrightQueueModule } from '../../playwright-queue.module';
import { ScoreCalibrationModule } from '../score-calibration/score-calibration.module';
import { LlmModule } from '../llm/llm.module';
import { SeoCheckerService } from './seo-checker.service';
import { SeoCheckerPipelineService } from './seo-checker-pipeline.service';
import { SeoCheckerLocalPipelineService } from './seo-checker-local-pipeline.service';
import { SeoCheckerSemrushPipelineService } from './seo-checker-semrush-pipeline.service';
import { SeoCheckerLifecycleService } from './seo-checker-lifecycle.service';
import { SeoCheckerProgressService } from './seo-checker-progress.service';
import { SeoCheckerRpaService } from './seo-checker-rpa.service';
import { SeoCheckerSemrushOptimizeService } from './seo-checker-semrush-optimize.service';

@Module({
  imports: [LlmModule, PlaywrightQueueModule, ScoreCalibrationModule],
  providers: [
    SeoCheckerProgressService,
    SeoCheckerRpaService,
    SeoCheckerSemrushOptimizeService,
    SeoCheckerLifecycleService,
    SeoCheckerLocalPipelineService,
    SeoCheckerSemrushPipelineService,
    SeoCheckerPipelineService,
    SeoCheckerService,
  ],
  exports: [SeoCheckerService],
})
export class SeoCheckerModule {}
