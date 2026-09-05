/** Every row is a fixture lifted verbatim from the reference export: */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ingestBothWays, ingestDataset } from './dataset-ingestor';
import { DatasetContents } from './ports/dataset-reader.port';
import { RejectionReason } from './validation/row-classification';

const FIXTURES: Record<string, string[]> & { header: string[] } = JSON.parse(
  readFileSync(join(__dirname, '../../test/fixtures/rows.json'), 'utf8'),
);

const header = FIXTURES.header;

/** Line numbers start at 2 because line 1 of a dataset is its header. */
const dataset = (...rows: string[][]): DatasetContents => ({
  header,
  rows: rows.map((fields, index) => ({ lineNumber: index + 2, fields })),
});

const ingest = (contents: DatasetContents, repair = false) => ingestDataset(contents, { repair });

const blankOut = (row: string[], columns: readonly string[]): string[] => {
  const copy = [...row];
  for (const column of columns) copy[header.indexOf(column)] = '';
  return copy;
};

const withValue = (row: string[], column: string, value: string): string[] => {
  const copy = [...row];
  copy[header.indexOf(column)] = value;
  return copy;
};

const hashesOf = (profiles: readonly { identity: { linkedinUsername: string }; contentHash: string }[]) =>
  Object.fromEntries(profiles.map((p) => [p.identity.linkedinUsername, p.contentHash]));

describe('rejected rows', () => {
  it('reports every reason with its count, label and line number', () => {
    const outcome = ingest(
      dataset(
        FIXTURES.clean,
        FIXTURES.junkUnrecoverable,
        FIXTURES.embeddedHeader,
        FIXTURES.fieldCountMismatch,
      ),
    );

    expect(outcome.stats).toMatchObject({ rowsTotal: 4, rowsAccepted: 1, rowsRejected: 3 });
    expect(outcome.rejections.map((r) => r.reason).sort()).toEqual([
      RejectionReason.EmbeddedHeader,
      RejectionReason.FieldCountMismatch,
      RejectionReason.JunkLine,
    ]);

    const junk = outcome.rejections.find((r) => r.reason === RejectionReason.JunkLine);
    expect(junk?.count).toBe(1);
    expect(junk?.label).toMatch(/artifact/i);
    expect(junk?.samples[0].lineNumber).toBe(3);
    expect(junk?.samples[0].excerpt.length).toBeGreaterThan(0);
  });

  it('keeps at most three samples of a reason, however often it occurs', () => {
    const outcome = ingest(dataset(...Array<string[]>(5).fill(FIXTURES.junkUnrecoverable)));

    const junk = outcome.rejections.find((r) => r.reason === RejectionReason.JunkLine);
    expect(junk?.count).toBe(5);
    expect(junk?.samples).toHaveLength(3);
  });

  it('rejects a row that carries no identity, even though its shape is right', () => {
    const outcome = ingest(dataset(new Array<string>(header.length).fill('')));

    expect(outcome.profiles).toHaveLength(0);
    expect(outcome.rejections[0]).toMatchObject({ reason: RejectionReason.NoIdentity, count: 1 });
  });
});

describe('structural recovery', () => {
  it('imports the record hidden behind a source-dump prefix', () => {
    const outcome = ingest(dataset(FIXTURES.junkPrefixed));

    expect(outcome.stats).toMatchObject({ rowsAccepted: 1, rowsRejected: 0, repairableRows: 1 });
    expect(outcome.profiles[0].identity.linkedinUsername).toBe('gary-deland-31753438');
    expect(outcome.profiles[0].quality.repaired).toBe(true);
  });

  it('recovers prefixed rows whether or not block repair was asked for', () => {
    const contents = dataset(FIXTURES.junkPrefixed);

    expect(ingest(contents, false).profiles).toHaveLength(1);
    expect(ingest(contents, true).profiles).toHaveLength(1);
  });
});

