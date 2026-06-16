import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class ListShopifyBlogsDto {
  /** 已保存站点：优先用库内 Token，accessToken 可留空 */
  @IsOptional()
  @IsUUID('4')
  siteId?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  shopDomain?: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  accessToken?: string;
}
