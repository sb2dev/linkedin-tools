/**
 * The one in-memory ProfileRepositoryPort the whole suite uses, keyed by business key the way the
 * real table is. Written by hand rather than mocked so it catches the ordering and idempotence bugs
 * a mock cannot: a second upsert of the same person updates instead of inserting, and hashesFor
 * answers only for the keys it actually holds.
 */

import { Profile } from 'src/profiles/domain/profile';
import {
  ProfileRepositoryPort,
  StoredHash,
} from 'src/profiles/domain/ports/profile-repository.port';

/** What one upsertAll call did, split the way the corpus experienced it. */
export interface UpsertRecord {
  readonly inserted: readonly string[];
  readonly updated: readonly string[];
}

export class FakeProfileRepository implements ProfileRepositoryPort {
  readonly profiles = new Map<string, Profile>();

  /** Port calls in order. Share one array with the other fakes to assert cross-store ordering. */
  readonly journal: string[];
  readonly upserts: UpsertRecord[] = [];
  /** Every hashesFor argument, so a spec can see how many round trips a classification took. */
  readonly hashLookups: (readonly string[])[] = [];
  /** Every username asked of findByUsername, in order. */
  readonly lookups: string[] = [];
  readonly streamBatchSizes: number[] = [];

  /** When set, upsertAll rejects the way a failed transaction does, writing nothing. */
  upsertRejectsWith?: Error;
  /** When set, every call rejects, the way an unreachable database does. */
  unavailable: Error | null = null;

  constructor(seed: readonly Profile[] = [], journal: string[] = []) {
    this.journal = journal;
    this.putAll(seed);
  }

  /** Seeds rows without going through upsertAll, to stand for what an earlier run left. */
  putAll(profiles: readonly Profile[]): void {
    for (const profile of profiles) this.profiles.set(profile.identity.linkedinUsername, profile);
  }

  async upsertAll(profiles: readonly Profile[]): Promise<void> {
    this.journal.push('repository.upsertAll');
    if (this.unavailable) throw this.unavailable;
    if (this.upsertRejectsWith) throw this.upsertRejectsWith;

    const inserted: string[] = [];
    const updated: string[] = [];
    for (const profile of profiles) {
      const key = profile.identity.linkedinUsername;
      (this.profiles.has(key) ? updated : inserted).push(key);
      this.profiles.set(key, profile);
    }
    this.upserts.push({ inserted, updated });
  }

  async findByUsername(username: string): Promise<Profile | null> {
    this.journal.push('repository.findByUsername');
    this.lookups.push(username);
    if (this.unavailable) throw this.unavailable;
    return this.profiles.get(username) ?? null;
  }

  async hashesFor(usernames: readonly string[]): Promise<readonly StoredHash[]> {
    this.journal.push('repository.hashesFor');
    this.hashLookups.push([...usernames]);
    if (this.unavailable) throw this.unavailable;

    const found: StoredHash[] = [];
    for (const username of usernames) {
      const profile = this.profiles.get(username);
      if (profile) found.push({ linkedinUsername: username, contentHash: profile.contentHash });
    }
    return found;
  }

  async *streamAll(batchSize: number): AsyncIterable<readonly Profile[]> {
    this.journal.push('repository.streamAll');
    this.streamBatchSizes.push(batchSize);
    if (this.unavailable) throw this.unavailable;
    if (batchSize < 1) throw new Error(`streamAll needs a positive batch size, got ${batchSize}`);

    const all = [...this.profiles.values()];
    for (let offset = 0; offset < all.length; offset += batchSize) {
      yield all.slice(offset, offset + batchSize);
    }
  }

  async count(): Promise<number> {
    this.journal.push('repository.count');
    if (this.unavailable) throw this.unavailable;
    return this.profiles.size;
  }

  async deleteAll(): Promise<void> {
    this.journal.push('repository.deleteAll');
    if (this.unavailable) throw this.unavailable;
    this.profiles.clear();
  }

  // Test-side accessors.

  /** The corpus as it stands, for asserting what a write left behind. */
  contents(): readonly Profile[] {
    return [...this.profiles.values()];
  }

  usernames(): readonly string[] {
    return [...this.profiles.keys()];
  }

  stored(username: string): Profile | undefined {
    return this.profiles.get(username);
  }
}
