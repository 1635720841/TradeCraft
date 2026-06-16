import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateKeywordDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  keyword!: string;

  @IsOptional()
  @IsUUID()
  siteId?: string;

  @IsOptional()
  @IsUUID()
  clusterId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  clusterName?: string;

  @IsOptional()
  @IsString()
  @IsIn(['INFORMATIONAL', 'COMMERCIAL', 'TRANSACTIONAL', 'BRAND', 'COMPETITOR'])
  intent?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  searchVolume?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  keywordDifficulty?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cpc?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  businessValueScore?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  contentFitScore?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
