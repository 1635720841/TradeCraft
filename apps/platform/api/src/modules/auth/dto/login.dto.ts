import { IsString, MinLength } from 'class-validator';

/** 登录请求：username 可为邮箱或用户名 */
export class LoginDto {
  @IsString()
  @MinLength(1)
  username!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}
