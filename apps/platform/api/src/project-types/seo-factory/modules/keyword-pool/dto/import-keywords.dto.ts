import { Type } from 'class-transformer';
import { IsArray, ValidateNested } from 'class-validator';
import { CreateKeywordDto } from './create-keyword.dto';

export class ImportKeywordsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateKeywordDto)
  items!: CreateKeywordDto[];
}
