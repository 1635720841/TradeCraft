import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class PublishArticleJobDto {
  @IsOptional()
  @IsIn(['draft', 'publish'])
  status?: 'draft' | 'publish';

  /** Shopify：blog 文章 / product 产品详情页 */
  @IsOptional()
  @IsIn(['blog', 'product'])
  target?: 'blog' | 'product';

  @IsOptional()
  @IsString()
  @MaxLength(32)
  productId?: string;
}
