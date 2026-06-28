import { ArrayUnique, IsArray, IsString } from 'class-validator';

export class SetUserMenusDto {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  menuIds!: string[];
}
