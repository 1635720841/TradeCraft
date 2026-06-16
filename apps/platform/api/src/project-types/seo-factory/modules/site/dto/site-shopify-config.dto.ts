import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class SiteShopifyConfigDto {
  @IsString()
  @MinLength(3)
  @MaxLength(253)
  shopDomain!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  accessToken?: string;

  @ValidateIf((dto: SiteShopifyConfigDto) => dto.publishTarget !== 'product')
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  blogId?: string;

  @ValidateIf((dto: SiteShopifyConfigDto) => dto.publishTarget === 'product')
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  productId?: string;

  @IsOptional()
  @IsIn(['blog', 'product'])
  publishTarget?: 'blog' | 'product';

  @IsOptional()
  @IsBoolean()
  defaultPublished?: boolean;
}
