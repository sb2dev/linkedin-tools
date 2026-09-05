/** A preview is the promise the import screen is built on: */

import { createHash } from 'node:crypto';
import { CsvDatasetReader } from '../infrastructure/csv/csv-dataset.reader';
import { PreviewImportUseCase, UploadedDataset } from './preview-import.use-case';
import { ImportNotFoundError, NotAProfileExportError } from './import-errors';
import { PREVIEW_TTL_MS } from '../domain/import-summary';
import { ingestDataset } from '../domain/dataset-ingestor';
import { Profile } from '../../profiles/domain/profile';
import { FakeImportSessionRepository } from 'src/test/fakes/fake-import-session.repository';
import { FakeProfileRepository } from 'src/test/fakes/fake-profile.repository';
import { FakeProfileSearch } from 'src/test/fakes/fake-profile.search';
import {
  ALL_KEYS,
  csvOf,
  EMAIL_PATTERN,
  FIXTURES,
  PHONE_PATTERN,
  rowsOf,
  withUsername,
} from 'src/test/fakes/dataset-fixture';

interface Harness {
  readonly useCase: PreviewImportUseCase;
  readonly repository: FakeProfileRepository;
  readonly search: FakeProfileSearch;
  readonly sessions: FakeImportSessionRepository;
  readonly journal: string[];
}

function harness(corpus: readonly Profile[] = []): Harness {
  const journal: string[] = [];
  const repository = new FakeProfileRepository(corpus, journal);
  const search = new FakeProfileSearch(journal);
  const sessions = new FakeImportSessionRepository(journal);
  return {
    useCase: new PreviewImportUseCase(new CsvDatasetReader(), repository, sessions),
    repository,
    search,
    sessions,
    journal,
  };
}

function upload(rows: readonly (readonly string[])[], filename = 'export.csv'): UploadedDataset {
  return { filename, buffer: csvOf(rows) };
}

const wholeFile = () => upload(rowsOf(...ALL_KEYS));

/** The people a file describes, as an earlier import of it would have left them in the corpus. */
async function alreadyImported(rows: readonly (readonly string[])[]): Promise<readonly Profile[]> {
  const contents = await new CsvDatasetReader().read(csvOf(rows));
  return ingestDataset(contents, { repair: false }).profiles;
}

describe('previewing an upload', () => {
  it('leaves the corpus and the search index untouched', async () => {
    const existing = await alreadyImported(rowsOf('clean'));
    const { useCase, repository, journal } = harness(existing);

    await useCase.execute(wholeFile());

    expect(repository.upserts).toEqual([]);
    expect(repository.contents()).toEqual(existing);
    expect(journal).not.toContain('repository.upsertAll');
    expect(journal.filter((call) => call.startsWith('search.'))).toEqual([]);
  });

  it('classifies everyone as new against an empty corpus instead of failing on the missing hashes', async () => {
    const { useCase } = harness();

    const preview = await useCase.execute(wholeFile());

    expect(preview.counts.profilesNew).toBe(6);
    expect(preview.counts.profilesUpdated).toBe(0);
    expect(preview.counts.profilesUnchanged).toBe(0);
  });

  it('tells apart a person stored verbatim, one whose row has changed, and one nobody has seen', async () => {
    const stored = await alreadyImported(rowsOf(...ALL_KEYS));
    const unchanged = stored[0];
    const drifted = { ...stored[1], contentHash: 'the hash of an older export' };
    const { useCase } = harness([unchanged, drifted]);

    const preview = await useCase.execute(wholeFile());

    expect(preview.counts).toMatchObject({
      profilesUnchanged: 1,
      profilesUpdated: 1,
      profilesNew: 4,
    });
  });

  it('counts people rather than rows: the change counts sum past a collapsed duplicate', async () => {
    const { useCase } = harness();

    const preview = await useCase.execute(upload(rowsOf('clean', 'clean', 'locallyDrifted')));
    const { profilesNew, profilesUpdated, profilesUnchanged, rowsAccepted, duplicatesCollapsed } =
      preview.counts;

    expect(rowsAccepted).toBe(3);
    expect(duplicatesCollapsed).toBe(1);
    expect(profilesNew + profilesUpdated + profilesUnchanged).toBe(2);
  });

  it('prices the repair option in the same response: more rows readable, fewer fields thrown away', async () => {
    const { useCase } = harness();

    const { counts, countsWithRepair } = await useCase.execute(wholeFile());

    expect(counts.rowsAccepted).toBe(countsWithRepair.rowsAccepted);
    expect(counts.scrambledRows).toBe(4);
    expect(countsWithRepair.scrambledRows).toBe(1);
    expect(counts.realignedRows).toBe(0);
    expect(countsWithRepair.realignedRows).toBe(3);
    expect(countsWithRepair.fieldsQuarantined).toBeLessThan(counts.fieldsQuarantined);
    expect(
      countsWithRepair.profilesNew +
        countsWithRepair.profilesUpdated +
        countsWithRepair.profilesUnchanged,
    ).toBe(counts.profilesNew + counts.profilesUpdated + counts.profilesUnchanged);
  });

  it('shows what a repair recovered, column by column, for the rows it moved', async () => {
    const { useCase } = harness();

    const { repairSample } = await useCase.execute(wholeFile());

    expect(repairSample).toHaveLength(3);
    for (const sample of repairSample) {
      expect(sample.linkedinUsername).not.toBe('');
      expect(sample.offset).toBeLessThan(0);
      expect(sample.before.skills).not.toBe(sample.after.skills);
    }
  });
});

