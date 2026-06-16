import { IsOptional, IsUUID } from 'class-validator';

export class CreateJobsFromClusterDto {
  @IsOptional()
  @IsUUID()
  siteId?: string;
}
