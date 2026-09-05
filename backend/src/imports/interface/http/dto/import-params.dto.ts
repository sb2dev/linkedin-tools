/** The path parameters of the import endpoints. */

import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsUUID, Min } from 'class-validator';

/**
 * `importId` is a UUID because PreviewImportUseCase mints it with randomUUID and the column is
 * `uuid`. Validating it here is what makes an unknown handle a 404 and a malformed one a 400;
 * unchecked, Postgres refused to cast it and the caller was told only "an unexpected error".
 */
export class ImportParamsDto {
  @ApiProperty({ format: 'uuid', description: 'The handle the upload returned.' })
  @IsUUID('4', { message: 'importId is not an import handle' })
  readonly importId!: string;
}

export class ImportRowParamsDto extends ImportParamsDto {
  @ApiProperty({ minimum: 1, description: '1-based line in the uploaded file.' })
  @Type(() => Number)
  @IsInt({ message: 'lineNumber must be a whole number' })
  @Min(1, { message: 'lineNumber must be 1 or more' })
  readonly lineNumber!: number;
}
