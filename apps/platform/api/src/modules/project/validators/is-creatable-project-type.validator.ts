/**
 * 校验 projectType 是否在当前环境可创建（含 DEMO_FACTORY_ENABLED 门禁）。
 */

import {
  registerDecorator,
  type ValidationOptions,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { listCreatableProjectTypeValues } from '../project-type.descriptors';

@ValidatorConstraint({ name: 'isCreatableProjectType', async: false })
export class IsCreatableProjectTypeConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    return listCreatableProjectTypeValues().includes(value);
  }

  defaultMessage(): string {
    return `projectType 必须是以下之一：${listCreatableProjectTypeValues().join(', ')}`;
  }
}

export function IsCreatableProjectType(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsCreatableProjectTypeConstraint,
    });
  };
}
