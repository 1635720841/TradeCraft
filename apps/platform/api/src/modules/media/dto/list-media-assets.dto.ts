import { IsIn, IsOptional, IsString } from 'class-validator';

export class ListMediaAssetsQueryDto {
  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;

  @IsOptional()
  @IsIn(['BFL', 'UPLOAD', 'URL'])
  source?: 'BFL' | 'UPLOAD' | 'URL';
}
