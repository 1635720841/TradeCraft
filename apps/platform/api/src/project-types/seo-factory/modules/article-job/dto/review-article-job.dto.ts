import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewArticleJobDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
