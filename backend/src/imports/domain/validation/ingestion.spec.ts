import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { classifyRow, RejectionReason } from './row-classification';
import { ProfileRowValidator } from './profile-row.validator';
import { realignBlock } from './block-realigner';
import { COLUMN_CATALOG, COLUMN_SPEC_BY_SOURCE, MULTI_VALUE_BLOCK, SCRAMBLE_ANCHORS } from './column-catalog';

const FIXTURES: Record<string, string[]> & { header: string[] } = JSON.parse(
  readFileSync(join(__dirname, '../../../test/fixtures/rows.json'), 'utf8'),
);

const header = FIXTURES.header;
const indexOf = new Map(header.map((name, i) => [name.trim(), i]));
const classifyOptions = {
  expectedFieldCount: 77,
  nameIndex: header.indexOf('full_name'),
  urlIndex: header.indexOf('linkedin_url'),
  header,
};
const validator = new ProfileRowValidator(header);

const accept = (fields: string[], repaired = false) => {
  const result = validator.validate(fields, { repaired });
  if (result.status !== 'accepted') throw new Error(`expected acceptance, got ${result.reason}`);
  return result.profile;
};

describe('the column catalog', () => {
  it('covers every column in the source header exactly once', () => {
    const sources = COLUMN_CATALOG.map((spec) => spec.source);
    expect(new Set(sources).size).toBe(sources.length);
    expect(sources.sort()).toEqual([...header].sort());
  });

  it('maps every column to a distinct canonical field', () => {
    const targets = COLUMN_CATALOG.map((spec) => spec.target);
    expect(new Set(targets).size).toBe(targets.length);
  });

  it('draws its scramble anchors from the multi-value block', () => {
    for (const anchor of SCRAMBLE_ANCHORS) expect(MULTI_VALUE_BLOCK.has(anchor)).toBe(true);
  });

  describe('a column narrowed to a closed vocabulary', () => {
    const levels = COLUMN_SPEC_BY_SOURCE.get('job_title_levels')!;

    it('keeps the values the vocabulary knows and drops the rest', () => {
      expect(levels.coerce("['director', 'grand vizier']")).toEqual({ ok: true, value: ['director'] });
    });

    it('quarantines the cell when the vocabulary recognises nothing in it', () => {
      // Every value gone means this is another column's list, not a thinly populated one.
      expect(levels.coerce("['grand vizier']")).toMatchObject({
        ok: false,
        reason: expect.stringContaining('no value in:'),
      });
    });
  });
});

/** An export that does not carry all 77 columns, and a record that stops short of the header. */
describe('a header and a row that do not line up', () => {
  const renamedHeader = (column: string): string[] =>
    header.map((name) => (name === column ? `${name}_unmapped` : name));

  it('identifies the person from the columns the header does carry', () => {
    const narrow = new ProfileRowValidator(renamedHeader('linkedin_url'));
    const result = narrow.validate(FIXTURES.clean, { repaired: false });

    if (result.status !== 'accepted') throw new Error(`expected acceptance, got ${result.reason}`);
    expect(result.profile.identity.linkedinUsername).toBe('joeyholland');
    // Undeclared columns are not coerced at all, so none of them is quarantined either.
    expect(result.profile.quality.quarantined.map((q) => q.column)).not.toContain('linkedin_url');
  });

  it('rejects a row that stops short of the header rather than reading off its end', () => {
    expect(validator.validate(FIXTURES.clean.slice(0, 3), { repaired: false })).toMatchObject({
      status: 'rejected',
      reason: RejectionReason.NoIdentity,
    });
  });

  it('cannot recover a junk-prefixed row when the header names neither identity column', () => {
    const anonymousHeader = header.map((name) =>
      name === 'full_name' || name === 'linkedin_url' ? `${name}_unmapped` : name,
    );
    const result = classifyRow(FIXTURES.junkPrefixed, {
      expectedFieldCount: anonymousHeader.length,
      nameIndex: anonymousHeader.indexOf('full_name'),
      urlIndex: anonymousHeader.indexOf('linkedin_url'),
      header: anonymousHeader,
    });

    expect(result).toEqual({ status: 'rejected', reason: RejectionReason.JunkLine });
  });
});

