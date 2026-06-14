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
} from 'class-validator';

export class UpdateKeywordDto {
  @IsOptional()
  @IsUUID()
  siteId?: string | null;

  @IsOptional()
  @IsString()
  @IsIn(['INFORMATIONAL', 'COMMERCIAL', 'TRANSACTIONAL', 'BRAND', 'COMPETITOR'])
  intent?: string;

  @IsOptional()
  @IsString()
  @IsIn(['PENDING', 'APPROVED', 'ARCHIVED', 'USED'])
  status?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  searchVolume?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  keywordDifficulty?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cpc?: number | null;

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
  notes?: string | null;
}
