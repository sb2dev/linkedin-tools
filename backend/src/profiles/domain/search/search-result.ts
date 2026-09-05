/** What a search returns: the page of hits, the total, and the facet counts that drive the filters. */

export interface FacetBucket {
  readonly value: string;
  readonly count: number;
}

export interface Facet {
  /** Registry key of the field these buckets belong to. */
  readonly key: string;
  readonly buckets: readonly FacetBucket[];
  /** Values beyond the returned buckets; entries rather than people on a nested field. */
  readonly otherCount: number;
}

/** A profile trimmed to what a result row shows, so the list does not ship whole documents. */
export interface ProfileSummary {
  readonly linkedinUsername: string;
  readonly fullName: string;
  readonly jobTitle?: string;
  readonly companyName?: string;
  readonly industry?: string;
  readonly location?: string;
  readonly yearsExperience?: number;
  readonly skills: readonly string[];
  readonly totalSkills: number;
  readonly qualityScore: number;
  readonly repaired: boolean;
  /** Term highlights keyed by field, when the query produced any. */
  readonly highlights?: Readonly<Record<string, readonly string[]>>;
  readonly score?: number;
}

export interface SearchResult {
  readonly items: readonly ProfileSummary[];
  readonly total: number;
  readonly page: number;
  readonly size: number;
  readonly facets: readonly Facet[];
  readonly tookMs: number;
}
