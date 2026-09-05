/** The system of record: every profile, including the personal fields the index never holds. */

import { Profile } from '../profile';

export const PROFILE_REPOSITORY = Symbol('ProfileRepositoryPort');

export interface StoredHash {
  readonly linkedinUsername: string;
  readonly contentHash: string;
}

export interface ProfileRepositoryPort {
  /** Inserts or updates by business key, in one transaction. */
  upsertAll(profiles: readonly Profile[]): Promise<void>;

  findByUsername(username: string): Promise<Profile | null>;

  /** Content hashes for the given keys, used to classify an upload before it is committed. */
  hashesFor(usernames: readonly string[]): Promise<readonly StoredHash[]>;

  /** Streams every profile, for rebuilding the search index. */
  streamAll(batchSize: number): AsyncIterable<readonly Profile[]>;

  count(): Promise<number>;

  /** Empties the corpus. */
  deleteAll(): Promise<void>;
}
