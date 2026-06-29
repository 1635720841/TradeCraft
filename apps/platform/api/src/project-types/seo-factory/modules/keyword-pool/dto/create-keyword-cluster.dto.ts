import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { MAX_BATCH_ACTION_LIMIT } from '../../../constants/batch-actions';

export class CreateKeywordClusterDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  /** 创建后一并归入该专题的关键词 ID */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_BATCH_ACTION_LIMIT)
  @IsUUID('4', { each: true })
  keywordIds?: string[];
}
