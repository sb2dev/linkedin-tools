/**
 * One source line, explained column by column. This is the endpoint that shows an operator why a
 * line was refused, so the reason it gives has to name what that line in particular did.
 */

import { HEADER, rowOf, withUsername } from 'src/test/fakes';
import { explainSourceRow } from './row-source';

function explain(fields: readonly string[], lineNumber = 7) {
  return explainSourceRow(HEADER, fields, fields.join(','), lineNumber);
}

function columnNamed(report: ReturnType<typeof explain>, name: string) {
  const column = report.columns.find((entry) => entry.column === name);
  if (!column) throw new Error(`no column named ${name}`);
  return column;
}

describe('explainSourceRow', () => {
  it('accepts a clean line and names who it describes', () => {
    const report = explain(rowOf('clean'));

    expect(report.accepted).toBe(true);
    expect(report.identity?.linkedinUsername).toBeTruthy();
    expect(report.lineNumber).toBe(7);
  });

  it('reports one entry per header column, in header order', () => {
    const report = explain(rowOf('clean'));

    expect(report.columns).toHaveLength(HEADER.length);
    expect(report.columns.map((c) => c.column)).toEqual(HEADER.map((name) => name.trim()));
  });

  it('says the repeated header line repeats the header, rather than just "invalid"', () => {
    const report = explain(rowOf('embeddedHeader'));

    expect(report.accepted).toBe(false);
    expect(report.rejection?.detail).toContain('repeats the header');
    expect(report.identity).toBeUndefined();
  });

  it('says a junk line opens with a path into the source dump, and how wide it parsed', () => {
    const report = explain(rowOf('junkUnrecoverable'));

    expect(report.accepted).toBe(false);
    expect(report.rejection?.detail).toContain('a path into the source dump');
    expect(report.rejection?.detail).toContain(`${String(HEADER.length)}-column record`);
  });

  it('names the field count when the line is simply the wrong width', () => {
    const report = explain(rowOf('fieldCountMismatch'));

    expect(report.accepted).toBe(false);
    expect(report.rejection).toBeDefined();
  });

  it('reports a line the validator refused even though it parsed to the right width', () => {
    // The line is the right width and classifies as a record, but `full_name` is not name-shaped,
    // so the validator refuses it for having no identity to key on.
    const fields = [...rowOf('clean')];
    fields[HEADER.indexOf('full_name')] = '12345';

    const report = explain(fields);

    expect(report.fieldCount).toBe(HEADER.length);
    expect(report.accepted).toBe(false);
    expect(report.rejection).toBeDefined();
  });

  it('shows the prefix a recovered line lost, so the artifact itself is visible', () => {
    const report = explain(rowOf('junkPrefixed'));

    expect(report.recovered).toBe(true);
    expect(report.droppedFields.length).toBeGreaterThan(0);
  });

  it('marks a quarantined cell with the reason the validator gave', () => {
    const report = explain(rowOf('scrambledOffsetMinus1'));

    const quarantined = report.columns.filter((column) => column.verdict === 'quarantined');
    expect(quarantined.length).toBeGreaterThan(0);
    expect(quarantined[0].reason).toEqual(expect.any(String));
  });

  it('calls an empty cell empty rather than quarantined', () => {
    const fields = [...rowOf('clean')];
    fields[HEADER.indexOf('summary')] = '';

    expect(columnNamed(explain(fields), 'summary').verdict).toBe('empty');
  });

  it('truncates a record longer than the cap and says that it did', () => {
    const fields = withUsername(rowOf('clean'), 'someone');
    const raw = 'x'.repeat(70_000);

    const report = explainSourceRow(HEADER, fields, raw, 3);

    expect(report.rawTruncated).toBe(true);
    expect(report.raw).toHaveLength(64_000);
  });

  it('leaves a short record untruncated', () => {
    const report = explain(rowOf('clean'));

    expect(report.rawTruncated).toBe(false);
  });
});
