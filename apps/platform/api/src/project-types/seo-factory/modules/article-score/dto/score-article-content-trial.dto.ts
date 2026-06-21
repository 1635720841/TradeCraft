/**
 * 无任务上下文的内容评分试算 DTO（管理端）。
 */

import { Type, Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { normalizeArticleScoreContent } from '@wm/shared-core';

export class ScoreArticleContentTrialDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  targetKeyword!: string;

  @Transform(({ value }) =>
    normalizeArticleScoreContent(typeof value === 'string' ? value : ''),
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(200_000, { message: '正文过长（超过 20 万字符），请检查是否重复粘贴或误粘整页 HTML' })
  content!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  submittedKeywords?: string[];

  @IsOptional()
  @Type(() => Number)
  targetWordCount?: number;

  @IsOptional()
  @Type(() => Number)
  competitorWordCount?: number;
}
