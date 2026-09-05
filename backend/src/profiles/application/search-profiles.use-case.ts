import { Inject, Injectable } from '@nestjs/common';
import { PROFILE_SEARCH, ProfileSearchPort } from '../domain/ports/profile-search.port';
import { MAX_RESULT_WINDOW, SearchCriteria } from '../domain/search/search-criteria';
import { SearchResult } from '../domain/search/search-result';

export class ResultWindowExceededError extends Error {
  readonly maxPage: number;

  constructor(
    readonly page: number,
    readonly size: number,
  ) {
    super(
      `Cannot page past result ${MAX_RESULT_WINDOW}: page ${page} of size ${size} starts beyond it. ` +
        'Narrow the search instead.',
    );
    this.name = 'ResultWindowExceededError';
    this.maxPage = Math.max(1, Math.floor(MAX_RESULT_WINDOW / size));
  }
}

@Injectable()
export class SearchProfilesUseCase {
  constructor(@Inject(PROFILE_SEARCH) private readonly search: ProfileSearchPort) {}

  async execute(criteria: SearchCriteria): Promise<SearchResult> {
    const { page, size } = criteria.pagination;
    if (criteria.from + size > MAX_RESULT_WINDOW) {
      throw new ResultWindowExceededError(page, size);
    }

    return this.search.search(criteria);
  }
}
