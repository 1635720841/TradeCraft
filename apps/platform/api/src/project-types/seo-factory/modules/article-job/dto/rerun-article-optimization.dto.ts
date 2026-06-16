import { IsIn, IsOptional } from 'class-validator';

export class RerunArticleOptimizationDto {
  @IsOptional()
  @IsIn(['gsc_underperform', 'manual'])
  reason?: 'gsc_underperform' | 'manual';
}
