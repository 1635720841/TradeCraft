import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class PatchBriefOutlineSectionDto {
  @IsString()
  @MaxLength(300)
  heading!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  points?: string[];
}

export class PatchBriefFeaturedSnippetDto {
  @IsString()
  @MaxLength(300)
  heading!: string;

  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(80)
  answerMaxWords?: number;
}

export class PatchArticleBriefDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  searchIntent?: string;

  @IsOptional()
  @IsInt()
  @Min(400)
  @Max(5000)
  targetWordCount?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PatchBriefOutlineSectionDto)
  outline?: PatchBriefOutlineSectionDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  contentGaps?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  faqCandidates?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => PatchBriefFeaturedSnippetDto)
  featuredSnippetTarget?: PatchBriefFeaturedSnippetDto;
}
