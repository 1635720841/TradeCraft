import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** 租户管理员仅可修改企业名称 */
export class UpdateOrgProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;
}
