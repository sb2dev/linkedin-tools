import { FakeProfileRepository, FakeProfileSearch, corpus } from 'src/test/fakes';
import { ReindexUseCase } from './reindex.use-case';

function harness(profiles = corpus(3)) {
  const journal: string[] = [];
  const repository = new FakeProfileRepository(profiles, journal);
  const search = new FakeProfileSearch(journal);
  return { journal, repository, search, reindex: new ReindexUseCase(repository, search) };
}

describe('ReindexUseCase', () => {
  it('empties the index before it refills it, so a deleted profile does not survive', async () => {
    const { journal, reindex } = harness();

    await reindex.execute();

    expect(journal[0]).toBe('search.deleteAll');
    expect(journal).toContain('repository.streamAll');
  });

  it('reports how many profiles landed', async () => {
    const { reindex } = harness(corpus(7));

    await expect(reindex.execute()).resolves.toEqual({ indexed: 7, failures: [] });
  });

  it('reads Postgres in batches rather than loading the corpus into memory', async () => {
    const { repository, reindex } = harness(corpus(2));

    await reindex.execute();

    expect(repository.streamBatchSizes).toEqual([500]);
  });

  it('indexes an empty corpus without complaint', async () => {
    const { reindex } = harness([]);

    await expect(reindex.execute()).resolves.toEqual({ indexed: 0, failures: [] });
  });

  it('carries the business keys the index refused, without failing the whole rebuild', async () => {
    const { search, reindex } = harness(corpus(3));
    search.failFor.add('person-1');

    const result = await reindex.execute();

    expect(result.indexed).toBe(2);
    expect(result.failures).toEqual([expect.stringContaining('person-1')]);
  });

  it('lets an unreachable cluster surface: a silent success would leave an empty index', async () => {
    const { search, reindex } = harness();
    search.unavailable = new Error('connect ECONNREFUSED 127.0.0.1:9200');

    await expect(reindex.execute()).rejects.toThrow('ECONNREFUSED');
  });
});