describe('duplicate collapse', () => {
  it('drops a byte-identical repeat of the same person', () => {
    const outcome = ingest(dataset(FIXTURES.clean, FIXTURES.clean));

    expect(outcome.stats).toMatchObject({ rowsAccepted: 2, duplicatesCollapsed: 1 });
    expect(outcome.profiles).toHaveLength(1);
  });

  it('keeps the fuller record when two rows disagree, whichever order they arrive in', () => {
    const sparse = blankOut(FIXTURES.clean, [
      'skills',
      'experience',
      'education',
      'job_title',
      'job_company_name',
      'industry',
    ]);
    const expected = ingest(dataset(FIXTURES.clean)).profiles[0].quality.fieldsPopulated;

    for (const rows of [[sparse, FIXTURES.clean], [FIXTURES.clean, sparse]]) {
      const outcome = ingest(dataset(...rows));
      expect(outcome.profiles).toHaveLength(1);
      expect(outcome.stats.duplicatesCollapsed).toBe(1);
      expect(outcome.profiles[0].quality.fieldsPopulated).toBe(expected);
    }
  });

  it('prefers the later row when both are equally complete', () => {
    const earlier = withValue(FIXTURES.clean, 'job_title', 'chief recruiting officer');
    const later = withValue(FIXTURES.clean, 'job_title', 'head of recruiting');

    const outcome = ingest(dataset(earlier, later));

    expect(outcome.profiles).toHaveLength(1);
    expect(outcome.profiles[0].job?.title).toBe('head of recruiting');
  });
});

describe('block repair', () => {
  const scrambled = dataset(
    FIXTURES.clean,
    FIXTURES.scrambledOffsetMinus1,
    FIXTURES.scrambledOffsetMinus3,
    FIXTURES.unrepairable,
  );

  it('quarantines fewer fields once the proven offsets are applied', () => {
    const { withoutRepair, withRepair } = ingestBothWays(scrambled);

    expect(withoutRepair.stats.scrambledRows).toBe(3);
    expect(withRepair.stats.scrambledRows).toBe(1);
    expect(withRepair.stats.fieldsQuarantined).toBeLessThan(withoutRepair.stats.fieldsQuarantined);
    expect(withoutRepair.profiles).toHaveLength(withRepair.profiles.length);
  });

  it('shows what moved, with the offset it was proven at', () => {
    const { withRepair } = ingestBothWays(scrambled);

    expect(withRepair.stats.realignments.map((r) => r.offset)).toEqual([-1, -3]);
    const sample = withRepair.stats.realignments.find((r) => r.offset === -3);
    expect(sample?.linkedinUsername).toBe('todddavis19');
    expect(sample?.before.skills).not.toBe(sample?.after.skills);
    expect(Object.keys(sample?.after ?? {})).toEqual(
      expect.arrayContaining(['skills', 'experience', 'education']),
    );
  });

  it('recovers the values a scrambled row was hiding', () => {
    const { withRepair } = ingestBothWays(scrambled);
    const todd = withRepair.profiles.find((p) => p.identity.linkedinUsername === 'todddavis19');

    expect(todd?.quality.drifted).toBe(false);
    expect(todd?.skills).toEqual(expect.arrayContaining(['crisis intervention']));
    expect(todd?.experience?.[0]).toBeDefined();
  });

  it('leaves a row untouched when no offset explains its whole block', () => {
    const { withoutRepair, withRepair } = ingestBothWays(scrambled);
    const before = withoutRepair.profiles.find(
      (p) => p.identity.linkedinUsername === 'bradley-eisenhut-99761966',
    );
    const after = withRepair.profiles.find(
      (p) => p.identity.linkedinUsername === 'bradley-eisenhut-99761966',
    );

    expect(after?.quality.drifted).toBe(true);
    expect(after?.contentHash).toBe(before?.contentHash);
  });

  it('never keeps a profile that is still drifted after a realignment', () => {
    const contents = dataset(
      FIXTURES.clean,
      FIXTURES.scrambledOffsetMinus1,
      FIXTURES.scrambledOffsetMinus3,
      FIXTURES.locallyDrifted,
      FIXTURES.unrepairable,
      FIXTURES.junkPrefixed,
    );
    const { withoutRepair, withRepair } = ingestBothWays(contents);
    const original = hashesOf(withoutRepair.profiles);

    // A realignment is adopted only when it removes the drift;
    for (const profile of withRepair.profiles) {
      if (!profile.quality.drifted) continue;
      expect(profile.contentHash).toBe(original[profile.identity.linkedinUsername]);
    }
    expect(withRepair.profiles.some((p) => p.quality.drifted)).toBe(true);
  });

  it('gives a single repairing run the same numbers the two-way comparison reports', () => {
    const { withoutRepair, withRepair } = ingestBothWays(scrambled);

    expect(hashesOf(ingest(scrambled, true).profiles)).toEqual(hashesOf(withRepair.profiles));
    expect(ingest(scrambled, true).stats).toEqual(withRepair.stats);
    expect(ingest(scrambled, false).stats).toEqual(withoutRepair.stats);
  });
});

