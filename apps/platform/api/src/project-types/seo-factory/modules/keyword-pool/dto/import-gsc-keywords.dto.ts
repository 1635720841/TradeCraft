/** 从 GSC 搜索表现导入关键词 */

import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsOptional, IsString, IsUUID, MinLength, ValidateNested } from 'class-validator';

class ImportGscKeywordItemDto {
  @IsString()
  @MinLength(2)
  query!: string;

  @IsOptional()
  @IsUUID()
  siteId?: string;
}

export class ImportGscKeywordsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ImportGscKeywordItemDto)
  items!: ImportGscKeywordItemDto[];
}
