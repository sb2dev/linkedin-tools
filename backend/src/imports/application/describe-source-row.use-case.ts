/** The file behind one row of the preview. */

import { Inject, Injectable } from '@nestjs/common';
import { DATASET_READER, DatasetReaderPort } from '../domain/ports/dataset-reader.port';
import {
  IMPORT_SESSION_REPOSITORY,
  ImportSessionRepositoryPort,
} from '../domain/ports/import-session-repository.port';
import { explainSourceRow, SourceRowReport } from '../domain/row-source';
import {
  ImportNotFoundError,
  ImportPayloadReleasedError,
  SourceLineNotFoundError,
} from './import-errors';

export interface ImportRowSource {
  readonly importId: string;
  readonly filename: string;
  readonly line: SourceRowReport;
}

@Injectable()
export class DescribeSourceRowUseCase {
  constructor(
    @Inject(DATASET_READER) private readonly reader: DatasetReaderPort,
    @Inject(IMPORT_SESSION_REPOSITORY) private readonly sessions: ImportSessionRepositoryPort,
  ) {}

  /** Expiry is not consulted; reading a stored line is safe after the preview lapses. */
  async execute(importId: string, lineNumber: number): Promise<ImportRowSource> {
    const session = await this.sessions.findById(importId);
    if (!session) throw new ImportNotFoundError(importId);

    const payload = await this.sessions.findPayload(importId);
    if (!payload || payload.byteLength === 0) throw new ImportPayloadReleasedError(importId);

    const record = await this.reader.readLine(payload, lineNumber);
    if (!record) throw new SourceLineNotFoundError(importId, lineNumber);

    return {
      importId,
      filename: session.filename,
      line: explainSourceRow(record.header, record.row.fields, record.raw, record.row.lineNumber),
    };
  }
}
