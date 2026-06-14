/**
 * 手动 AI 重写请求 DTO。
 */

import { IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RewriteArticleJobOptionsDto {
  @IsOptional()
  @IsBoolean()
  keepTitleMeta?: boolean;

  @IsOptional()
  @IsBoolean()
  rerunLocalSeo?: boolean;
}

export class RewriteArticleJobDto {
  @IsIn(['suggestions', 'instruction'])
  mode!: 'suggestions' | 'instruction';

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(2000)
  instruction?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  suggestions?: string[];

  @IsOptional()
  options?: RewriteArticleJobOptionsDto;
}

export class AcceptRewriteArticleJobDto {
  @IsOptional()
  @IsBoolean()
  rerunLocalSeo?: boolean;

  @IsOptional()
  @IsBoolean()
  rerunSemrush?: boolean;
}
