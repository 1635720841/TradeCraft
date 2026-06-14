import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { SiteWordPressConfigDto } from './site-wordpress-config.dto';

export class CreateSiteDto {
  @IsString()
  @MinLength(3)
  @MaxLength(253)
  domain!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  brandVoice?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  targetMarket?: string;

  @IsOptional()
  @IsString()
  @IsIn(['en', 'zh-CN'])
  contentLanguage?: string;

  @IsOptional()
  @IsIn(['wordpress'])
  cmsType?: 'wordpress';

  @IsOptional()
  @ValidateNested()
  @Type(() => SiteWordPressConfigDto)
  wordpress?: SiteWordPressConfigDto;
}
