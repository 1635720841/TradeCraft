import { ArrayUnique, IsArray, IsString } from 'class-validator';

export class SetUserPermissionsDto {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissionIds!: string[];
}
