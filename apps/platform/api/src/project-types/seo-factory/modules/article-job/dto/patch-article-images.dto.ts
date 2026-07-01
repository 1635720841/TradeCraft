import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class ArticleImageEditItemDto {
  @IsString()
  @MaxLength(200)
  alt!: string;

  @IsString()
  @MaxLength(2000)
  url!: string;

  @IsOptional()
  @IsIn(['bfl', 'upload', 'url'])
  source?: 'bfl' | 'upload' | 'url';

  @IsOptional()
  @IsString()
  @MaxLength(200)
  insertAfterHeading?: string;
}

export class PatchArticleImagesDto {
  @IsArray()
  @ArrayMinSize(0)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ArticleImageEditItemDto)
  articleImages!: ArticleImageEditItemDto[];
}
