/** The recent import runs, newest first. */

import { Inject, Injectable } from '@nestjs/common';
import { ImportRunSummary } from '../domain/import-summary';
import {
  IMPORT_SESSION_REPOSITORY,
  ImportRunRecord,
  ImportSessionRepositoryPort,
} from '../domain/ports/import-session-repository.port';

export interface ImportRunList {
  readonly runs: readonly ImportRunSummary[];
}

const RECENT_RUNS = 20;

@Injectable()
export class ListImportsUseCase {
  constructor(
    @Inject(IMPORT_SESSION_REPOSITORY) private readonly sessions: ImportSessionRepositoryPort,
  ) {}

  async execute(): Promise<ImportRunList> {
    const recent = await this.sessions.listRecent(RECENT_RUNS);
    return { runs: recent.map(toRunSummary) };
  }
}

/** Timestamps cross the wire as ISO strings. */
function toRunSummary(run: ImportRunRecord): ImportRunSummary {
  return {
    importId: run.importId,
    filename: run.filename,
    sizeBytes: run.sizeBytes,
    createdAt: run.createdAt.toISOString(),
    committedAt: run.committedAt?.toISOString(),
    status: run.status,
    counts: run.counts,
  };
}
