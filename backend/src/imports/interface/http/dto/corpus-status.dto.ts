import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CorpusStatus, LastImport } from 'src/imports/application/describe-corpus.use-case';

export class LastImportDto implements LastImport {
  @ApiProperty() readonly importId!: string;
  @ApiProperty() readonly filename!: string;
  @ApiProperty({ description: 'ISO 8601.' }) readonly committedAt!: string;
  @ApiProperty() readonly rowsAccepted!: number;
  @ApiProperty() readonly profilesNew!: number;
  @ApiProperty() readonly profilesUpdated!: number;
}

export class CorpusStatusDto implements CorpusStatus {
  @ApiProperty({ description: 'Profiles stored right now.' })
  readonly profiles!: number;

  @ApiPropertyOptional({ type: LastImportDto, description: 'The newest committed import run.' })
  readonly lastImport?: LastImportDto;
}
