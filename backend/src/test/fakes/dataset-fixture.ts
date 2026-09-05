/**
 * The one source of test data for the backend suite: test/fixtures/rows.json, whose every value is
 * a row lifted verbatim from the source export. Specs hand the CSV or JSON bytes built here to the
 * real reader, so an import is exercised from the uploaded buffer inwards rather than from a tidy
 * invented object, and realProfile() runs a real row through the real ingestion pipeline so a
 * profile fixture carries the same 50 skills, six jobs and personal data a live one carries.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ingestDataset } from 'src/imports/domain/dataset-ingestor';
import { Profile } from 'src/profiles/domain/profile';

export type FixtureKey =
  | 'clean'
  | 'scrambledOffsetMinus1'
  | 'scrambledOffsetMinus3'
  | 'locallyDrifted'
  | 'unrepairable'
  | 'junkPrefixed'
  | 'junkUnrecoverable'
  | 'embeddedHeader'
  | 'fieldCountMismatch';

type Fixtures = Record<FixtureKey, string[]> & { header: string[] };

export const FIXTURES: Fixtures = JSON.parse(
  readFileSync(join(__dirname, '../fixtures/rows.json'), 'utf8'),
) as Fixtures;

export const HEADER: readonly string[] = FIXTURES.header;

/** Every fixture row, in one file: six people, and one rejection of each kind. */
export const ALL_KEYS: readonly FixtureKey[] = [
  'clean',
  'scrambledOffsetMinus1',
  'scrambledOffsetMinus3',
  'locallyDrifted',
  'unrepairable',
  'junkPrefixed',
  'junkUnrecoverable',
  'embeddedHeader',
  'fieldCountMismatch',
];

export function rowOf(key: FixtureKey): string[] {
  return [...FIXTURES[key]];
}

export function rowsOf(...keys: readonly FixtureKey[]): string[][] {
  return keys.map(rowOf);
}

/** The upload as bytes: the fixture header followed by the given rows, quoted as CSV. */
export function csvOf(rows: readonly (readonly string[])[]): Buffer {
  const lines = [FIXTURES.header, ...rows].map((row) => row.map(quote).join(','));
  return Buffer.from(`${lines.join('\n')}\n`, 'utf8');
}

/**
 * The same upload as a JSON export: one object per row, keyed by the fixture header. Records name
 * their columns, so a row whose field count differs from the header cannot be expressed here - that
 * damage is a property of a delimited file, not of a keyed record.
 */
export function jsonOf(rows: readonly (readonly string[])[]): Buffer {
  const records = rows.map((row) =>
    Object.fromEntries(FIXTURES.header.map((column, at) => [column, row[at] ?? ''])),
  );
  return Buffer.from(JSON.stringify(records, null, 2), 'utf8');
}

/** One field of a fixture row by its source column name, for asserting what the file supplied. */
export function columnOf(fields: readonly string[], column: string): string {
  const at = FIXTURES.header.indexOf(column);
  if (at < 0) throw new Error(`no column named ${column}`);
  return fields[at] ?? '';
}

/** A real row under another business key, for building a file with more people than it has. */
export function withUsername(row: readonly string[], username: string): string[] {
  const copy = [...row];
  copy[FIXTURES.header.indexOf('linkedin_url')] = `linkedin.com/in/${username}`;
  copy[FIXTURES.header.indexOf('linkedin_username')] = username;
  return copy;
}

/**
 * The personal data the clean source row carries. Nothing the index holds and nothing an
 * unauthenticated caller is handed may contain any of these, whatever column they arrived in.
 */
export const PERSONAL_VALUES: readonly string[] = [
  'j3holland@yahoo.com',
  'jholland@responsiveed.com',
  'jjholland@garverusa.com',
  '+19402058928',
  '+12104346090',
];

let cached: Profile | undefined;

/** One real person: "joeyholland", 50 skills, three email addresses, two phone numbers. */
export function realProfile(): Profile {
  if (!cached) {
    const outcome = ingestDataset(
      { header: FIXTURES.header, rows: [{ lineNumber: 2, fields: FIXTURES.clean }] },
      { repair: true },
    );
    const [first] = outcome.profiles;
    if (!first) throw new Error('the clean fixture row no longer ingests into a profile');
    cached = first;
  }
  return cached;
}

/**
 * One person whose row the scrambling damaged past repair: "bradley-eisenhut-99761966", whose
 * quarantine audit trail holds four phone numbers, one of them in `twitter_username` - the column
 * the leak the audit missed travelled in.
 */
export function damagedProfile(): Profile {
  const outcome = ingestDataset(
    { header: FIXTURES.header, rows: [{ lineNumber: 2, fields: FIXTURES.unrepairable }] },
    { repair: true },
  );
  const [first] = outcome.profiles;
  if (!first) throw new Error('the unrepairable fixture row no longer ingests into a profile');
  return first;
}

/** The personal data that row carries, all of it in columns that hold no contact details. */
export const DAMAGED_PERSONAL_VALUES: readonly string[] = [
  '+18016738180',
  '+18129172921',
  '+15202076875',
  '+16067880195',
];

/**
 * The same person under another business key, for building a corpus rather than a row. The hash
 * stays 64 characters wide, because `content_hash` is a varchar(64) and a fixture that ignores that
 * passes against the in-memory fakes and fails against the real table.
 */
export function cloneProfileAs(profile: Profile, username: string): Profile {
  const suffix = `-${username}`;
  return {
    ...profile,
    identity: { ...profile.identity, linkedinUsername: username },
    contentHash: profile.contentHash.slice(0, 64 - suffix.length) + suffix,
  };
}

export function corpus(size: number): Profile[] {
  const base = realProfile();
  return Array.from({ length: size }, (_unused, index) => cloneProfileAs(base, `person-${index}`));
}

export function withContentHash(profile: Profile, contentHash: string): Profile {
  return { ...profile, contentHash };
}

/**
 * The two shapes of personal data the source rows carry. Ten of the seventy-seven columns hold one
 * or the other, and a scrambled row can move either into a column nobody would think to check.
 */
export const EMAIL_PATTERN = /[\w.%+-]+@[\w.-]+\.[a-z]{2,}/i;
export const PHONE_PATTERN = /\+\d{10,15}/;

/**
 * A minimal profile under a chosen business key, for the specs where only the key matters (how many
 * rows a health probe counts, how a rebuild batches them). Where the content matters, use
 * realProfile() instead: an invented object cannot carry the damage a real row carries.
 */
export function aProfile(username: string, overrides: Partial<Profile> = {}): Profile {
  return {
    identity: { linkedinUsername: username, linkedinUrl: `linkedin.com/in/${username}` },
    person: { fullName: 'Ada Lovelace' },
    contentHash: `hash-of-${username}`,
    quality: {
      fieldsPopulated: 12,
      fieldsQuarantined: 0,
      score: 1,
      quarantined: [],
      repaired: false,
      drifted: false,
    },
    ...overrides,
  };
}

function quote(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
