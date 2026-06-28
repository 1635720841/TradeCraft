import { IsArray, IsString } from 'class-validator';

export class SetProjectMemberPermissionsDto {
  @IsArray()
  @IsString({ each: true })
  permissionIds!: string[];
}
