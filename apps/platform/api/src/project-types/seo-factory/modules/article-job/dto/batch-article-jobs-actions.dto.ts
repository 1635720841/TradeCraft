import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsUUID } from 'class-validator';
import { MAX_BATCH_ACTION_LIMIT } from '../../../constants/batch-actions';

export class BatchRetryArticleJobsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BATCH_ACTION_LIMIT)
  @IsUUID('4', { each: true })
  jobIds!: string[];
}

export class BatchPublishArticleJobsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BATCH_ACTION_LIMIT)
  @IsUUID('4', { each: true })
  jobIds!: string[];

  @IsOptional()
  @IsIn(['draft', 'publish'])
  status?: 'draft' | 'publish';
}

export class BatchDeleteArticleJobsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BATCH_ACTION_LIMIT)
  @IsUUID('4', { each: true })
  jobIds!: string[];
}
