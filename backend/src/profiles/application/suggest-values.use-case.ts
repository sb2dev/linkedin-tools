/** Completes a filter value from a prefix, for fields no dropdown can hold. */

import { Inject, Injectable } from '@nestjs/common';
import { SEARCH_FIELD_BY_KEY } from '../domain/search/field-registry';
import { UnknownFilterFieldError } from '../domain/search/search-criteria';
import { PROFILE_SEARCH, ProfileSearchPort } from '../domain/ports/profile-search.port';

export const DEFAULT_SUGGESTION_LIMIT = 10;
export const MAX_SUGGESTION_LIMIT = 50;

/** Raised for a field that exists but holds numbers, dates or a yes/no. */
export class NotSuggestableFieldError extends Error {
  constructor(readonly key: string) {
    super(`The field "${key}" holds no text values to complete`);
    this.name = 'NotSuggestableFieldError';
  }
}

@Injectable()
export class SuggestValuesUseCase {
  constructor(@Inject(PROFILE_SEARCH) private readonly search: ProfileSearchPort) {}

  async execute(fieldKey: string, prefix: string, limit?: number): Promise<readonly string[]> {
    const field = SEARCH_FIELD_BY_KEY.get(fieldKey);
    if (!field) throw new UnknownFilterFieldError(fieldKey);
    if (field.kind !== 'terms' && field.kind !== 'ordered_terms') {
      throw new NotSuggestableFieldError(fieldKey);
    }

    // The corpus is entirely lower case, so a capitalised prefix would otherwise match nothing.
    const wanted = prefix.trim().toLowerCase();
    const capped = clamp(limit);

    return field.options
      ? fromVocabulary(field.options, wanted, capped)
      : this.search.suggest(field.key, wanted, capped);
  }
}

function fromVocabulary(
  options: readonly string[],
  prefix: string,
  limit: number,
): readonly string[] {
  return options.filter((option) => option.toLowerCase().startsWith(prefix)).slice(0, limit);
}

function clamp(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_SUGGESTION_LIMIT;
  return Math.min(MAX_SUGGESTION_LIMIT, Math.max(1, Math.floor(limit)));
}
