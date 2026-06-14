import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { MAX_SERP_ARTICLE_LIMIT } from '../../../constants/serp-filter';

const CONTENT_LANGUAGE_VALUES = ['en', 'zh-CN'] as const;

export class CreateArticleJobDto {
  @IsUUID('all', { message: '站点 ID 格式无效' })
  siteId!: string;

  @IsString()
  @IsNotEmpty({ message: '目标关键词不能为空' })
  targetKeyword!: string;

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
