/**
 * 校准预测请求 DTO。
 */

import { Type } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class PredictSemrushScoreDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  targetKeyword!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200_000)
  content!: string;

  @IsOptional()
  @Type(() => Number)
  targetWordCount?: number;

  @IsOptional()
  @Type(() => Number)
  competitorWordCount?: number;
}
