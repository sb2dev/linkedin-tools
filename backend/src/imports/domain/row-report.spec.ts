/** The per-row verdict the preview table is built on, paired across the two repair policies. */

import { Profile } from 'src/profiles/domain/profile';
import { aProfile } from 'src/test/fakes';
import { IngestedRow, ROW_REPORT_LIMIT, buildRowReport } from './row-report';

function row(lineNumber: number, profile: Profile | undefined, extra: Partial<IngestedRow> = {}): IngestedRow {
  return { lineNumber, profile, duplicateRows: 0, ...extra };
}

/** Both policies produced the same thing, which is the ordinary case. */
function bothWays(rows: readonly IngestedRow[]) {
  return buildRowReport(rows, rows, new Map(), ROW_REPORT_LIMIT);
}

describe('buildRowReport', () => {
  it('carries who the row describes, so the table needs no second lookup', () => {
    const profile = aProfile('ada-lovelace', {
      person: { fullName: 'ada lovelace' },
      job: { title: 'engineer', companyName: 'analytical' },
    } as Partial<Profile>);

    const { rows } = bothWays([row(4, profile)]);

    expect(rows[0]).toMatchObject({
      lineNumber: 4,
      linkedinUsername: 'ada-lovelace',
      fullName: 'ada lovelace',
    });
  });

  it('reads the location the source spelled out', () => {
    const profile = aProfile('a', {
      location: { name: 'denton, texas, united states' },
    });

    expect(bothWays([row(1, profile)]).rows[0].location).toBe('denton, texas, united states');
  });

  it('builds a location out of its parts when the source gave no whole name', () => {
    const profile = aProfile('a', {
      location: { locality: 'denton', region: 'texas', country: 'united states' },
    });

    expect(bothWays([row(1, profile)]).rows[0].location).toBe('denton, texas, united states');
  });

  it('skips the parts the row left empty rather than printing gaps', () => {
    const profile = aProfile('a', { location: { country: 'united states' } });

    expect(bothWays([row(1, profile)]).rows[0].location).toBe('united states');
  });

  it('reports no location when the place object holds nothing usable', () => {
    const profile = aProfile('a', { location: {} });

    expect(bothWays([row(1, profile)]).rows[0].location).toBeUndefined();
  });

  it('reports no location when the row carried no place at all', () => {
    const profile = aProfile('a');

    expect(bothWays([row(1, profile)]).rows[0].location).toBeUndefined();
  });

  it('marks a row that never became a profile as rejected, and names nobody', () => {
    const rejection = { reason: 'junk_line', label: 'Junk line', excerpt: '/mnt/dump/...' };
    const rejected = row(9, undefined, { rejection });

    const { rows } = bothWays([rejected]);

    expect(rows[0].outcome.status).toBe('rejected');
    expect(rows[0].linkedinUsername).toBeUndefined();
    expect(rows[0].rejection).toEqual(rejection);
  });

  it('caps the rows it describes and says how many it left out', () => {
    const many = Array.from({ length: 12 }, (_unused, index) => row(index + 1, aProfile(`p-${index}`)));

    const report = buildRowReport(many, many, new Map(), 5);

    expect(report.rows).toHaveLength(5);
    expect(report.omitted).toBe(7);
  });

  it('reports nothing omitted when every row fitted', () => {
    const rows = [row(1, aProfile('a'))];

    expect(buildRowReport(rows, rows, new Map(), 5).omitted).toBe(0);
  });

  it('calls a row new when no stored hash matches, and unchanged when one does', () => {
    const profile = aProfile('ada');
    const stored = new Map([['ada', profile.contentHash]]);

    expect(bothWays([row(1, profile)]).rows[0].outcome.status).toBe('new');
    expect(buildRowReport([row(1, profile)], [row(1, profile)], stored, 10).rows[0].outcome.status).toBe(
      'unchanged',
    );
  });

  it('calls a row updated when the person is stored under a different hash', () => {
    const profile = aProfile('ada');
    const stored = new Map([['ada', 'some-older-hash']]);

    const { rows } = buildRowReport([row(1, profile)], [row(1, profile)], stored, 10);

    expect(rows[0].outcome.status).toBe('updated');
  });

  it('names the line that won the person when this row was superseded', () => {
    const profile = aProfile('ada');
    const loser = row(8, profile, { supersededByLine: 3 });

    const { rows } = bothWays([loser]);

    expect(rows[0].outcome.status).toBe('duplicate');
    expect(rows[0].outcome.supersededByLine).toBe(3);
  });

  it('shows the repaired verdict only where repair changes the row', () => {
    const plain = row(1, aProfile('ada'));
    const repaired = row(1, aProfile('ada'), { realignedOffset: -1 });

    const report = buildRowReport([plain], [repaired], new Map(), 10);

    expect(report.rows[0].withRepair).toBeDefined();
    expect(report.rows[0].withRepair?.realigned).toBe(true);
    expect(report.rows[0].withRepair?.offset).toBe(-1);
  });

  it('leaves the repaired verdict off a row the repair does not touch', () => {
    const { rows } = bothWays([row(1, aProfile('ada'))]);

    expect(rows[0].withRepair).toBeUndefined();
  });
});
