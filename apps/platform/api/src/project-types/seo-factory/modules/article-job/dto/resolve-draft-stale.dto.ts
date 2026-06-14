/**
 * 编辑后消除 stale 标记请求 DTO。
 */

import { IsIn } from 'class-validator';
import type { DraftResolveStaleAction } from '../../../constants/draft-edit';

export class ResolveDraftStaleDto {
  @IsIn(['refresh_local', 'rerun_semrush', 'regenerate_export'])
  action!: DraftResolveStaleAction;
}
