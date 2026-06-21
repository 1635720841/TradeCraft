/**
 * 站点工作流开关 DTO。
 */

import { IsBoolean, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class SiteWorkflowSettingsDto {
  @IsOptional()
  @IsBoolean()
  requireBriefApproval?: boolean;

  @IsOptional()
  @IsBoolean()
  enableParaphrase?: boolean;

  @IsOptional()
  @IsBoolean()
  enableIllustration?: boolean;

  @IsOptional()
  @IsBoolean()
  scoreCalibrationShadow?: boolean;

  @IsOptional()
  @IsBoolean()
  scoreCalibrationReduceRpa?: boolean;

  @IsOptional()
  @IsBoolean()
  scoreCalibrationLocalAlign?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(70)
  @Max(100)
  localPassThreshold?: number;

  @IsOptional()
  @IsNumber()
  @Min(7)
  @Max(10)
  semrushPassThreshold?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(15)
  localMaxOptimizeRounds?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  localRetryExtraRounds?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(15)
  semrushMaxOptimizeRounds?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  semrushRetryExtraRounds?: number;
}
