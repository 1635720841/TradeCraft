/**
 * 代登录请求 DTO。
 */

import { IsString, MaxLength, MinLength } from 'class-validator';

export class ImpersonateDto {
  @IsString()
  @MinLength(1)
  userId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}
