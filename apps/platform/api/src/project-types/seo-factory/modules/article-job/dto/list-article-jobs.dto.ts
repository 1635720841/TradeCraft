/**
 * 文章任务列表查询参数。
 */

import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString } from 'class-validator';

function toBool(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === true || value === 'true' || value === '1' || value === 1) return true;
  if (value === false || value === 'false' || value === '0' || value === 0) return false;
  return undefined;
}

export class ListArticleJobsQueryDto {
  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;

  @IsOptional()
  @Transform(({ value }) => toBool(value))
  briefPending?: boolean;

  @IsOptional()
  @Transform(({ value }) => toBool(value))
  generating?: boolean;

  @IsOptional()
  @Transform(({ value }) => toBool(value))
  cmsPublishFailed?: boolean;

  @IsOptional()
  @Transform(({ value }) => toBool(value))
  cmsPublishPending?: boolean;

  @IsOptional()
  @Transform(({ value }) => toBool(value))
  staleDraft?: boolean;

  @IsOptional()
  @Transform(({ value }) => toBool(value))
  seoNotReady?: boolean;

  @IsOptional()
  @Transform(({ value }) => toBool(value))
  needsAction?: boolean;

  @IsOptional()
  @Transform(({ value }) => toBool(value))
  reviewPending?: boolean;

  @IsOptional()
  @Transform(({ value }) => toBool(value))
  assignedToMe?: boolean;

  @IsOptional()
  @IsString()
  siteOwner?: string;

  @IsOptional()
  @IsIn(['FAILED'])
  status?: 'FAILED';

  @IsOptional()
  @IsString()
  siteId?: string;

  @IsOptional()
  @IsString()
  keyword?: string;
}
