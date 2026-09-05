/** What the user asked for. A filter naming a field absent from the registry is rejected here. */

import { SEARCH_FIELD_BY_KEY, SearchField, SortKey } from './field-registry';

export type FilterValue =
  | { type: 'terms'; values: string[] }
  | { type: 'range'; min?: number; max?: number }
  | { type: 'date_range'; from?: string; to?: string }
  | { type: 'exists'; present: boolean };

export interface AppliedFilter {
  readonly field: SearchField;
  readonly value: FilterValue;
}

export interface Pagination {
  readonly page: number;
  readonly size: number;
}

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;

/** Elasticsearch refuses `from + size` past this without an index-level override. */
export const MAX_RESULT_WINDOW = 10_000;

export class UnknownFilterFieldError extends Error {
  constructor(readonly key: string) {
    super(`No filterable field named "${key}"`);
    this.name = 'UnknownFilterFieldError';
  }
}

export class SearchCriteria {
  private constructor(
    readonly keywords: string | undefined,
    readonly filters: readonly AppliedFilter[],
    readonly sort: SortKey,
    readonly pagination: Pagination,
    /** Facet keys the caller wants bucket counts for; empty means "every facetable field". */
    readonly facets: readonly string[],
  ) {}

  static create(input: {
    keywords?: string;
    filters?: Record<string, FilterValue>;
    sort?: SortKey;
    page?: number;
    size?: number;
    facets?: string[];
  }): SearchCriteria {
    const applied: AppliedFilter[] = [];
    for (const [key, value] of Object.entries(input.filters ?? {})) {
      const field = SEARCH_FIELD_BY_KEY.get(key);
      if (!field) throw new UnknownFilterFieldError(key);
      if (isEmptyFilter(value)) continue;
      applied.push({ field, value });
    }

    const keywords = input.keywords?.trim();
    return new SearchCriteria(
      keywords && keywords.length > 0 ? keywords : undefined,
      applied,
      input.sort ?? 'relevance',
      {
        page: Math.max(1, Math.floor(input.page ?? 1)),
        size: Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(input.size ?? DEFAULT_PAGE_SIZE))),
      },
      input.facets ?? [],
    );
  }

  get from(): number {
    return (this.pagination.page - 1) * this.pagination.size;
  }
}

function isEmptyFilter(value: FilterValue): boolean {
  switch (value.type) {
    case 'terms':
      return value.values.length === 0;
    case 'range':
      return value.min === undefined && value.max === undefined;
    case 'date_range':
      return value.from === undefined && value.to === undefined;
    case 'exists':
      return false;
  }
}
