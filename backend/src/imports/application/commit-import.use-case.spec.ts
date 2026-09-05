/** Commit is the only place the corpus changes, and it does not trust its own preview: */

import { CsvDatasetReader } from '../infrastructure/csv/csv-dataset.reader';
import { CommitImportUseCase } from './commit-import.use-case';
import { PreviewImportUseCase } from './preview-import.use-case';
import {
  ImportAlreadyCommittedError,
  ImportNotFoundError,
  PreviewExpiredError,
} from './import-errors';
import { ImportCounts } from '../domain/import-summary';
import { FakeImportSessionRepository } from 'src/test/fakes/fake-import-session.repository';
import { FakeProfileRepository } from 'src/test/fakes/fake-profile.repository';
import { FakeProfileSearch } from 'src/test/fakes/fake-profile.search';
import {
  ALL_KEYS,
  EMAIL_PATTERN,
  FIXTURES,
  PHONE_PATTERN,
  csvOf,
  columnOf,
  rowOf,
  rowsOf,
  withUsername,
} from 'src/test/fakes';
import { toProfileDocument } from 'src/profiles/domain/search/profile-document';

class Harness {
  readonly journal: string[] = [];
  readonly repository = new FakeProfileRepository([], this.journal);
  readonly search = new FakeProfileSearch(this.journal);
  readonly sessions = new FakeImportSessionRepository(this.journal);
  private readonly reader = new CsvDatasetReader();
  readonly preview = new PreviewImportUseCase(this.reader, this.repository, this.sessions);
  readonly commit = new CommitImportUseCase(
    this.reader,
    this.sessions,
    this.repository,
    this.search,
  );

  /** Uploads a file and returns the import id a commit would be given. */
  async uploaded(rows: readonly (readonly string[])[] = rowsOf(...ALL_KEYS)): Promise<string> {
    const { importId } = await this.preview.execute({
      filename: 'export.csv',
      buffer: csvOf(rows),
    });
    this.journal.length = 0;
    return importId;
  }
}

const NONSENSE_COUNTS: ImportCounts = {
  rowsTotal: 9999,
  rowsAccepted: 9999,
  rowsRejected: 0,
  duplicatesCollapsed: 0,
  scrambledRows: 0,
  repairableRows: 0,
  realignedRows: 0,
  fieldsQuarantined: 0,
  profilesNew: 9999,
  profilesUpdated: 9999,
  profilesUnchanged: 9999,
};

describe('refusing to commit', () => {
  it('reports an import id nobody previewed as missing', async () => {
    const test = new Harness();

    await expect(
      test.commit.execute('11111111-2222-4333-8444-555555555555', { repair: false }),
    ).rejects.toBeInstanceOf(ImportNotFoundError);
    expect(test.repository.upserts).toEqual([]);
  });

  it('commits an import once: the second attempt is refused and writes nothing more', async () => {
    const test = new Harness();
    const importId = await test.uploaded();

    await test.commit.execute(importId, { repair: false });
    await expect(test.commit.execute(importId, { repair: false })).rejects.toBeInstanceOf(
      ImportAlreadyCommittedError,
    );

    expect(test.repository.upserts).toHaveLength(1);
    expect(test.search.indexedBatches).toHaveLength(1);
  });

  it('refuses a preview that timed out, and records that it has expired', async () => {
    const test = new Harness();
    const importId = await test.uploaded();
    test.sessions.setExpiresAt(importId, new Date(Date.now() - 1000));

    await expect(test.commit.execute(importId, { repair: false })).rejects.toBeInstanceOf(
      PreviewExpiredError,
    );

    expect(test.sessions.statusOf(importId)).toBe('expired');
    expect(test.repository.contents()).toEqual([]);
    await expect(test.commit.execute(importId, { repair: false })).rejects.toBeInstanceOf(
      PreviewExpiredError,
    );
  });
});

describe('committing an upload', () => {
  it('writes every person the file describes and reports how many were new', async () => {
    const test = new Harness();

    const result = await test.commit.execute(await test.uploaded(), { repair: false });

    expect(result.committed.profilesInserted).toBe(6);
    expect(result.committed.profilesUpdated).toBe(0);
    expect(test.repository.upserts[0].inserted).toHaveLength(6);
    expect(test.repository.upserts[0].updated).toEqual([]);
  });

  it('recomputes the counts from the stored bytes rather than believing the stored preview', async () => {
    const test = new Harness();
    const importId = await test.uploaded();
    test.sessions.overwriteCounts(importId, NONSENSE_COUNTS);

    const result = await test.commit.execute(importId, { repair: false });

    expect(result.committed.profilesInserted).toBe(6);
    expect(test.sessions.committedCounts[0]).toMatchObject({
      rowsTotal: 9,
      rowsAccepted: 6,
      rowsRejected: 3,
      profilesNew: 6,
    });
  });

  it('writes PostgreSQL before Elasticsearch, so a failed index leaves the corpus correct', async () => {
    const test = new Harness();

    await test.commit.execute(await test.uploaded(), { repair: false });

    expect(test.journal.indexOf('repository.upsertAll')).toBeLessThan(
      test.journal.indexOf('search.index'),
    );
  });

  it('indexes exactly the profiles it stored', async () => {
    const test = new Harness();

    const result = await test.commit.execute(await test.uploaded(), { repair: false });

    expect([...test.search.indexedUsernames()].sort()).toEqual(
      [...test.repository.usernames()].sort(),
    );
    expect(result.committed.indexed).toBe(6);
    expect(result.committed.indexFailures).toEqual([]);
  });

  it('records the commit with the counts this run produced', async () => {
    const test = new Harness();
    const importId = await test.uploaded();

    await test.commit.execute(importId, { repair: false });
    const stored = await test.preview.findById(importId);

    expect(stored.status).toBe('committed');
    expect(stored.counts.profilesNew).toBe(6);
    expect(stored.counts.rowsRejected).toBe(3);
  });
});

