import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RegenerateArticleImageDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  prompt?: string;
}

export class GenerateArticleImageDto {
  @IsString()
  @MaxLength(2000)
  prompt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  alt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  insertAfterHeading?: string;
}
