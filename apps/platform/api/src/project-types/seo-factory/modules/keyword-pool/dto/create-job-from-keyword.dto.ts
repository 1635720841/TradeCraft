import { IsOptional, IsUUID } from 'class-validator';

export class CreateJobFromKeywordDto {
  @IsOptional()
  @IsUUID()
  siteId?: string;
}
