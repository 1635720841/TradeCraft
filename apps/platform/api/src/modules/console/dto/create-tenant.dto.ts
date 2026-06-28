import { IsEmail, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength, IsDateString } from 'class-validator';
import { BillingCycle, SubscriptionStatus } from '@prisma/client';

export class CreateTenantDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  organizationName!: string;

  @IsEmail()
  adminEmail!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(64)
  adminPassword!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  adminName?: string;

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
  @IsDateString()
  currentPeriodStart?: string;

  @IsOptional()
  @IsDateString()
  currentPeriodEnd?: string;
}