describe('the rejection report', () => {
  // Rejected rows first, so the line number each sample claims is one this spec can name.
  const damaged = [
    ...rowsOf('junkUnrecoverable', 'junkUnrecoverable', 'junkUnrecoverable'),
    ...rowsOf('junkUnrecoverable', 'junkUnrecoverable', 'embeddedHeader', 'fieldCountMismatch'),
    ...rowsOf('clean'),
  ];

  it('groups rejections by reason, commonest first, with at most three example lines each', async () => {
    const { useCase } = harness();

    const { rejections, counts } = await useCase.execute(upload(damaged));

    expect(counts.rowsRejected).toBe(7);
    expect(rejections.map((group) => [group.reason, group.count])).toEqual([
      ['JUNK_LINE', 5],
      ['EMBEDDED_HEADER', 1],
      ['FIELD_COUNT_MISMATCH', 1],
    ]);
    for (const group of rejections) {
      expect(group.samples.length).toBeLessThanOrEqual(3);
      expect(group.label).not.toBe('');
    }
  });

  it('points every sample at the source line it came from', async () => {
    const { useCase } = harness();

    const { rejections } = await useCase.execute(upload(damaged));
    const byReason = new Map(rejections.map((group) => [group.reason, group]));

    expect(byReason.get('JUNK_LINE')!.samples.map((sample) => sample.lineNumber)).toEqual([2, 3, 4]);
    expect(byReason.get('EMBEDDED_HEADER')!.samples[0].lineNumber).toBe(7);
    for (const group of rejections) {
      for (const sample of group.samples) expect(sample.excerpt).not.toBe('');
    }
  });

  it('keeps every rejected line with the session, not just the three the report shows', async () => {
    const { useCase, sessions } = harness();

    const { importId, rejections } = await useCase.execute(upload(damaged));
    const stored = sessions.rejectionsOf(importId);

    expect(stored).toHaveLength(7);
    expect(stored.filter((line) => line.reason === 'JUNK_LINE')).toHaveLength(5);
    expect(rejections[0].samples.length).toBeLessThan(5);
  });

  it('reports nothing rejected for a file that only has a header', async () => {
    const { useCase } = harness();

    const preview = await useCase.execute(upload([]));

    expect(preview.counts.rowsTotal).toBe(0);
    expect(preview.rejections).toEqual([]);
    expect(preview.rows).toEqual([]);
    expect(preview.rowsOmitted).toBe(0);
    expect(preview.counts.profilesNew).toBe(0);
  });
});