describe('counts', () => {
  it('accounts for every row read', () => {
    const outcome = ingest(
      dataset(
        FIXTURES.clean,
        FIXTURES.clean,
        FIXTURES.scrambledOffsetMinus1,
        FIXTURES.junkPrefixed,
        FIXTURES.junkUnrecoverable,
        FIXTURES.embeddedHeader,
      ),
    );

    expect(outcome.stats.rowsTotal).toBe(6);
    expect(outcome.stats.rowsAccepted + outcome.stats.rowsRejected).toBe(6);
    expect(outcome.profiles).toHaveLength(
      outcome.stats.rowsAccepted - outcome.stats.duplicatesCollapsed,
    );
    expect(outcome.stats.repairableRows).toBe(1);
  });
});

/** A trimmed export: */
describe('a header that does not carry every column', () => {
  const renamed = (column: string): DatasetContents => ({
    header: header.map((name) => (name === column ? `${name}_unmapped` : name)),
    rows: [{ lineNumber: 2, fields: FIXTURES.scrambledOffsetMinus3 }],
  });

  it('still proves the offset, and leaves the undeclared column where it found it', () => {
    const outcome = ingestDataset(renamed('countries'), { repair: true });
    const [profile] = outcome.profiles;

    expect(profile.quality.drifted).toBe(false);
    expect(profile.skills).toEqual(expect.arrayContaining(['mental health']));
    // The column is not in this header, so nothing was coerced into it and nothing quarantined it.
    expect(profile.countryNames).toBeUndefined();
    expect(profile.quality.quarantined.map((q) => q.column)).not.toContain('countries');
  });

  it('leaves the undeclared column out of the before/after evidence', () => {
    const [sample] = ingestDataset(renamed('countries'), { repair: true }).stats.realignments;

    expect(Object.keys(sample.before)).toEqual(Object.keys(sample.after));
    expect(Object.keys(sample.before)).not.toContain('countries');
    expect(Object.keys(sample.before)).toContain('skills');
  });
});

/** The realigner proves an offset from the block alone. */
describe('a proven offset that the moved row does not survive', () => {
  const at = (column: string): number => header.indexOf(column);
  const cell = (column: string): string => FIXTURES.clean[at(column)];

  /** The header of an export that never carried `certifications`, so nothing reads that position. */
  const trimmedHeader = header.map((name) => (name === 'certifications' ? 'certifications_unmapped' : name));

  /** Values one place to the left of the column they belong to, which is a shift of -1. */
  const shiftedByOne = (): string[] => {
    const row = new Array<string>(header.length).fill('');
    row[at('full_name')] = cell('full_name');
    row[at('profiles')] = cell('profiles'); // the only thing identifying this row
    row[at('emails')] = cell('interests');
    row[at('interests')] = cell('skills');
    row[at('skills')] = cell('location_names');
    row[at('location_names')] = cell('interests');
    row[at('street_addresses')] = cell('experience');
    return row;
  };

  const contents: DatasetContents = {
    header: trimmedHeader,
    rows: [{ lineNumber: 2, fields: shiftedByOne() }],
  };

  it('keeps the person rather than the repair', () => {
    const outcome = ingestDataset(contents, { repair: true });
    const [profile] = outcome.profiles;

    expect(outcome.stats.rowsRejected).toBe(0);
    expect(profile.identity.linkedinUsername).toBe('joeyholland');
    // The row is still the drifted one: the offset was proven and then discarded.
    expect(profile.quality.drifted).toBe(true);
    expect(outcome.stats.realignedRows).toBe(0);
    expect(outcome.stats.realignments).toEqual([]);
  });
});
