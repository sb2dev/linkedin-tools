/** Writes a previewed import into the corpus. */

import { Inject, Injectable } from '@nestjs/common';
import { Profile } from '../../profiles/domain/profile';
import {
  PROFILE_REPOSITORY,
  ProfileRepositoryPort,
} from '../../profiles/domain/ports/profile-repository.port';
import { PROFILE_SEARCH, ProfileSearchPort } from '../../profiles/domain/ports/profile-search.port';
import { ingestDataset } from '../domain/dataset-ingestor';
import { classifyChanges, ImportCounts, toImportCounts } from '../domain/import-summary';
import { DATASET_READER, DatasetReaderPort } from '../domain/ports/dataset-reader.port';
import {
  IMPORT_SESSION_REPOSITORY,
  ImportSessionRepositoryPort,
} from '../domain/ports/import-session-repository.port';
import {
  ImportAlreadyCommittedError,
  ImportNotFoundError,
  PreviewExpiredError,
} from './import-errors';

export interface CommitOptions {
  readonly repair: boolean;
}

export interface CommittedCounts {
  readonly profilesInserted: number;
  readonly profilesUpdated: number;
  readonly indexed: number;
  readonly indexFailures: readonly string[];
}

export interface CommitResult {
  readonly importId: string;
  readonly committed: CommittedCounts;
}

@Injectable()
export class CommitImportUseCase {
  constructor(
    @Inject(DATASET_READER) private readonly reader: DatasetReaderPort,
    @Inject(IMPORT_SESSION_REPOSITORY) private readonly sessions: ImportSessionRepositoryPort,
    @Inject(PROFILE_REPOSITORY) private readonly repository: ProfileRepositoryPort,
    @Inject(PROFILE_SEARCH) private readonly search: ProfileSearchPort,
  ) {}

  async execute(importId: string, options: CommitOptions): Promise<CommitResult> {
    const session = await this.sessions.findById(importId);
    if (!session) throw new ImportNotFoundError(importId);
    if (session.status === 'committed') throw new ImportAlreadyCommittedError(importId);
    if (session.status === 'expired' || session.expiresAt.getTime() <= Date.now()) {
      await this.sessions.markExpired(importId);
      throw new PreviewExpiredError(importId);
    }

    const payload = await this.sessions.findPayload(importId);
    if (!payload) throw new ImportNotFoundError(importId);
    const contents = await this.reader.read(payload);
    const { profiles, stats } = ingestDataset(contents, { repair: options.repair });

    // Measured before the write, so the history records what this run changed.
    const stored = await this.storedHashes(profiles);
    const counts: ImportCounts = toImportCounts(stats, classifyChanges(profiles, stored));

    // PostgreSQL first: a failed index run leaves the record intact and is fixed by a reindex.
    await this.repository.upsertAll(profiles);
    const { indexed, failures } = await this.indexAll(profiles);

    await this.sessions.markCommitted(importId, new Date(), counts);

    return {
      importId,
      committed: {
        profilesInserted: counts.profilesNew,
        profilesUpdated: counts.profilesUpdated,
        indexed,
        indexFailures: failures,
      },
    };
  }

  private async storedHashes(profiles: readonly Profile[]): Promise<ReadonlyMap<string, string>> {
    const stored = await this.repository.hashesFor(
      profiles.map((profile) => profile.identity.linkedinUsername),
    );
    return new Map(stored.map((hash) => [hash.linkedinUsername, hash.contentHash]));
  }

  /** An unreachable search engine is reported like any other indexing failure, not as a lost import. */
  private async indexAll(
    profiles: readonly Profile[],
  ): Promise<{ indexed: number; failures: readonly string[] }> {
    try {
      return await this.search.index(profiles);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return { indexed: 0, failures: [`indexing unavailable: ${detail}`] };
    }
  }
}
