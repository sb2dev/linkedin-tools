import { ApiProperty } from '@nestjs/swagger';
import { ReindexResult } from 'src/profiles/application/reindex.use-case';

export class ReindexResultDto implements ReindexResult {
  @ApiProperty({ description: 'Documents rewritten from Postgres into the search index.' })
  readonly indexed!: number;

  @ApiProperty({ type: [String], description: 'Business keys the index rejected, if any.' })
  readonly failures!: readonly string[];
}
