/**
 * 手动录入校准样本 DTO：从 Semrush 粘贴正文并填写真分。
 */

import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateManualCalibrationSampleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  targetKeyword!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200_000)
  content!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10)
  semrushOverall!: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  semrushNodeLabel?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(50_000)
  semrushCurrentWordCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(50_000)
  semrushCompetitorWordCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  semrushReadabilityScore?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  submittedKeywords?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(50_000)
  targetWordCount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  sourceNote?: string;
}
