import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MAX_SERP_ARTICLE_LIMIT } from '../../../constants/serp-filter';
import { ARTICLE_CONTENT_FORMS } from '../../../constants/content-form';

const CONTENT_LANGUAGE_VALUES = ['en', 'zh-CN'] as const;

export class CreateArticleJobDto {
  @IsUUID('all', { message: '站点 ID 格式无效' })
  siteId!: string;

  @IsString()
  @IsNotEmpty({ message: '搜索词不能为空' })
  targetKeyword!: string;

  @IsOptional()
  @IsInt()
  @Min(1, { message: '竞品分析条数至少为 1' })
  @Max(MAX_SERP_ARTICLE_LIMIT, {
    message: `竞品分析条数不能超过 ${MAX_SERP_ARTICLE_LIMIT}`,
  })
  serpArticleLimit?: number;

  @IsOptional()
  @IsBoolean()
  serpArticlesOnly?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  serpCountry?: string;

  @IsOptional()
  @IsIn(CONTENT_LANGUAGE_VALUES, { message: '内容语言仅支持 en 或 zh-CN' })
  contentLanguage?: (typeof CONTENT_LANGUAGE_VALUES)[number];

  @IsOptional()
  @IsIn(['INFORMATIONAL', 'COMMERCIAL', 'TRANSACTIONAL', 'BRAND', 'COMPETITOR'], {
    message: '读者意图选项无效',
  })
  searchIntent?: string;

  @IsOptional()
  @IsIn(ARTICLE_CONTENT_FORMS, { message: '文章样式选项无效' })
  contentForm?: (typeof ARTICLE_CONTENT_FORMS)[number];
}
