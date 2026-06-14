import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class GenerateKeywordSeedsDto {
  @IsOptional()
  @IsUUID()
  siteId?: string;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(30)
  count?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  topicHint?: string;
}
