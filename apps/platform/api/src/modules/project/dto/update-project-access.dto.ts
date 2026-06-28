import { IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateProjectAccessDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsDateString()
  accessStart?: string | null;

  @IsOptional()
  @IsDateString()
  accessEnd?: string | null;
}
