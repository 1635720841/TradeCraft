import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { BillingCycle, OrganizationStatus, SubscriptionStatus } from '@prisma/client';

/** 超管更新租户订阅与状态 */
export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  planName?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  monthlyArticleQuota?: number;

  @IsOptional()
  @IsEnum(BillingCycle)
  billingCycle?: BillingCycle;

  @IsOptional()
  @IsEnum(SubscriptionStatus)
  subscriptionStatus?: SubscriptionStatus;

  @IsOptional()
  @IsEnum(OrganizationStatus)
  status?: OrganizationStatus;

  @IsOptional()
  @IsISO8601()
  currentPeriodStart?: string;

  @IsOptional()
  @IsISO8601()
  currentPeriodEnd?: string;
}
