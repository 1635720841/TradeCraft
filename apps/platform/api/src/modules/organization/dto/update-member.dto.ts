import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateMemberDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  name?: string;

  @IsOptional()
  @IsString()
  @IsIn(['ADMIN', 'MEMBER'])
  role?: 'ADMIN' | 'MEMBER';
}
