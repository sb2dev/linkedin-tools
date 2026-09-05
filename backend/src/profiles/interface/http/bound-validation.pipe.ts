import { ValidationPipe } from '@nestjs/common';
import { validationExceptionFactory } from 'src/shared/http/validation-exception.factory';

/** Bound to a parameter rather than relied upon globally, so a route validates whatever the bootstrap configures. */
export const BOUND_VALIDATION_PIPE = new ValidationPipe({
  transform: true,
  whitelist: true,
  exceptionFactory: validationExceptionFactory,
});
