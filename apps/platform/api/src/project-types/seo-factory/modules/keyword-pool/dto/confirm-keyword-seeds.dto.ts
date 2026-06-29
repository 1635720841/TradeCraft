import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class KeywordSeedCandidateDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  keyword!: string;

  @IsString()
  @MaxLength(32)
  intent!: string;

  @IsNumber()
  @Min(0)
  @Max(1)
  businessValueScore!: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  contentFitScore!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  rationale?: string;
}

export class ConfirmKeywordSeedsDto {
  @IsOptional()
  @IsUUID()
  siteId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => KeywordSeedCandidateDto)
  keywords!: KeywordSeedCandidateDto[];
}
