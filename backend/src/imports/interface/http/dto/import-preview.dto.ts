/** The response bodies of the import endpoints. */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ImportCounts,
  ImportPreview,
  ImportRunSummary,
  ImportStatus,
  RealignmentSample,
  RejectionGroup,
  RejectionSample,
  RepairCounts,
} from 'src/imports/domain/import-summary';
import {
  ImportRowOutcome,
  ImportRowReport,
  ImportRowStatus,
  ROW_REPORT_LIMIT,
  RowRejection,
} from 'src/imports/domain/row-report';
import { ImportRunList } from 'src/imports/application/list-imports.use-case';

export class ImportCountsDto implements ImportCounts {
  @ApiProperty({ description: 'Data rows in the file, excluding the header.' })
  readonly rowsTotal!: number;

  @ApiProperty() readonly rowsAccepted!: number;
  @ApiProperty() readonly rowsRejected!: number;

  @ApiProperty({ description: 'Accepted rows that describe a person another accepted row already described.' })
  readonly duplicatesCollapsed!: number;

  @ApiProperty() readonly profilesNew!: number;
  @ApiProperty() readonly profilesUpdated!: number;
  @ApiProperty() readonly profilesUnchanged!: number;

  @ApiProperty({ description: 'Rows whose multi-value block is shifted out of alignment.' })
  readonly scrambledRows!: number;

  @ApiProperty({ description: 'Accepted rows that parsed only after a source-dump prefix was stripped.' })
  readonly repairableRows!: number;

  @ApiProperty({ description: 'Accepted rows whose block was moved back into place by the repair.' })
  readonly realignedRows!: number;

  @ApiProperty({ description: 'Individual cells dropped because they did not coerce to their column type.' })
  readonly fieldsQuarantined!: number;
}

/** What the same file would produce with repair enabled, so the choice is made on numbers. */
export class RepairCountsDto implements RepairCounts {
  @ApiProperty() readonly profilesNew!: number;
  @ApiProperty() readonly profilesUpdated!: number;
  @ApiProperty() readonly profilesUnchanged!: number;
  @ApiProperty() readonly rowsAccepted!: number;

  @ApiProperty({ description: 'Rows still scrambled after the repair.' })
  readonly scrambledRows!: number;

  @ApiProperty({ description: 'Rows the repair moved back into place.' })
  readonly realignedRows!: number;

  @ApiProperty() readonly fieldsQuarantined!: number;
}

export class RejectionSampleDto implements RejectionSample {
  @ApiProperty({ description: '1-based line number in the uploaded file.' })
  readonly lineNumber!: number;

  @ApiProperty({ description: 'A truncated excerpt of the offending line.' })
  readonly excerpt!: string;
}

export class RejectionGroupDto implements RejectionGroup {
  @ApiProperty({ example: 'FIELD_COUNT_MISMATCH' })
  readonly reason!: string;

  @ApiProperty({ description: 'The reason in plain language.' })
  readonly label!: string;

  @ApiProperty() readonly count!: number;

  @ApiProperty({ type: [RejectionSampleDto], description: 'At most three examples.' })
  readonly samples!: readonly RejectionSampleDto[];
}

export class RealignmentSampleDto implements RealignmentSample {
  @ApiProperty() readonly linkedinUsername!: string;
  @ApiProperty() readonly fullName!: string;

  @ApiProperty({ description: 'How far the multi-value block was shifted.' })
  readonly offset!: number;

  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' }, description: 'Affected columns as parsed today.' })
  readonly before!: Record<string, string>;

  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' }, description: 'The same columns after realignment.' })
  readonly after!: Record<string, string>;
}

const ROW_STATUSES: readonly ImportRowStatus[] = [
  'new',
  'updated',
  'unchanged',
  'duplicate',
  'rejected',
];

export class RowRejectionDto implements RowRejection {
  @ApiProperty({ example: 'FIELD_COUNT_MISMATCH' })
  readonly reason!: string;

  @ApiProperty({ description: 'The reason in plain language.' })
  readonly label!: string;

  @ApiProperty({ description: 'A truncated excerpt of the offending line.' })
  readonly excerpt!: string;
}

