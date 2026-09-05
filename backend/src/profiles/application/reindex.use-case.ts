/** Rebuilds the search index from PostgreSQL. */

import { Inject, Injectable } from '@nestjs/common';
import { PROFILE_REPOSITORY, ProfileRepositoryPort } from '../domain/ports/profile-repository.port';
import { PROFILE_SEARCH, ProfileSearchPort } from '../domain/ports/profile-search.port';

export interface ReindexResult {
  readonly indexed: number;
  readonly failures: readonly string[];
}

const BATCH_SIZE = 500;

@Injectable()
export class ReindexUseCase {
  constructor(
    @Inject(PROFILE_REPOSITORY) private readonly repository: ProfileRepositoryPort,
    @Inject(PROFILE_SEARCH) private readonly search: ProfileSearchPort,
  ) {}

  async execute(): Promise<ReindexResult> {
    // deleteAll recreates the index, so a cold cluster needs no separate ensureIndex.
    await this.search.deleteAll();

    let indexed = 0;
    const failures: string[] = [];

    for await (const batch of this.repository.streamAll(BATCH_SIZE)) {
      const result = await this.search.index(batch);
      indexed += result.indexed;
      failures.push(...result.failures);
    }

    return { indexed, failures };
  }
}
