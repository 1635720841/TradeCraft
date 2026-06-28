/**
 * 访问控制模块：权限、菜单、审计。
 */

import { Global, Module } from '@nestjs/common';
import { AccessService } from './access.service';
import { AuditService } from './audit.service';
import { MenuService } from './menu.service';
import { PermissionService } from './permission.service';

@Global()
@Module({
  providers: [PermissionService, MenuService, AccessService, AuditService],
  exports: [PermissionService, MenuService, AccessService, AuditService],
})
export class AccessModule {}
