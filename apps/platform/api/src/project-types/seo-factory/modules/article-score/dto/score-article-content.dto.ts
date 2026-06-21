/**
 * 文章内容评分请求 DTO。
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

export class ScoreArticleContentDto {
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
  competitorWordCount?: number;
}
