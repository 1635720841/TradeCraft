import { IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  MAX_SITE_PAGE_LIBRARY_SYNC_LIMIT,
  MIN_SITE_PAGE_LIBRARY_SYNC_LIMIT,
} from '../../../constants/serp-filter';

export class SitePageLibrarySettingsDto {
  @IsOptional()
  @IsInt({ message: '页面库同步条数须为整数' })
  @Min(MIN_SITE_PAGE_LIBRARY_SYNC_LIMIT, {
    message: `页面库同步条数不能少于 ${MIN_SITE_PAGE_LIBRARY_SYNC_LIMIT}`,
  })
  @Max(MAX_SITE_PAGE_LIBRARY_SYNC_LIMIT, {
    message: `页面库同步条数不能超过 ${MAX_SITE_PAGE_LIBRARY_SYNC_LIMIT}`,
  })
  syncLimit?: number;
}
