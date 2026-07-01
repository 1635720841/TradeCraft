/**
 * 站点自动生产配置 DTO。
 */

import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import {
  AUTOPILOT_KEYWORD_SOURCES,
  AUTOPILOT_PUBLISH_MODES,
  MAX_AUTOPILOT_ARTICLES_PER_RUN,
  MIN_AUTOPILOT_ARTICLES_PER_RUN,
} from '../../../constants/site-autopilot-settings';

export class SiteAutopilotSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(MIN_AUTOPILOT_ARTICLES_PER_RUN)
  @Max(MAX_AUTOPILOT_ARTICLES_PER_RUN)
  articlesPerRun?: number;

  @IsOptional()
  @IsIn([...AUTOPILOT_KEYWORD_SOURCES])
  keywordSource?: (typeof AUTOPILOT_KEYWORD_SOURCES)[number];

  @IsOptional()
  @IsIn([...AUTOPILOT_PUBLISH_MODES])
  publishMode?: (typeof AUTOPILOT_PUBLISH_MODES)[number];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  runDaysOfWeek?: number[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  runHourUtc?: number;
}
