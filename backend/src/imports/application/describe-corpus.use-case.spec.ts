import { FakeImportSessionRepository, FakeProfileRepository, corpus } from 'src/test/fakes';
import { ImportCounts, ImportPreview } from '../domain/import-summary';
import { DescribeCorpusUseCase } from './describe-corpus.use-case';

const NO_COUNTS: ImportCounts = {
  rowsTotal: 0,
  rowsAccepted: 0,
  rowsRejected: 0,
  duplicatesCollapsed: 0,
  profilesNew: 0,
  profilesUpdated: 0,
  profilesUnchanged: 0,
  scrambledRows: 0,
  repairableRows: 0,
  realignedRows: 0,
  fieldsQuarantined: 0,
};

function previewWith(counts: Partial<ImportCounts>): ImportPreview {
  return {
    importId: 'unused',
    filename: 'export.csv',
    counts: { ...NO_COUNTS, ...counts },
    rejections: [],
    rows: [],
    samples: [],
    expiresAt: new Date('2030-01-01').toISOString(),
  } as unknown as ImportPreview;
}

function harness(profiles = corpus(0)) {
  const journal: string[] = [];
  const repository = new FakeProfileRepository(profiles, journal);
  const sessions = new FakeImportSessionRepository(journal);
  return { journal, repository, sessions, describe: new DescribeCorpusUseCase(repository, sessions) };
}

/** Adds a run to the history, committed or not, at a chosen creation time. */
async function addRun(
  sessions: FakeImportSessionRepository,
  options: { importId: string; filename?: string; createdAt: Date; committedAt?: Date; counts?: Partial<ImportCounts> },
): Promise<void> {
  sessions.clock = () => options.createdAt;
  await sessions.create({
    importId: options.importId,
    filename: options.filename ?? 'export.csv',
    sizeBytes: 10,
    checksum: `sum-${options.importId}`,
    file: Buffer.from('a'),
    preview: previewWith(options.counts ?? {}),
    expiresAt: new Date('2030-01-01'),
  });
  if (options.committedAt) {
    await sessions.markCommitted(options.importId, options.committedAt, {
      ...NO_COUNTS,
      ...options.counts,
    });
  }
}

describe('DescribeCorpusUseCase', () => {
  it('reports an empty corpus with no import behind it', async () => {
    const { describe: useCase } = harness();

    await expect(useCase.execute()).resolves.toEqual({ profiles: 0 });
  });

  it('counts what PostgreSQL holds, not what the index thinks', async () => {
    const { journal, describe: useCase } = harness(corpus(12));

    const status = await useCase.execute();

    expect(status.profiles).toBe(12);
    expect(journal).toContain('repository.count');
    expect(journal).not.toContain('search.search');
  });

  it('names the import that filled it, with the counts the commit recorded', async () => {
    const { sessions, describe: useCase } = harness(corpus(5));
    await addRun(sessions, {
      importId: 'run-1',
      filename: '300 user linkedin.csv',
      createdAt: new Date('2026-09-01T10:00:00Z'),
      committedAt: new Date('2026-09-01T10:05:00Z'),
      counts: { rowsAccepted: 302, profilesNew: 265, profilesUpdated: 0 },
    });

    const status = await useCase.execute();

    expect(status.lastImport).toEqual({
      importId: 'run-1',
      filename: '300 user linkedin.csv',
      committedAt: '2026-09-01T10:05:00.000Z',
      rowsAccepted: 302,
      profilesNew: 265,
      profilesUpdated: 0,
    });
  });

  it('ignores a preview that was never committed, however recent it is', async () => {
    const { sessions, describe: useCase } = harness(corpus(5));
    await addRun(sessions, { importId: 'never', createdAt: new Date('2026-09-02T10:00:00Z') });

    await expect(useCase.execute()).resolves.toEqual({ profiles: 5 });
  });

  it('picks the newest committed run when a later preview sits on top of it', async () => {
    const { sessions, describe: useCase } = harness(corpus(5));
    await addRun(sessions, {
      importId: 'older',
      createdAt: new Date('2026-09-01T10:00:00Z'),
      committedAt: new Date('2026-09-01T10:05:00Z'),
    });
    await addRun(sessions, {
      importId: 'newer',
      createdAt: new Date('2026-09-03T10:00:00Z'),
      committedAt: new Date('2026-09-03T10:05:00Z'),
    });
    await addRun(sessions, { importId: 'uncommitted', createdAt: new Date('2026-09-04T10:00:00Z') });

    const status = await useCase.execute();

    expect(status.lastImport?.importId).toBe('newer');
  });

  it('scans a bounded slice of the history rather than the whole table', async () => {
    const { sessions, describe: useCase } = harness();

    await useCase.execute();

    expect(sessions.listRecentLimits).toEqual([20]);
  });
});
