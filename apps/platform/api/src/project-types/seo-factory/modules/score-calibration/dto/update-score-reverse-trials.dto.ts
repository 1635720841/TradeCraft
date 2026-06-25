/**
 * 更新 Semrush 评分反推实验重复检测结果 DTO。
 */

import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsISO8601, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { SCORE_REVERSE_FACTOR_KEYS } from '../../../utils/score-reverse-experiment.util';

const SCORE_REVERSE_VARIANT_KEYS = ['baseline', ...SCORE_REVERSE_FACTOR_KEYS] as const;

export class ScoreReverseTrialDto {
  @IsNumber()
  @Min(0)
  @Max(10)
  score!: number;

  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  round?: number;

  @IsString()
  @MaxLength(200)
  @IsOptional()
  nodeLabel?: string;

  @IsString()
  @MaxLength(200)
  @IsOptional()
  databaseLabel?: string;

  @IsISO8601()
  @IsOptional()
  checkedAt?: string;
}

export class UpdateScoreReverseTrialsDto {
  @IsIn(SCORE_REVERSE_VARIANT_KEYS)
  variantKey!: (typeof SCORE_REVERSE_VARIANT_KEYS)[number];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => ScoreReverseTrialDto)
  trials!: ScoreReverseTrialDto[];

  @IsString()
  @MaxLength(8_000)
  @IsOptional()
  observation?: string;
}
