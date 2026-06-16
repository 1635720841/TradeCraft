import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class SiteContentProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  industry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  certifications?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  moqLeadTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  ctaPrimaryText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  ctaPrimaryUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  utmSource?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  utmMedium?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  utmCampaign?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  utmContent?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  productLines?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  differentiators?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  targetBuyerType?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  forbiddenTerms?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  caseHighlights?: string;
}
