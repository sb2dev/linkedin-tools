/** The response body of the source-line endpoint. */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ImportRowSource } from 'src/imports/application/describe-source-row.use-case';
import {
  ColumnVerdict,
  SourceColumnReport,
  SourceIdentity,
  SourceRejectionReport,
  SourceRepairMove,
  SourceRepairReport,
  SourceRowReport,
} from 'src/imports/domain/row-source';

const VERDICTS: readonly ColumnVerdict[] = ['kept', 'quarantined', 'empty', 'unmapped', 'unread'];

export class SourceColumnDto implements SourceColumnReport {
  @ApiProperty({ description: '0-based position in the source header; a shift shows as a diagonal.' })
  readonly index!: number;

  @ApiPropertyOptional({ description: 'Absent past the last column the header declares.' })
  readonly column?: string;

  @ApiProperty({ description: 'The cell, whitespace collapsed and truncated at 500 characters.' })
  readonly value!: string;

  @ApiPropertyOptional({ description: 'Canonical field this column feeds, when the catalog maps it.' })
  readonly target?: string;

  @ApiProperty({
    enum: VERDICTS,
    description:
      'What the validator did with the cell: kept it, quarantined it, found it blank, had no' +
      ' canonical field for it, or never read it because the line was already rejected.',
  })
  readonly verdict!: ColumnVerdict;

  @ApiPropertyOptional({ description: 'Why the cell was quarantined.' })
  readonly reason?: string;
}

export class SourceRepairMoveDto implements SourceRepairMove {
  @ApiProperty() readonly column!: string;

  @ApiProperty({ description: 'What the column holds as the row stands.' })
  readonly from!: string;

  @ApiProperty({ description: 'What realignment would put there.' })
  readonly to!: string;
}

export class SourceRepairDto implements SourceRepairReport {
  @ApiProperty({ description: 'Negative means the true value sits that many columns earlier.' })
  readonly offset!: number;

  @ApiProperty({ description: 'Populated block columns that validated at this offset.' })
  readonly evidence!: number;

  @ApiProperty({ type: [SourceRepairMoveDto] })
  readonly moves!: readonly SourceRepairMoveDto[];
}

export class SourceRejectionDto implements SourceRejectionReport {
  @ApiProperty({ example: 'FIELD_COUNT_MISMATCH' })
  readonly reason!: string;

  @ApiProperty({ description: 'The reason in plain language.' })
  readonly label!: string;

  @ApiProperty({ description: 'What this line in particular did to earn the code.' })
  readonly detail!: string;
}

export class SourceIdentityDto implements SourceIdentity {
  @ApiProperty() readonly linkedinUsername!: string;
  @ApiProperty() readonly linkedinUrl!: string;
  @ApiProperty() readonly fullName!: string;
}

/** One line of the upload, as the file wrote it and as the importer read it. */
export class SourceRowDto implements SourceRowReport {
  @ApiProperty({ description: '1-based line number in the uploaded file.' })
  readonly lineNumber!: number;

  @ApiProperty({ description: 'The record verbatim, quoting and spanned lines included.' })
  readonly raw!: string;

  @ApiProperty({ description: 'The record was longer than 20000 characters and was cut.' })
  readonly rawTruncated!: boolean;

  @ApiProperty({ description: 'Fields the line parsed into.' })
  readonly fieldCount!: number;

  @ApiProperty({ description: 'Columns the header declares.' })
  readonly expectedFieldCount!: number;

  @ApiProperty({ description: 'A source-dump path prefix was dropped before the record was read.' })
  readonly recovered!: boolean;

  @ApiProperty({ type: [String], description: 'The cells that prefix occupied; empty unless recovered.' })
  readonly droppedFields!: readonly string[];

  @ApiProperty({ description: 'The line became a profile.' })
  readonly accepted!: boolean;

  @ApiProperty({ description: 'The multi-value block is shifted out of alignment.' })
  readonly scrambled!: boolean;

  @ApiPropertyOptional({ type: SourceIdentityDto, description: 'Absent on a rejected line.' })
  readonly identity?: SourceIdentityDto;

  @ApiPropertyOptional({ type: SourceRejectionDto, description: 'Why the line never became a person.' })
  readonly rejection?: SourceRejectionDto;

  @ApiProperty({ type: [SourceColumnDto], description: 'Every header column, in header order.' })
  readonly columns!: readonly SourceColumnDto[];

  @ApiPropertyOptional({
    type: SourceRepairDto,
    description: 'What realignment would move; absent unless an offset was proven and survived.',
  })
  readonly repair?: SourceRepairDto;
}

export class ImportRowSourceDto implements ImportRowSource {
  @ApiProperty() readonly importId!: string;
  @ApiProperty() readonly filename!: string;

  @ApiProperty({ type: SourceRowDto })
  readonly line!: SourceRowDto;
}
