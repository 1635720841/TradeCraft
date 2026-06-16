import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import { MAX_SERP_ARTICLE_LIMIT } from '../../../constants/serp-filter';

export class RefreshArticleJobSerpDto {
  /** 为 false 时纳入产品页、首页等，样本更多但参考质量可能下降 */
  @IsOptional()
  @IsBoolean()
  serpArticlesOnly?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1, { message: '竞品分析条数至少为 1' })
  @Max(MAX_SERP_ARTICLE_LIMIT, {
    message: `竞品分析条数不能超过 ${MAX_SERP_ARTICLE_LIMIT}`,
  })
  serpArticleLimit?: number;

  /** 手动刷新时跳过读缓存（默认 true） */
  @IsOptional()
  @IsBoolean()
  bypassCache?: boolean;
}
