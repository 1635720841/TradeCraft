/**
 * 文章内容评分模块。
 */

import { Module } from '@nestjs/common';
import { ProjectModule } from '../../../../modules/project/project.module';
import { ScoreCalibrationModule } from '../score-calibration/score-calibration.module';
import { ArticleScoreController } from './article-score.controller';
import { ArticleScoreTrialController } from './article-score-trial.controller';
import { ArticleScoreService } from './article-score.service';

@Module({
  imports: [ProjectModule, ScoreCalibrationModule],
  controllers: [ArticleScoreController, ArticleScoreTrialController],
  providers: [ArticleScoreService],
  exports: [ArticleScoreService],
})
export class ArticleScoreModule {}
