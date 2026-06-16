import { IsBoolean, IsOptional } from 'class-validator';

export class SiteWorkflowSettingsDto {
  @IsOptional()
  @IsBoolean()
  requireBriefApproval?: boolean;

  @IsOptional()
  @IsBoolean()
  enableParaphrase?: boolean;
}