/** What one repair policy would do with a row. */
export class ImportRowOutcomeDto implements ImportRowOutcome {
  @ApiProperty({
    enum: ROW_STATUSES,
    description:
      'What committing would do: add the person, change them, leave them as they are, collapse the' +
      ' row into another row for the same person, or drop it.',
  })
  readonly status!: ImportRowStatus;

  @ApiProperty({ description: 'The multi-value block is still shifted out of alignment.' })
  readonly scrambled!: boolean;

  @ApiProperty({ description: 'The block was moved back into place under this policy.' })
  readonly realigned!: boolean;

  @ApiPropertyOptional({ description: 'How far the block was moved, when it was.' })
  readonly offset?: number;

  @ApiProperty() readonly totalSkills!: number;

  @ApiProperty({ description: '0..1: populated fields as a share of the fields the row supplied.' })
  readonly qualityScore!: number;

  @ApiProperty({ description: 'Other rows for this person that collapsed into this one.' })
  readonly duplicateRows!: number;

  @ApiPropertyOptional({ description: 'The line whose profile was kept instead of this one.' })
  readonly supersededByLine?: number;
}

/** One source line of the upload. Carries no contact detail, birth date or address. */
export class ImportRowReportDto implements ImportRowReport {
  @ApiProperty({ description: '1-based line number in the uploaded file.' })
  readonly lineNumber!: number;

  @ApiPropertyOptional({ description: 'Absent on a rejected row, which named nobody.' })
  readonly linkedinUsername?: string;

  @ApiPropertyOptional() readonly fullName?: string;
  @ApiPropertyOptional() readonly jobTitle?: string;
  @ApiPropertyOptional() readonly companyName?: string;
  @ApiPropertyOptional() readonly location?: string;

  @ApiProperty({ type: ImportRowOutcomeDto, description: 'The row as parsed today.' })
  readonly outcome!: ImportRowOutcomeDto;

  @ApiPropertyOptional({
    type: ImportRowOutcomeDto,
    description: 'The same row with repair enabled; absent when the repair changes nothing for it.',
  })
  readonly withRepair?: ImportRowOutcomeDto;

  @ApiPropertyOptional({ type: RowRejectionDto })
  readonly rejection?: RowRejectionDto;
}

export class ImportPreviewDto implements ImportPreview {
  @ApiProperty({ description: 'Handle for the commit and detail endpoints.' })
  readonly importId!: string;

  @ApiProperty() readonly filename!: string;
  @ApiProperty() readonly sizeBytes!: number;

  @ApiProperty({ format: 'date-time' })
  readonly createdAt!: string;

  @ApiProperty({ enum: ['previewed', 'committed', 'expired'] })
  readonly status!: ImportStatus;

  @ApiProperty({ type: ImportCountsDto })
  readonly counts!: ImportCountsDto;

  @ApiProperty({ type: RepairCountsDto })
  readonly countsWithRepair!: RepairCountsDto;

  @ApiProperty({ type: [RejectionGroupDto] })
  readonly rejections!: readonly RejectionGroupDto[];

  @ApiProperty({
    type: [ImportRowReportDto],
    description: `Every source line in file order, at most ${ROW_REPORT_LIMIT} of them.`,
  })
  readonly rows!: readonly ImportRowReportDto[];

  @ApiProperty({ description: 'Rows past that cap, described by the counts but not listed here.' })
  readonly rowsOmitted!: number;

  @ApiProperty({ type: [RealignmentSampleDto], description: 'At most three before/after examples of the repair.' })
  readonly repairSample!: readonly RealignmentSampleDto[];
}

export class ImportRunSummaryDto implements ImportRunSummary {
  @ApiProperty() readonly importId!: string;
  @ApiProperty() readonly filename!: string;
  @ApiProperty() readonly sizeBytes!: number;

  @ApiProperty({ format: 'date-time' })
  readonly createdAt!: string;

  @ApiPropertyOptional({ format: 'date-time' })
  readonly committedAt?: string;

  @ApiProperty({ enum: ['previewed', 'committed', 'expired'] })
  readonly status!: ImportStatus;

  @ApiProperty({ type: ImportCountsDto })
  readonly counts!: ImportCountsDto;
}

export class ImportRunListDto implements ImportRunList {
  @ApiProperty({ type: [ImportRunSummaryDto], description: 'Newest first.' })
  readonly runs!: readonly ImportRunSummaryDto[];
}
