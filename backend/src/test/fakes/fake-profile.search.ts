/**
 * The one in-memory ProfileSearchPort the whole suite uses. Written by hand rather than mocked so a
 * spec can assert what the caller asked the port for, which is the half of the contract a status
 * code does not cover, and so the two very different failures a cluster produces can both be
 * exercised: per-item bulk errors (failFor) and an unreachable cluster (unavailable).
 */

import { Profile } from 'src/profiles/domain/profile';
import { ProfileSearchPort } from 'src/profiles/domain/ports/profile-search.port';
import { SearchCriteria } from 'src/profiles/domain/search/search-criteria';
import { SearchResult } from 'src/profiles/domain/search/search-result';

export const EMPTY_RESULT: SearchResult = {
  items: [],
  total: 0,
  page: 1,
  size: 20,
  facets: [],
  tookMs: 3,
};

export interface SuggestCall {
  readonly fieldKey: string;
  readonly prefix: string;
  readonly limit: number;
}

export class FakeProfileSearch implements ProfileSearchPort {
  /** What the index holds now, so a stale document left behind by a rebuild is visible. */
  private readonly stored = new Map<string, Profile>();

  /** Port calls in order. Share one array with the other fakes to assert cross-store ordering. */
  readonly journal: string[];
  readonly criteria: SearchCriteria[] = [];
  readonly suggestCalls: SuggestCall[] = [];
  /** The profiles handed to each index() call, so batching is visible. */
  readonly indexedBatches: (readonly Profile[])[] = [];
  ensureIndexCalls = 0;
  deleteAllCalls = 0;

  result: SearchResult = EMPTY_RESULT;
  suggestions: readonly string[] = [];

  /** Business keys index() refuses; every other profile in the same batch still lands. */
  readonly failFor = new Set<string>();
  /** When set, index() rejects rather than reporting per-item failures. */
  indexRejectsWith?: Error;
  /** When set, every call that talks to the cluster rejects, the way an unreachable one does. */
  unavailable: Error | null = null;

  constructor(journal: string[] = []) {
    this.journal = journal;
  }

  async search(criteria: SearchCriteria): Promise<SearchResult> {
    this.journal.push('search.search');
    this.criteria.push(criteria);
    if (this.unavailable) throw this.unavailable;
    return this.result;
  }

  async suggest(fieldKey: string, prefix: string, limit: number): Promise<readonly string[]> {
    this.journal.push('search.suggest');
    this.suggestCalls.push({ fieldKey, prefix, limit });
    if (this.unavailable) throw this.unavailable;
    return this.suggestions;
  }

  async ensureIndex(): Promise<void> {
    this.journal.push('search.ensureIndex');
    this.ensureIndexCalls += 1;
  }

  async index(
    profiles: readonly Profile[],
  ): Promise<{ indexed: number; failures: readonly string[] }> {
    this.journal.push('search.index');
    this.indexedBatches.push(profiles);
    if (this.unavailable) throw this.unavailable;
    if (this.indexRejectsWith) throw this.indexRejectsWith;

    let indexed = 0;
    const failures: string[] = [];
    for (const profile of profiles) {
      const key = profile.identity.linkedinUsername;
      if (this.failFor.has(key)) {
        failures.push(`${key}: mapper_parsing_exception`);
        continue;
      }
      this.stored.set(key, profile);
      indexed += 1;
    }
    return { indexed, failures };
  }

  async deleteAll(): Promise<void> {
    this.journal.push('search.deleteAll');
    this.deleteAllCalls += 1;
    if (this.unavailable) throw this.unavailable;
    this.stored.clear();
  }

  // Test-side accessors and levers.

  /** Every profile handed to index(), in order, flattened across batches. */
  get indexed(): readonly Profile[] {
    return this.indexedBatches.flat();
  }

  indexedUsernames(): readonly string[] {
    return [...this.stored.keys()];
  }

  /** Puts a document in without going through index(), to stand for an earlier run. */
  seed(profiles: readonly Profile[]): void {
    for (const profile of profiles) this.stored.set(profile.identity.linkedinUsername, profile);
  }

  get lastCriteria(): SearchCriteria {
    const last = this.criteria[this.criteria.length - 1];
    if (!last) throw new Error('the search port was never called');
    return last;
  }
}
