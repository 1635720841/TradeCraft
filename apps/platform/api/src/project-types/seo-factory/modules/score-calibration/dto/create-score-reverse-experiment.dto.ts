/**
 * 创建 Semrush 评分反推实验 DTO。
 */

import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import {
  SCORE_REVERSE_FACTOR_KEYS,
  SCORE_REVERSE_MAX_SUBMITTED_KEYWORDS,
  type ScoreReverseFactorKey,
} from '../../../utils/score-reverse-experiment.util';

export class CreateScoreReverseExperimentDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  targetKeyword!: string;

  @IsString({ each: true })
  @IsArray()
  @ArrayMaxSize(SCORE_REVERSE_MAX_SUBMITTED_KEYWORDS)
  @IsOptional()
  submittedKeywords?: string[];

  @IsString()
  @MinLength(80)
  @MaxLength(100_000)
  baselineContent!: string;

  @IsIn(SCORE_REVERSE_FACTOR_KEYS, { each: true })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(SCORE_REVERSE_FACTOR_KEYS.length)
  @IsOptional()
  factors?: ScoreReverseFactorKey[];
}
