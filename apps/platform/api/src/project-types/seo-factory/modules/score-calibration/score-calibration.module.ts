/**
 * 评分校准实验室模块。
 */

import { Module } from '@nestjs/common';
import { ProjectModule } from '../../../../modules/project/project.module';
import { ScoreCalibrationController } from './score-calibration.controller';
import { ScoreCalibrationService } from './score-calibration.service';

@Module({
  imports: [ProjectModule],
  controllers: [ScoreCalibrationController],
  providers: [ScoreCalibrationService],
  exports: [ScoreCalibrationService],
})
export class ScoreCalibrationModule {}
