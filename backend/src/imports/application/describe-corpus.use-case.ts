/** What the corpus holds right now, and where it came from. */

import { Inject, Injectable } from '@nestjs/common';
import {
  PROFILE_REPOSITORY,
  ProfileRepositoryPort,
} from '../../profiles/domain/ports/profile-repository.port';
import {
  IMPORT_SESSION_REPOSITORY,
  ImportRunRecord,
  ImportSessionRepositoryPort,
} from '../domain/ports/import-session-repository.port';

export interface LastImport {
  readonly importId: string;
  readonly filename: string;
  /** ISO 8601, like every other timestamp on the wire. */
  readonly committedAt: string;
  readonly rowsAccepted: number;
  readonly profilesNew: number;
  readonly profilesUpdated: number;
}

export interface CorpusStatus {
  readonly profiles: number;
  /** Absent when nothing has ever been committed, which is also when profiles is 0. */
  readonly lastImport?: LastImport;
}

/** Enough history to find the newest committed run behind any previews that followed it. */
const SCANNED_RUNS = 20;

@Injectable()
export class DescribeCorpusUseCase {
  constructor(
    @Inject(PROFILE_REPOSITORY) private readonly repository: ProfileRepositoryPort,
    @Inject(IMPORT_SESSION_REPOSITORY) private readonly sessions: ImportSessionRepositoryPort,
  ) {}

  async execute(): Promise<CorpusStatus> {
    const profiles = await this.repository.count();
    const recent = await this.sessions.listRecent(SCANNED_RUNS);

    const last = recent.find(isCommitted);
    return last === undefined ? { profiles } : { profiles, lastImport: toLastImport(last) };
  }
}

/** A history row whose commit timestamp is present, so the narrowing below needs no fallback. */
type CommittedRun = ImportRunRecord & { readonly committedAt: Date };

/** listRecent is newest first, so the first committed run it holds is the newest one. */
function isCommitted(run: ImportRunRecord): run is CommittedRun {
  return run.status === 'committed' && run.committedAt !== undefined;
}

function toLastImport(run: CommittedRun): LastImport {
  return {
    importId: run.importId,
    filename: run.filename,
    committedAt: run.committedAt.toISOString(),
    rowsAccepted: run.counts.rowsAccepted,
    profilesNew: run.counts.profilesNew,
    profilesUpdated: run.counts.profilesUpdated,
  };
}
