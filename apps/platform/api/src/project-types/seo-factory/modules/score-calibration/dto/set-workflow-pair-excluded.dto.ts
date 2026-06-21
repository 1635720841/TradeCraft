/**
 * 流程 RPA 配对排除/恢复 DTO。
 */

import { IsBoolean } from 'class-validator';

export class SetWorkflowPairExcludedDto {
  @IsBoolean()
  excluded!: boolean;
}
