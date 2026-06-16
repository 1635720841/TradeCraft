import { IsOptional, IsString, MaxLength } from 'class-validator';

export class PatchSitePageDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  primaryKeyword?: string | null;
}
