/** Parses an upload with and without repair, and compares both against the stored hashes. */

import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Profile } from '../../profiles/domain/profile';
import {
  PROFILE_REPOSITORY,
  ProfileRepositoryPort,
} from '../../profiles/domain/ports/profile-repository.port';
import { ingestBothWays } from '../domain/dataset-ingestor';
import {
  classifyChanges,
  ImportPreview,
  PREVIEW_TTL_MS,
  toImportCounts,
  toRepairCounts,
} from '../domain/import-summary';
import { DATASET_READER, DatasetReaderPort } from '../domain/ports/dataset-reader.port';
import { buildRowReport, ROW_REPORT_LIMIT } from '../domain/row-report';
import {
  IMPORT_SESSION_REPOSITORY,
  ImportSessionRepositoryPort,
} from '../domain/ports/import-session-repository.port';
import { ImportNotFoundError, NotAProfileExportError } from './import-errors';

export interface UploadedDataset {
  readonly filename: string;
  readonly buffer: Buffer;
}

@Injectable()
export class PreviewImportUseCase {
  constructor(
    @Inject(DATASET_READER) private readonly reader: DatasetReaderPort,
    @Inject(PROFILE_REPOSITORY) private readonly repository: ProfileRepositoryPort,
    @Inject(IMPORT_SESSION_REPOSITORY) private readonly sessions: ImportSessionRepositoryPort,
  ) {}

  async execute(upload: UploadedDataset): Promise<ImportPreview> {
    const contents = await this.reader.read(upload.buffer);
    if (!contents.header.includes('full_name') || !contents.header.includes('linkedin_url')) {
      throw new NotAProfileExportError();
    }

    const { withoutRepair, withRepair } = ingestBothWays(contents);

    // One round trip for both runs, since they describe the same people.
    const known = await this.storedHashes([...withoutRepair.profiles, ...withRepair.profiles]);
    const report = buildRowReport(withoutRepair.rows, withRepair.rows, known, ROW_REPORT_LIMIT);

    const preview: ImportPreview = {
      importId: randomUUID(),
      filename: upload.filename,
      sizeBytes: upload.buffer.byteLength,
      createdAt: new Date().toISOString(),
      status: 'previewed',
      counts: toImportCounts(withoutRepair.stats, classifyChanges(withoutRepair.profiles, known)),
      countsWithRepair: toRepairCounts(withRepair.stats, classifyChanges(withRepair.profiles, known)),
      // Realignment happens after a row has been accepted, so both runs reject exactly the same rows.
      rejections: withoutRepair.rejections,
      rows: report.rows,
      rowsOmitted: report.omitted,
      repairSample: withRepair.stats.realignments,
    };

    // Previews hold the whole upload; clearing the stale ones keeps that storage bounded.
    await this.sessions.deleteExpired(new Date());
    await this.sessions.create({
      importId: preview.importId,
      filename: preview.filename,
      sizeBytes: preview.sizeBytes,
      checksum: createHash('sha256').update(upload.buffer).digest('hex'),
      file: upload.buffer,
      preview,
      expiresAt: new Date(Date.now() + PREVIEW_TTL_MS),
    });
    // The report keeps three samples per reason; the session keeps every rejected line.
    await this.sessions.addRejections(preview.importId, withoutRepair.rejectedLines);

    return preview;
  }

  /** The stored report, with the status and counts the session carries now. */
  async findById(importId: string): Promise<ImportPreview> {
    const session = await this.sessions.findById(importId);
    if (!session) throw new ImportNotFoundError(importId);
    return { ...session.preview, status: session.status, counts: session.counts };
  }

  private async storedHashes(profiles: readonly Profile[]): Promise<ReadonlyMap<string, string>> {
    const usernames = [...new Set(profiles.map((profile) => profile.identity.linkedinUsername))];
    const stored = await this.repository.hashesFor(usernames);
    return new Map(stored.map((hash) => [hash.linkedinUsername, hash.contentHash]));
  }
}
