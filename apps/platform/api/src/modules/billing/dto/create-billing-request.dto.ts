/**
 * 租户计费变更申请 DTO。
 */

import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';

export enum BillingRequestType {
  RENEW = 'RENEW',
  UPGRADE = 'UPGRADE',
  TOPUP = 'TOPUP',
}

export class CreateBillingRequestDto {
  @IsEnum(BillingRequestType)
  type!: BillingRequestType;

  @ValidateIf((o) => o.type === BillingRequestType.UPGRADE)
  @IsString()
  @IsNotEmpty({ message: '升级申请须指定目标套餐' })
  targetPlanId?: string;

  @ValidateIf((o) => o.type === BillingRequestType.TOPUP)
  @IsInt()
  @Min(1)
  @Max(100000)
  topUpAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}
