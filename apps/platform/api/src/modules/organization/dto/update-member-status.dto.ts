import { IsIn } from 'class-validator';

export class UpdateMemberStatusDto {
  @IsIn(['ACTIVE', 'DISABLED'])
  status!: 'ACTIVE' | 'DISABLED';
}
