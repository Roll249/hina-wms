import { createParamDecorator, ExecutionContext, BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

export function DtoValidation<T>(dtoClass: new () => T) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const original = descriptor.value;
    descriptor.value = async function (...args: any[]) {
      const dto = plainToInstance(dtoClass, args[0]);
      const errors = await validate(dto as any);
      if (errors.length > 0) {
        const messages = errors
          .map((e) => Object.values(e.constraints || {}).join(', '))
          .join('; ');
        throw new BadRequestException(`Validation failed: ${messages}`);
      }
      return original.apply(this, [dto, ...args.slice(1)]);
    };
  };
}
