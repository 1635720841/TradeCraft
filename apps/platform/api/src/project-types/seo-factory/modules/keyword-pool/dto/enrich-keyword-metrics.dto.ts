import { IsArray, IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class EnrichKeywordMetricsDto {
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  ids?: string[];

  @IsOptional()
  @IsBoolean()
  allMissing?: boolean;
}