describe('when the search engine misbehaves', () => {
  it('keeps the corpus and the commit when the index rejects individual documents', async () => {
    const test = new Harness();
    test.search.failFor.add('tsmartin');
    const importId = await test.uploaded();

    const result = await test.commit.execute(importId, { repair: false });

    expect(result.committed.indexed).toBe(5);
    expect(result.committed.indexFailures).toEqual(['tsmartin: mapper_parsing_exception']);
    expect(test.repository.usernames()).toContain('tsmartin');
    expect(test.repository.contents()).toHaveLength(6);
    expect(test.sessions.statusOf(importId)).toBe('committed');
  });

  it('does not lose an import because the cluster is unreachable', async () => {
    const test = new Harness();
    test.search.indexRejectsWith = new Error('connect ECONNREFUSED 127.0.0.1:9200');
    const importId = await test.uploaded();

    const result = await test.commit.execute(importId, { repair: false });

    expect(result.committed.profilesInserted).toBe(6);
    expect(result.committed.indexed).toBe(0);
    expect(result.committed.indexFailures).toEqual([
      'indexing unavailable: connect ECONNREFUSED 127.0.0.1:9200',
    ]);
    expect(test.repository.contents()).toHaveLength(6);
    expect(test.sessions.statusOf(importId)).toBe('committed');
  });

  it('leaves the session committable when PostgreSQL refuses the write', async () => {
    const test = new Harness();
    test.repository.upsertRejectsWith = new Error('deadlock detected');
    const importId = await test.uploaded();

    await expect(test.commit.execute(importId, { repair: false })).rejects.toThrow(
      'deadlock detected',
    );

    expect(test.sessions.statusOf(importId)).toBe('previewed');
    expect(test.search.indexedUsernames()).toEqual([]);
  });
});

describe('choosing the repair policy at commit time', () => {
  it('stores the recovered values when repair is asked for, and the raw ones when it is not', async () => {
    const plain = new Harness();
    const repaired = new Harness();

    await plain.commit.execute(await plain.uploaded(), { repair: false });
    await repaired.commit.execute(await repaired.uploaded(), { repair: true });

    const asIs = plain.repository.stored('tsmartin')!;
    const moved = repaired.repository.stored('tsmartin')!;

    expect(asIs.skills ?? []).toEqual([]);
    expect(moved.skills).toHaveLength(50);
    expect(moved.contentHash).not.toBe(asIs.contentHash);
    expect(moved.quality.drifted).toBe(false);
    expect(asIs.quality.drifted).toBe(true);
  });

  it('reports fewer quarantined fields for the repaired run over the same file', async () => {
    const plain = new Harness();
    const repaired = new Harness();

    await plain.commit.execute(await plain.uploaded(), { repair: false });
    await repaired.commit.execute(await repaired.uploaded(), { repair: true });

    expect(repaired.sessions.committedCounts[0].fieldsQuarantined).toBeLessThan(
      plain.sessions.committedCounts[0].fieldsQuarantined,
    );
    expect(repaired.sessions.committedCounts[0].realignedRows).toBe(3);
  });
});

describe('importing the same people twice', () => {
  it('counts nobody new the second time and updates the rows in place', async () => {
    const test = new Harness();
    await test.commit.execute(await test.uploaded(), { repair: false });

    const second = await test.commit.execute(await test.uploaded(), { repair: false });

    expect(second.committed.profilesInserted).toBe(0);
    expect(second.committed.profilesUpdated).toBe(0);
    expect(test.repository.upserts[1].inserted).toEqual([]);
    expect(test.repository.upserts[1].updated).toHaveLength(6);
    expect(test.repository.contents()).toHaveLength(6);
  });

  it('is not fooled into an update by version_status, which carries no change signal', async () => {
    const test = new Harness();
    await test.commit.execute(await test.uploaded(rowsOf('clean')), { repair: false });
    const reexported = [...FIXTURES.clean];
    reexported[FIXTURES.header.indexOf('version_status')] =
      "{'status': 'no_change', 'contains': [], 'previous_version': '13.0', 'current_version': '13.0'}";

    const second = await test.commit.execute(await test.uploaded([reexported]), { repair: false });

    expect(second.committed.profilesUpdated).toBe(0);
    expect(test.sessions.committedCounts[1].profilesUnchanged).toBe(1);
  });

  it('counts a person whose row has changed as an update, and stores the newer row', async () => {
    const test = new Harness();
    await test.commit.execute(await test.uploaded(rowsOf('clean')), { repair: false });
    const changed = withUsername(FIXTURES.locallyDrifted, 'joeyholland');

    const second = await test.commit.execute(await test.uploaded([changed]), { repair: false });

    expect(second.committed.profilesInserted).toBe(0);
    expect(second.committed.profilesUpdated).toBe(1);
    expect(test.repository.stored('joeyholland')!.person.fullName).toBe('ray melick');
  });
});

