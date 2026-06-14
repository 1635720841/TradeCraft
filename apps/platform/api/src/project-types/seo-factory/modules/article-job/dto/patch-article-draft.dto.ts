/**
 * 稿件手动编辑请求 DTO。
 */

import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import type { DraftPostSaveAction } from '../../../constants/draft-edit';

export class PatchArticleDraftDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  metaDescription?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100_000)
  content?: string;

  @IsInt()
  @Min(0)
  contentVersion!: number;

  @IsOptional()
  @IsIn(['none', 'refresh_local', 'rerun_from_optimizing'])
  postSaveAction?: DraftPostSaveAction;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  clientChangeNote?: string;
}

export class RollbackArticleDraftDto {
  @IsString()
  @MinLength(1)
  historyId!: string;

  @IsOptional()
  @IsIn(['none', 'refresh_local', 'rerun_from_optimizing'])
  postSaveAction?: DraftPostSaveAction;
}
