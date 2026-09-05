/** Empties the corpus for an operator. */

import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  PROFILE_REPOSITORY,
  ProfileRepositoryPort,
} from '../../profiles/domain/ports/profile-repository.port';
import { PROFILE_SEARCH, ProfileSearchPort } from '../../profiles/domain/ports/profile-search.port';
import { PurgeNotConfirmedError } from './import-errors';

/** Sent verbatim in the request body. A bare POST deletes nothing. */
export const PURGE_CONFIRMATION = 'DELETE ALL PROFILES';

export interface PurgeRequest {
  /** Must equal PURGE_CONFIRMATION. */
  readonly confirmation: string;
  /** Who the token said was calling; it goes in the log line. */
  readonly actor: string;
}

export interface PurgeResult {
  /** Counted before the delete, so the operator is told the number that was actually there. */
  readonly profilesDeleted: number;
  readonly indexCleared: boolean;
  /** Why the index was not cleared, when it was not. */
  readonly indexError?: string;
  readonly importHistoryRetained: boolean;
}

@Injectable()
export class PurgeCorpusUseCase {
  private readonly logger = new Logger(PurgeCorpusUseCase.name);

  constructor(
    @Inject(PROFILE_REPOSITORY) private readonly repository: ProfileRepositoryPort,
    @Inject(PROFILE_SEARCH) private readonly search: ProfileSearchPort,
  ) {}

  async execute(request: PurgeRequest): Promise<PurgeResult> {
    if (request.confirmation !== PURGE_CONFIRMATION) {
      throw new PurgeNotConfirmedError(PURGE_CONFIRMATION);
    }

    const profilesDeleted = await this.repository.count();
    this.logger.warn(
      `${request.actor} asked to purge the corpus: ${String(profilesDeleted)} profiles will be deleted`,
    );

    // PostgreSQL first, the same order commit writes in: the index can always be rebuilt.
    await this.repository.deleteAll();
    const index = await this.clearIndex();

    this.logger.warn(
      `${request.actor} purged the corpus: ${String(profilesDeleted)} profiles deleted, ` +
        (index.cleared ? 'search index cleared' : `search index NOT cleared (${String(index.error)})`),
    );

    return {
      profilesDeleted,
      indexCleared: index.cleared,
      ...(index.error === undefined ? {} : { indexError: index.error }),
      importHistoryRetained: true,
    };
  }

  /** On Elasticsearch this drops the index and recreates it empty. */
  private async clearIndex(): Promise<{ cleared: boolean; error?: string }> {
    try {
      await this.search.deleteAll();
      return { cleared: true };
    } catch (error) {
      return { cleared: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}
