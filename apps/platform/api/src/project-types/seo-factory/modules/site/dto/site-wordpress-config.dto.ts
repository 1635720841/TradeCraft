import { IsIn, IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export class SiteWordPressConfigDto {
  @IsUrl({ require_tld: false })
  baseUrl!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  username!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  applicationPassword?: string;

  @IsOptional()
  @IsIn(['draft', 'publish'])
  defaultStatus?: 'draft' | 'publish';
}
