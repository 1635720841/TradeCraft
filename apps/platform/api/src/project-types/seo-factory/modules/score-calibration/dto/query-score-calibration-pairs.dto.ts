/**
 * 查询评分校准配对列表 DTO。
 */

import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class QueryScoreCalibrationPairsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  /** 数据子集：all | holdout（验证集）| train（训练集） */
  @IsOptional()
  @IsIn(['all', 'holdout', 'train', 'excluded'])
  dataset?: 'all' | 'holdout' | 'train' | 'excluded';

  /** 来源：all | workflow（流程 RPA）| manual（实验室手动录入） */
  @IsOptional()
  @IsIn(['all', 'workflow', 'manual'])
  source?: 'all' | 'workflow' | 'manual';

  /** 最小朴素误差（本地/10 vs Semrush） */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minAbsError?: number;

  /** 最大朴素误差 */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxAbsError?: number;

  /** 最小校准误差（|predicted - semrush|） */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minModelAbsError?: number;

  /** 最大校准误差 */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxModelAbsError?: number;
}
