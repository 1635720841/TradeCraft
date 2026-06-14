import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class UpdateOrganizationDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  planName?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  monthlyArticleQuota?: number;
}
