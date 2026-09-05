/** The search engine as the domain sees it, so no use case imports an Elasticsearch type. */

import { SearchCriteria } from '../search/search-criteria';
import { SearchResult } from '../search/search-result';
import { Profile } from '../profile';

export const PROFILE_SEARCH = Symbol('ProfileSearchPort');

export interface ProfileSearchPort {
  search(criteria: SearchCriteria): Promise<SearchResult>;

  /** Prefix completion for high-cardinality fields, where a bucket list would be useless. */
  suggest(fieldKey: string, prefix: string, limit: number): Promise<readonly string[]>;

  /** Creates the index with its mapping if it is absent. Idempotent. */
  ensureIndex(): Promise<void>;

  index(profiles: readonly Profile[]): Promise<{ indexed: number; failures: readonly string[] }>;

  deleteAll(): Promise<void>;
}
