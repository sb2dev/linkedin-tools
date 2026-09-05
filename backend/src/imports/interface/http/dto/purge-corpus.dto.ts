import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { PURGE_CONFIRMATION } from 'src/imports/application/purge-corpus.use-case';

/** The confirmation phrase is checked in the use case, so any caller is held to it. */
export class PurgeCorpusDto {
  @ApiProperty({
    example: PURGE_CONFIRMATION,
    description: `Must be exactly "${PURGE_CONFIRMATION}". Anything else deletes nothing.`,
  })
  @IsString()
  readonly confirm!: string;
}
