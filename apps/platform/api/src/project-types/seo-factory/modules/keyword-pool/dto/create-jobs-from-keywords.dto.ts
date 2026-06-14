import { ArrayMaxSize, ArrayMinSize, IsArray, IsOptional, IsUUID } from 'class-validator';
import { MAX_BATCH_JOB_LIMIT } from '../../../constants/serp-filter';

export class CreateJobsFromKeywordsDto {
  @IsArray()
  @ArrayMinSize(1, { message: '请至少选择一个关键词' })
  @ArrayMaxSize(MAX_BATCH_JOB_LIMIT, {
    message: `单次最多入队 ${MAX_BATCH_JOB_LIMIT} 个关键词`,
  })
  @IsUUID('4', { each: true, message: '关键词 ID 格式无效' })
  ids!: string[];

  @IsOptional()
  @IsUUID('4', { message: '站点 ID 格式无效' })
  siteId?: string;
}
