import { ApiProperty } from '@nestjs/swagger';
import { CommitResult, CommittedCounts } from 'src/imports/application/commit-import.use-case';

export class CommittedCountsDto implements CommittedCounts {
  @ApiProperty() readonly profilesInserted!: number;
  @ApiProperty() readonly profilesUpdated!: number;

  @ApiProperty({ description: 'Documents written to the search index.' })
  readonly indexed!: number;

  @ApiProperty({ type: [String], description: 'Business keys the index rejected, if any.' })
  readonly indexFailures!: readonly string[];
}

export class CommitResultDto implements CommitResult {
  @ApiProperty() readonly importId!: string;

  @ApiProperty({ type: CommittedCountsDto })
  readonly committed!: CommittedCountsDto;
}