describe('structural classification', () => {
  it('accepts a well-formed row', () => {
    expect(classifyRow(FIXTURES.clean, classifyOptions)).toMatchObject({ status: 'usable', repaired: false });
  });

  it('rejects a source-dump artifact that carries no recoverable record', () => {
    expect(classifyRow(FIXTURES.junkUnrecoverable, classifyOptions)).toEqual({
      status: 'rejected',
      reason: RejectionReason.JunkLine,
    });
  });

  it('rejects the CSV header when it reappears inside the data', () => {
    expect(classifyRow(FIXTURES.embeddedHeader, classifyOptions)).toEqual({
      status: 'rejected',
      reason: RejectionReason.EmbeddedHeader,
    });
  });

  it('rejects a record an unescaped delimiter destroyed', () => {
    expect(classifyRow(FIXTURES.fieldCountMismatch, classifyOptions)).toEqual({
      status: 'rejected',
      reason: RejectionReason.FieldCountMismatch,
    });
  });

  it('recovers a record hidden behind a source-dump prefix', () => {
    const result = classifyRow(FIXTURES.junkPrefixed, classifyOptions);
    expect(result.status).toBe('repairable');
    if (result.status !== 'repairable') return;
    expect(result.repairedFields).toHaveLength(77);
    // The realignment is only accepted because the recovered row proves itself.
    expect(accept(result.repairedFields, true).identity.linkedinUrl).toMatch(/^linkedin\.com\/in\//);
  });
});

describe('field-level validation', () => {
  it('keeps a clean row almost entirely intact', () => {
    const profile = accept(FIXTURES.clean);
    expect(profile.person.fullName).toBe('joseph holland');
    expect(profile.identity.linkedinUsername).toBe('joeyholland');
    expect(profile.job?.company?.name).toBe('garver');
    expect(profile.job?.company?.size).toBe('501-1000');
    expect(profile.skills).toContain('recruiting');
    expect(profile.quality.drifted).toBe(false);
    expect(profile.quality.score).toBeGreaterThan(0.9);
  });

  it('drops a locally shifted value without touching its neighbours', () => {
    const profile = accept(FIXTURES.locallyDrifted);
    expect(profile.metrics?.salaryBand).toBeUndefined();
    expect(profile.quality.quarantined.map((q) => q.column)).toContain('inferred_salary');
    expect(profile.skills?.length).toBeGreaterThan(0);
    expect(profile.quality.drifted).toBe(false);
  });

  it('never lets a quarantined field carry another column value', () => {
    const profile = accept(FIXTURES.scrambledOffsetMinus3);
    for (const field of profile.quality.quarantined) {
      const path = field.target.split('.');
      let cursor: unknown = profile;
      for (const segment of path) cursor = (cursor as Record<string, unknown> | undefined)?.[segment];
      expect(cursor).toBeUndefined();
    }
  });

  it('rejects a row with no name and no resolvable profile URL', () => {
    const anonymous = new Array(77).fill('');
    expect(validator.validate(anonymous, { repaired: false })).toMatchObject({
      status: 'rejected',
      reason: RejectionReason.NoIdentity,
    });
  });

  it('produces a stable content hash for identical input', () => {
    expect(accept(FIXTURES.clean).contentHash).toBe(accept(FIXTURES.clean).contentHash);
  });

  it('produces a different content hash when a value changes', () => {
    const altered = [...FIXTURES.clean];
    altered[header.indexOf('job_title')] = 'chief recruiting officer';
    expect(accept(altered).contentHash).not.toBe(accept(FIXTURES.clean).contentHash);
  });
});

describe('scramble detection', () => {
  it.each([
    ['a block shifted by one', 'scrambledOffsetMinus1'],
    ['a block shifted by three', 'scrambledOffsetMinus3'],
  ])('flags %s', (_label, fixture) => {
    expect(accept(FIXTURES[fixture]).quality.drifted).toBe(true);
  });

  it('refuses the well-formed but wrong values a scrambled block produces', () => {
    const profile = accept(FIXTURES.scrambledOffsetMinus3);
    expect(profile.skills).toBeUndefined();
    expect(profile.quality.quarantined.find((q) => q.column === 'skills')?.reason).toMatch(/scrambled/);
  });

  it('leaves a clean row alone', () => {
    expect(accept(FIXTURES.clean).quality.drifted).toBe(false);
  });
});

describe('block realignment', () => {
  it.each([
    ['scrambledOffsetMinus1', -1],
    ['scrambledOffsetMinus3', -3],
  ])('proves the offset for %s', (fixture, expected) => {
    expect(realignBlock(FIXTURES[fixture], indexOf)?.offset).toBe(expected);
  });

  it('restores the values a scrambled row was hiding', () => {
    const realigned = realignBlock(FIXTURES.scrambledOffsetMinus3, indexOf)!;
    const profile = accept(realigned.fields, true);

    expect(profile.quality.drifted).toBe(false);
    expect(profile.skills).toEqual(expect.arrayContaining(['mental health', 'crisis intervention']));
    expect(profile.experience?.[0]?.company?.name).toBe('devereux');
    expect(profile.education?.[0]?.school?.name).toBe('hocking college');
    // Independent corroboration: the recovered email domain matches the recovered employer.
    expect(profile.contact?.emails?.map((e) => e.address)).toContain('tdavis@devereux.org');
  });

  it('refuses to realign when no offset explains the whole block', () => {
    expect(realignBlock(FIXTURES.unrepairable, indexOf)).toBeNull();
  });

  it('leaves a clean row unchanged', () => {
    const realigned = realignBlock(FIXTURES.clean, indexOf);
    if (realigned) expect(realigned.fields).toEqual(FIXTURES.clean);
  });
});

describe('social handles', () => {
  const withHandle = (column: string, value: string): string[] => {
    const row = [...FIXTURES.clean];
    row[header.indexOf(column)] = value;
    return row;
  };

  it.each([
    ['twitter_username', '+19077643668'],
    ['twitter_username', 'tdavis@devereux.org'],
    ['facebook_username', '+12607606462'],
    ['github_username', 'mvanwormer@duluthtrading.com'],
  ])('quarantines contact details that drifted into %s', (column, value) => {
    const profile = accept(withHandle(column, value));
    expect(profile.quality.quarantined.map((q) => q.column)).toContain(column);
    expect(JSON.stringify(profile.social ?? {})).not.toContain(value);
  });

  it.each([
    ['twitter_username', 'joeyholland'],
    ['facebook_username', 'joseph.holand.79'],
    ['github_username', 'joey-holland'],
  ])('keeps a real handle in %s', (column, value) => {
    const profile = accept(withHandle(column, value));
    expect(JSON.stringify(profile.social ?? {})).toContain(value);
  });

  it('strips a leading @ rather than rejecting the handle', () => {
    expect(accept(withHandle('twitter_username', '@joeyholland')).social?.twitterUsername).toBe('joeyholland');
  });
});

describe('values the storage column cannot hold', () => {
  const withCell = (column: string, value: string): string[] => {
    const row = [...FIXTURES.clean];
    row[header.indexOf(column)] = value;
    return row;
  };

  // profiles.connections is int4.
  it.each([
    ['100008169421242', 'an id far past the int4 ceiling'],
    ['2147483648', 'one past the int4 ceiling exactly'],
    ['1400360002', 'an id that fits int4 but is not a connection count'],
  ])('quarantines %s in linkedin_connections (%s)', (value) => {
    const profile = accept(withCell('linkedin_connections', value));
    expect(profile.metrics?.connections).toBeUndefined();
    expect(profile.quality.quarantined.map((field) => field.column)).toContain('linkedin_connections');
  });

  it.each(['0', '500', '6663'])('keeps %s, which a profile can really carry', (value) => {
    expect(accept(withCell('linkedin_connections', value)).metrics?.connections).toBe(Number(value));
  });

  it('never lets a stored connection count exceed what the column accepts', () => {
    const INT4_MAX = 2_147_483_647;
    for (const value of ['100008169421242', '99999', '2147483647', '-1']) {
      const stored = accept(withCell('linkedin_connections', value)).metrics?.connections;
      if (stored !== undefined) expect(stored).toBeGreaterThanOrEqual(0);
      if (stored !== undefined) expect(stored).toBeLessThanOrEqual(INT4_MAX);
    }
  });
});
