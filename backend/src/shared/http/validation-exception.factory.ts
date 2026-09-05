import { BadRequestException, ValidationError } from '@nestjs/common';

export function validationExceptionFactory(errors: ValidationError[]): BadRequestException {
  return new BadRequestException({
    message: 'One or more fields are invalid',
    errors: toErrorMap(errors),
  });
}

function toErrorMap(errors: readonly ValidationError[], prefix = ''): Record<string, string[]> {
  const map: Record<string, string[]> = {};

  for (const error of errors) {
    const path = prefix ? `${prefix}.${error.property}` : error.property;
    const messages = Object.values(error.constraints ?? {});
    if (messages.length > 0) map[path] = messages;
    if (error.children && error.children.length > 0) {
      Object.assign(map, toErrorMap(error.children, path));
    }
  }

  return map;
}
