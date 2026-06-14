import { IsString, MinLength } from 'class-validator';

/** Logto 授权码回调：前端从 redirect 拿到 code 后交给 API 换平台会话 */
export class LogtoCallbackDto {
  @IsString()
  @MinLength(1)
  code!: string;

  @IsString()
  @MinLength(1)
  redirectUri!: string;
}
