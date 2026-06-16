import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { SiteWordPressConfigDto } from './site-wordpress-config.dto';
import { SiteShopifyConfigDto } from './site-shopify-config.dto';
import { SiteWorkflowSettingsDto } from './site-workflow-settings.dto';
import { SiteContentProfileDto } from './site-content-profile.dto';
import { SiteSerpResearchSettingsDto } from './site-serp-research-settings.dto';

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
  @IsIn(['wordpress', 'shopify'])
  cmsType?: 'wordpress' | 'shopify';

  @IsOptional()
  @ValidateNested()
  @Type(() => SiteWordPressConfigDto)
  wordpress?: SiteWordPressConfigDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => SiteShopifyConfigDto)
  shopify?: SiteShopifyConfigDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => SiteWorkflowSettingsDto)
  workflow?: SiteWorkflowSettingsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => SiteContentProfileDto)
  contentProfile?: SiteContentProfileDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => SiteSerpResearchSettingsDto)
  serpResearch?: SiteSerpResearchSettingsDto;
}
