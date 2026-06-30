/**
 * 租户计费变更申请 DTO。
 */

import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export enum BillingRequestType {
  RENEW = 'RENEW',
  UPGRADE = 'UPGRADE',
  TOPUP = 'TOPUP',
}

export class CreateBillingRequestDto {
  @IsEnum(BillingRequestType)
  type!: BillingRequestType;

  @IsOptional()
  @IsString()
  targetPlanId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  topUpAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}
