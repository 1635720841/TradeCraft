import { IsDateString, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsString()
  @IsIn(['seo-factory'])
  projectType!: string;

  @IsOptional()
  @IsDateString()
  accessStart?: string | null;

  @IsOptional()
  @IsDateString()
  accessEnd?: string | null;
}