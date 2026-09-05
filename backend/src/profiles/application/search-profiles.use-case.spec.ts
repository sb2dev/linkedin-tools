import { ProfileSearchPort } from '../domain/ports/profile-search.port';
import { SearchCriteria } from '../domain/search/search-criteria';
import { SearchResult } from '../domain/search/search-result';
import { ResultWindowExceededError, SearchProfilesUseCase } from './search-profiles.use-case';

const empty: SearchResult = { items: [], total: 0, page: 1, size: 20, facets: [], tookMs: 0 };

function useCase(): { search: jest.Mock; subject: SearchProfilesUseCase } {
  const search = jest.fn().mockResolvedValue(empty);
  return { search, subject: new SearchProfilesUseCase({ search } as unknown as ProfileSearchPort) };
}

describe('paging depth', () => {
  it('refuses to page past the result window instead of letting the cluster fail', async () => {
    const { subject, search } = useCase();

    await expect(subject.execute(SearchCriteria.create({ page: 501, size: 20 }))).rejects.toThrow(
      ResultWindowExceededError,
    );
    await expect(
      subject.execute(SearchCriteria.create({ page: 500, size: 20 })),
    ).resolves.toBe(empty);
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('says which page was the last one that would have worked', async () => {
    const { subject } = useCase();

    const error = await subject
      .execute(SearchCriteria.create({ page: 900, size: 20 }))
      .catch((thrown: ResultWindowExceededError) => thrown);

    expect((error as ResultWindowExceededError).maxPage).toBe(500);
  });
});
