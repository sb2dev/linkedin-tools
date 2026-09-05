import { Logger } from '@nestjs/common';
import { FakeProfileRepository, FakeProfileSearch, corpus } from 'src/test/fakes';
import { PurgeNotConfirmedError } from './import-errors';
import { PURGE_CONFIRMATION, PurgeCorpusUseCase } from './purge-corpus.use-case';

function harness(profiles = corpus(4)) {
  const journal: string[] = [];
  const repository = new FakeProfileRepository(profiles, journal);
  const search = new FakeProfileSearch(journal);
  return { journal, repository, search, purge: new PurgeCorpusUseCase(repository, search) };
}

const request = { confirmation: PURGE_CONFIRMATION, actor: 'admin' };

describe('PurgeCorpusUseCase', () => {
  let warnings: string[];

  beforeEach(() => {
    warnings = [];
    jest.spyOn(Logger.prototype, 'warn').mockImplementation((message: unknown) => {
      warnings.push(String(message));
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('refuses without the confirmation phrase, and touches nothing', async () => {
    const { journal, repository, purge } = harness();

    await expect(purge.execute({ confirmation: 'yes', actor: 'admin' })).rejects.toThrow(
      PurgeNotConfirmedError,
    );

    expect(journal).toEqual([]);
    expect(await repository.count()).toBe(4);
  });

  it('names the phrase it wanted, so the caller can send it without reading the source', async () => {
    const { purge } = harness();

    await expect(purge.execute({ confirmation: '', actor: 'admin' })).rejects.toThrow(
      PURGE_CONFIRMATION,
    );
  });

  it('empties PostgreSQL and then the index, the order a commit writes in', async () => {
    const { journal, purge } = harness();

    await purge.execute(request);

    expect(journal.indexOf('repository.deleteAll')).toBeLessThan(journal.indexOf('search.deleteAll'));
  });

  it('reports the number that was there, counted before the delete', async () => {
    const { purge } = harness(corpus(9));

    await expect(purge.execute(request)).resolves.toEqual({
      profilesDeleted: 9,
      indexCleared: true,
      importHistoryRetained: true,
    });
  });

  it('leaves the record empty', async () => {
    const { repository, purge } = harness();

    await purge.execute(request);

    expect(await repository.count()).toBe(0);
  });

  it('still reports the delete when the index could not be cleared, and says why', async () => {
    const { search, purge } = harness(corpus(2));
    search.unavailable = new Error('connect ECONNREFUSED 127.0.0.1:9200');

    const result = await purge.execute(request);

    expect(result).toEqual({
      profilesDeleted: 2,
      indexCleared: false,
      indexError: 'connect ECONNREFUSED 127.0.0.1:9200',
      importHistoryRetained: true,
    });
  });

  it('reports a non-Error rejection from the cluster as text rather than dropping it', async () => {
    const { search, purge } = harness();
    jest.spyOn(search, 'deleteAll').mockRejectedValue('cluster_block_exception');

    const result = await purge.execute(request);

    expect(result.indexCleared).toBe(false);
    expect(result.indexError).toBe('cluster_block_exception');
  });

  it('logs who asked and what it cost, before and after', async () => {
    const { purge } = harness(corpus(3));

    await purge.execute(request);

    expect(warnings[0]).toContain('admin asked to purge');
    expect(warnings[0]).toContain('3 profiles');
    expect(warnings[1]).toContain('search index cleared');
  });

  it('names the index failure in the log too, not only in the response', async () => {
    const { search, purge } = harness();
    search.unavailable = new Error('cluster down');

    await purge.execute(request);

    expect(warnings[1]).toContain('search index NOT cleared (cluster down)');
  });
});
