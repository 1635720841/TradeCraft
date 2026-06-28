import { IsEmail, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class InviteMemberDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  name?: string;

  @IsOptional()
  @IsString()
  @IsIn(['ADMIN', 'MEMBER'])
  role?: 'ADMIN' | 'MEMBER';
}
