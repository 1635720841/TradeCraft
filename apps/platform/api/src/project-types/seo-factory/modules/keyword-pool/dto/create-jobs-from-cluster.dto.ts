import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class CreateJobsFromClusterDto {
  @IsOptional()
  @IsUUID()
  siteId?: string;

  /** 仅对优先级最高的前 N 个待写词创建任务；不传则创建该专题下全部待写词 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