/** Commit is the last gate before a value reaches Elasticsearch, where it becomes searchable. */
describe('personal data never reaching the index', () => {
  /** Every string the document carries, with the path it sits at. */
  function stringsIn(value: unknown, path: string): { path: string; text: string }[] {
    if (typeof value === 'string') return [{ path, text: value }];
    if (Array.isArray(value)) return value.flatMap((item, at) => stringsIn(item, `${path}[${at}]`));
    if (value && typeof value === 'object') {
      return Object.entries(value).flatMap(([key, child]) => stringsIn(child, `${path}.${key}`));
    }
    return [];
  }

  it('the source rows do carry contact details in columns that are not contact columns', () => {
    expect(columnOf(rowOf('scrambledOffsetMinus3'), 'twitter_username')).toMatch(EMAIL_PATTERN);
    expect(columnOf(rowOf('unrepairable'), 'twitter_username')).toMatch(PHONE_PATTERN);
  });

  it.each([true, false])(
    'indexes no email address and no phone number from any column, repair %s',
    async (repair) => {
      const test = new Harness();
      const importId = await test.uploaded();

      await test.commit.execute(importId, { repair });

      const documents = test.search.indexed.map((profile) => toProfileDocument(profile, new Date()));
      expect(documents.length).toBeGreaterThan(0);
      const leaked = documents.flatMap((document, at) =>
        stringsIn(document, `document[${at}]`).filter(
          ({ text }) => EMAIL_PATTERN.test(text) || PHONE_PATTERN.test(text),
        ),
      );
      expect(leaked).toEqual([]);
    },
  );

  it('drops the value rather than the row, so a leaky column costs one field and not one person', async () => {
    const test = new Harness();
    const importId = await test.uploaded(rowsOf('unrepairable'));

    await test.commit.execute(importId, { repair: true });

    const [profile] = test.search.indexed;
    expect(profile.social?.twitterUsername).toBeUndefined();
    expect(profile.quality.quarantined.map((entry) => entry.column)).toContain('twitter_username');
  });
});

describe('failures a commit refuses to dress up as success', () => {
  /** The session row and its bytes are two statements; the expiry sweep can run between them. */
  class SessionsWithoutPayload extends FakeImportSessionRepository {
    async findPayload(): Promise<Buffer | null> {
      return null;
    }
  }

  /** A client that rejects with a string rather than an Error, as a socket failure can. */
  class SearchThatRejectsWithAString extends FakeProfileSearch {
    async index(): Promise<never> {
      throw 'socket hang up';
    }
  }

  const reader = new CsvDatasetReader();

  async function uploadedTo(
    sessions: FakeImportSessionRepository,
    repository: FakeProfileRepository,
  ): Promise<string> {
    const { importId } = await new PreviewImportUseCase(reader, repository, sessions).execute({
      filename: 'export.csv',
      buffer: csvOf(rowsOf('clean')),
    });
    return importId;
  }

  it('reports an import whose bytes have gone as one it cannot find', async () => {
    const sessions = new SessionsWithoutPayload();
    const repository = new FakeProfileRepository();
    const importId = await uploadedTo(sessions, repository);
    const commit = new CommitImportUseCase(reader, sessions, repository, new FakeProfileSearch());

    await expect(commit.execute(importId, { repair: false })).rejects.toBeInstanceOf(
      ImportNotFoundError,
    );
    expect(repository.contents()).toHaveLength(0);
    expect(sessions.statusOf(importId)).toBe('previewed');
  });

  it('still commits when the search client rejects with something that is not an Error', async () => {
    const sessions = new FakeImportSessionRepository();
    const repository = new FakeProfileRepository();
    const importId = await uploadedTo(sessions, repository);
    const commit = new CommitImportUseCase(
      reader,
      sessions,
      repository,
      new SearchThatRejectsWithAString(),
    );

    const result = await commit.execute(importId, { repair: false });

    expect(result.committed.indexFailures).toEqual(['indexing unavailable: socket hang up']);
    expect(result.committed.profilesInserted).toBe(1);
    expect(repository.contents()).toHaveLength(1);
    expect(sessions.statusOf(importId)).toBe('committed');
  });
});
