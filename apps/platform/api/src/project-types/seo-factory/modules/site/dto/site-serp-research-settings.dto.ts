import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  MAX_SERPER_ORGANIC_NUM,
  MAX_SERP_ARTICLE_LIMIT,
  MAX_SERP_CACHE_TTL_HOURS,
  MIN_SERPER_ORGANIC_NUM,
  MIN_SERP_CACHE_TTL_HOURS,
} from '../../../constants/serp-filter';

export class SiteSerpResearchSettingsDto {
  @IsOptional()
  @IsInt({ message: '参考竞品篇数须为整数' })
  @Min(1, { message: '参考竞品篇数至少为 1' })
  @Max(MAX_SERP_ARTICLE_LIMIT, {
    message: `参考竞品篇数不能超过 ${MAX_SERP_ARTICLE_LIMIT}`,
  })
  articleLimit?: number;

  @IsOptional()
  @IsBoolean()
  articlesOnly?: boolean;

  @IsOptional()
  @IsInt({ message: 'Google 抓取条数须为整数' })
  @Min(MIN_SERPER_ORGANIC_NUM, {
    message: `Google 抓取条数不能少于 ${MIN_SERPER_ORGANIC_NUM}`,
  })
  @Max(MAX_SERPER_ORGANIC_NUM, {
    message: `Google 抓取条数不能超过 ${MAX_SERPER_ORGANIC_NUM}`,
  })
  organicFetchNum?: number;

  @IsOptional()
  @IsInt({ message: '自动补充阈值须为整数' })
  @Min(1, { message: '自动补充阈值至少为 1' })
  @Max(MAX_SERP_ARTICLE_LIMIT, {
    message: `自动补充阈值不能超过 ${MAX_SERP_ARTICLE_LIMIT}`,
  })
  minArticleCandidates?: number;

  @IsOptional()
  @IsInt({ message: '搜索缓存时长须为整数（小时）' })
  @Min(MIN_SERP_CACHE_TTL_HOURS, { message: '搜索缓存时长不能为负数' })
  @Max(MAX_SERP_CACHE_TTL_HOURS, {
    message: `搜索缓存时长不能超过 ${MAX_SERP_CACHE_TTL_HOURS} 小时`,
  })
  cacheTtlHours?: number;
}
