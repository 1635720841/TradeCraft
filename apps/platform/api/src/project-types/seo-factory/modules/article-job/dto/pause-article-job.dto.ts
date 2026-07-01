import { IsOptional, IsString, MaxLength } from 'class-validator';

export class PauseArticleJobDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
