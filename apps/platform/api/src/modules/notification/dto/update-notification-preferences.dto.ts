import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateNotificationPreferencesDto {
  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mutedTypes?: string[];
}
