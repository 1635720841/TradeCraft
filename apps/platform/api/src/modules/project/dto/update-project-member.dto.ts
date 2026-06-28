import { ProjectMemberRole } from '@prisma/client';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateProjectMemberDto {
  @IsOptional()
  @IsEnum(ProjectMemberRole)
  role?: ProjectMemberRole;

  @IsOptional()
  @IsDateString()
  accessStart?: string | null;

  @IsOptional()
  @IsDateString()
  accessEnd?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissionIds?: string[];
}
