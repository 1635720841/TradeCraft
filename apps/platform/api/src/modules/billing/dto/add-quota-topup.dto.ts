import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class AddQuotaTopUpDto {
  @IsInt()
  @Min(1)
  @Max(100000)
  amount!: number;

  @IsOptional()
  @IsString()
  note?: string;
}
