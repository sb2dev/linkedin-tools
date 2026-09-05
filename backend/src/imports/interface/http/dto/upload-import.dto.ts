import { ApiProperty } from '@nestjs/swagger';

/** Documents the multipart body for Swagger. */
export class UploadImportDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'The dataset to preview: .csv or .json, within the configured size limit.',
  })
  readonly file!: unknown;
}
