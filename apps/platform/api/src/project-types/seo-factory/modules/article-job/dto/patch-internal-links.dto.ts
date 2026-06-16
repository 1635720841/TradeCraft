import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class InternalLinkEditItemDto {
  @IsString()
  @MaxLength(200)
  anchorText!: string;

  @IsString()
  @MaxLength(2000)
  targetUrl!: string;
}

export class PatchInternalLinksDto {
  @IsArray()
  @ArrayMinSize(0)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => InternalLinkEditItemDto)
  internalLinks!: InternalLinkEditItemDto[];
}
