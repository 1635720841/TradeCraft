import { IsOptional, IsString, MaxLength, MinLength, IsUUID } from 'class-validator';

export class UpdateKeywordClusterDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsUUID('all', { message: '支柱关键词 ID 格式无效' })
  pillarKeywordId?: string | null;
}