describe('the stored session', () => {
  it('keeps the uploaded bytes and their checksum, so a commit never needs the file again', async () => {
    const { useCase, sessions } = harness();
    const uploaded = wholeFile();

    const preview = await useCase.execute(uploaded);
    const session = await sessions.findById(preview.importId);

    expect(sessions.payloadOf(preview.importId)!.equals(uploaded.buffer)).toBe(true);
    expect(session!.checksum).toBe(createHash('sha256').update(uploaded.buffer).digest('hex'));
    expect(preview.sizeBytes).toBe(uploaded.buffer.byteLength);
    expect(preview.filename).toBe('export.csv');
  });

  it('stays committable for the preview lifetime', async () => {
    const { useCase, sessions } = harness();

    const before = Date.now();
    const preview = await useCase.execute(wholeFile());
    const session = await sessions.findById(preview.importId);

    expect(session!.status).toBe('previewed');
    expect(session!.expiresAt.getTime()).toBeGreaterThanOrEqual(before + PREVIEW_TTL_MS);
  });

  it('drops previews that timed out before storing another whole upload', async () => {
    const { useCase, sessions, journal } = harness();
    const stale = await useCase.execute(wholeFile());
    sessions.setExpiresAt(stale.importId, new Date(Date.now() - 1));

    const fresh = await useCase.execute(wholeFile());

    expect(sessions.ids()).toEqual([fresh.importId]);
    expect(journal.indexOf('sessions.deleteExpired')).toBeLessThan(journal.indexOf('sessions.create'));
  });

  it('gives a second preview of the same bytes its own session and its own verdict', async () => {
    const { useCase, sessions } = harness();
    const uploaded = wholeFile();

    const first = await useCase.execute(uploaded);
    const second = await useCase.execute(uploaded);

    expect(second.importId).not.toBe(first.importId);
    expect(sessions.ids()).toHaveLength(2);
    expect(second.counts).toEqual(first.counts);
    expect(sessions.rejectionsOf(first.importId)).toHaveLength(3);
    expect(sessions.rejectionsOf(second.importId)).toHaveLength(3);
  });

  it('refuses a file that is not a profile export, and stores nothing for it', async () => {
    const { useCase, sessions } = harness();
    const notAnExport = { filename: 'orders.csv', buffer: Buffer.from('id,total\n1,9.99\n') };

    await expect(useCase.execute(notAnExport)).rejects.toBeInstanceOf(NotAProfileExportError);
    expect(sessions.ids()).toEqual([]);
  });
});

describe('reading a preview back', () => {
  it('answers with the status and counts the session carries now, not the ones it was written with', async () => {
    const { useCase, sessions } = harness();
    const preview = await useCase.execute(wholeFile());
    const committedCounts = { ...preview.counts, profilesNew: 6, profilesUnchanged: 0 };
    await sessions.markCommitted(preview.importId, new Date(), committedCounts);

    const reread = await useCase.findById(preview.importId);

    expect(reread.status).toBe('committed');
    expect(reread.counts).toEqual(committedCounts);
    expect(reread.rejections).toEqual(preview.rejections);
  });

  it('says which import is missing when there is no session for it', async () => {
    const { useCase } = harness();

    await expect(useCase.findById('76a2e0e6-0000-4000-8000-000000000000')).rejects.toThrow(
      ImportNotFoundError,
    );
  });
});

describe('what a preview is allowed to show', () => {
  it('describes every row of the upload, not a sample of them', async () => {
    const { useCase } = harness();
    const twelve = Array.from({ length: 12 }, (_unused, index) =>
      withUsername(FIXTURES.clean, `person-${index}`),
    );

    const preview = await useCase.execute(upload(twelve));

    expect(preview.counts.profilesNew).toBe(12);
    expect(preview.rows).toHaveLength(12);
    expect(preview.rowsOmitted).toBe(0);
    expect(preview.rows[0]).toMatchObject({
      lineNumber: 2,
      linkedinUsername: 'person-0',
      fullName: 'joseph holland',
      outcome: { status: 'new', totalSkills: 50 },
    });
  });

  it('accounts for every line of a damaged file, whatever it made of it', async () => {
    const { useCase } = harness();

    const preview = await useCase.execute(wholeFile());
    const statuses = preview.rows.map((row) => row.outcome.status);

    expect(preview.rows).toHaveLength(preview.counts.rowsTotal);
    expect(statuses.filter((status) => status === 'rejected')).toHaveLength(
      preview.counts.rowsRejected,
    );
    expect(statuses.filter((status) => status !== 'rejected')).toHaveLength(
      preview.counts.rowsAccepted,
    );
    expect(preview.rows.filter((row) => row.withRepair?.realigned)).toHaveLength(
      preview.countsWithRepair.realignedRows,
    );
    expect(preview.rows.filter((row) => row.outcome.scrambled)).toHaveLength(
      preview.counts.scrambledRows,
    );
  });

  it('carries no email address and no phone number, whichever column the source hid them in', async () => {
    const { useCase } = harness();

    const preview = await useCase.execute(wholeFile());
    const report = JSON.stringify(preview);

    expect(report).not.toMatch(EMAIL_PATTERN);
    expect(report).not.toMatch(PHONE_PATTERN);
  });
});
