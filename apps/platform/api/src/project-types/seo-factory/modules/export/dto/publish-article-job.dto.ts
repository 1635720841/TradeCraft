import { IsIn, IsOptional } from 'class-validator';

export class PublishArticleJobDto {
  @IsOptional()
  @IsIn(['draft', 'publish'])
  status?: 'draft' | 'publish';
}
