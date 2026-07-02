import { IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { IsCreatableProjectType } from '../validators/is-creatable-project-type.validator';

export class CreateProjectDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsString()
  @IsCreatableProjectType()
  projectType!: string;

  @IsOptional()
  @IsDateString()
  accessStart?: string | null;

  @IsOptional()
  @IsDateString()
  accessEnd?: string | null;
}
