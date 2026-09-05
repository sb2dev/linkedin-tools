import { ValidationError } from '@nestjs/common';
import { validationExceptionFactory } from './validation-exception.factory';

function errorOn(property: string, constraints?: Record<string, string>, children?: ValidationError[]): ValidationError {
  return { property, constraints, children };
}

function errorsOf(exception: ReturnType<typeof validationExceptionFactory>): Record<string, string[]> {
  return (exception.getResponse() as { errors: Record<string, string[]> }).errors;
}

describe('validationExceptionFactory', () => {
  it('keys every message by the field it belongs to', () => {
    const exception = validationExceptionFactory([
      errorOn('size', { max: 'size must not be greater than 100' }),
      errorOn('sort', { isIn: 'sort must be one of the allowed values' }),
    ]);

    expect(exception.getStatus()).toBe(400);
    expect(errorsOf(exception)).toEqual({
      size: ['size must not be greater than 100'],
      sort: ['sort must be one of the allowed values'],
    });
  });

  it('names a nested field by its full path, so a client can point at the right control', () => {
    const exception = validationExceptionFactory([
      errorOn('contact', undefined, [errorOn('email', { isEmail: 'email must be an email' })]),
    ]);

    expect(errorsOf(exception)).toEqual({ 'contact.email': ['email must be an email'] });
  });

  it('reports every constraint a single field broke', () => {
    const exception = validationExceptionFactory([
      errorOn('page', { isInt: 'page must be an integer', min: 'page must not be less than 1' }),
    ]);

    expect(errorsOf(exception).page).toEqual([
      'page must be an integer',
      'page must not be less than 1',
    ]);
  });

  it('leaves out a parent that only groups children, and a field with no constraints at all', () => {
    const exception = validationExceptionFactory([
      errorOn('filters', undefined, [errorOn('skills', { isArray: 'skills must be an array' })]),
      errorOn('unconstrained'),
    ]);

    expect(errorsOf(exception)).toEqual({ 'filters.skills': ['skills must be an array'] });
  });
});
