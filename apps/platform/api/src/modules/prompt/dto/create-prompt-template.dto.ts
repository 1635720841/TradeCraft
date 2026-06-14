import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreatePromptTemplateDto {
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  @Matches(/^seo_[a-z0-9_]+$/, {
    message: 'version 须为 seo_ 前缀的小写标识，如 seo_brief_v1',
  })
  version!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsString()
  @MinLength(20)
  content!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
