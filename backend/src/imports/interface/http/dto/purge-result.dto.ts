import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PurgeResult } from 'src/imports/application/purge-corpus.use-case';

export class PurgeResultDto implements PurgeResult {
  @ApiProperty({ description: 'Profiles counted immediately before the delete, and now gone.' })
  readonly profilesDeleted!: number;

  @ApiProperty({
    description:
      'False when the corpus was emptied but the search index was not. The data is gone either way; POST /api/admin/reindex rebuilds the index from the empty corpus.',
  })
  readonly indexCleared!: boolean;

  @ApiPropertyOptional({ description: 'Why the index was not cleared, when it was not.' })
  readonly indexError?: string;

  @ApiProperty({
    description:
      'Always true: the purge removes profiles, and leaves the import history that records where they came from.',
  })
  readonly importHistoryRetained!: boolean;
}
