import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { MAX_BATCH_JOB_LIMIT, MAX_SERP_ARTICLE_LIMIT } from '../../../constants/serp-filter';

const CONTENT_LANGUAGE_VALUES = ['en', 'zh-CN'] as const;

export class CreateBatchArticleJobsDto {
  @IsUUID('all', { message: '站点 ID 格式无效' })
  siteId!: string;

  @IsIn(['site-crawl', 'keywords'])
  source!: 'site-crawl' | 'keywords';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MinLength(2, { each: true })
  @MaxLength(200, { each: true })
  keywords?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_BATCH_JOB_LIMIT)
  limit?: number;

  @IsOptional()
  @IsBoolean()
  seoArticlesOnly?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_SERP_ARTICLE_LIMIT)
  serpArticleLimit?: number;

  @IsOptional()
  @IsBoolean()
  serpArticlesOnly?: boolean;

  @IsOptional()
  @IsIn(CONTENT_LANGUAGE_VALUES, { message: '内容语言仅支持 en 或 zh-CN' })
  contentLanguage?: (typeof CONTENT_LANGUAGE_VALUES)[number];
}
