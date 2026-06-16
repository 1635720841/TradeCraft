import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';
import { MAX_BATCH_ACTION_LIMIT } from '../../../constants/batch-actions';

export class BatchExportArticleJobsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BATCH_ACTION_LIMIT)
  @IsUUID('4', { each: true })
  jobIds!: string[];
}
