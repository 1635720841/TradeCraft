/**
 * 评分校准实验室模块。
 */

import { Module } from '@nestjs/common';
import { ProjectModule } from '../../../../modules/project/project.module';
import { ScoreCalibrationController } from './score-calibration.controller';
import { ScoreCalibrationService } from './score-calibration.service';
import { ScoreReverseExperimentService } from './score-reverse-experiment.service';
import { SeoFactoryProvidersModule } from '../../providers/seo-factory-providers.module';
import { PlaywrightQueueModule } from '../../playwright-queue.module';

@Module({
  imports: [ProjectModule, SeoFactoryProvidersModule, PlaywrightQueueModule],
  controllers: [ScoreCalibrationController],
  providers: [ScoreCalibrationService, ScoreReverseExperimentService],
  exports: [ScoreCalibrationService],
})
export class ScoreCalibrationModule {}
