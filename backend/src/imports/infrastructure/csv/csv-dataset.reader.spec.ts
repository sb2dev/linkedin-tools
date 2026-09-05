/** The shapes of damage the reference export contains, and the line numbers a human can find. */

import { DatasetUnreadableError } from '../../domain/ports/dataset-reader.port';
import { CsvDatasetReader } from './csv-dataset.reader';

const reader = new CsvDatasetReader();
const file = (...lines: string[]): Buffer => Buffer.from(lines.join('\r\n'), 'utf8');

describe('CsvDatasetReader', () => {
  it('reads the header and numbers rows by their line in the file', async () => {
    const contents = await reader.read(file('full_name,linkedin_url', 'ada,linkedin.com/in/ada', 'bo,linkedin.com/in/bo', ''));

    expect(contents.header).toEqual(['full_name', 'linkedin_url']);
    expect(contents.rows).toEqual([
      { lineNumber: 2, fields: ['ada', 'linkedin.com/in/ada'] },
      { lineNumber: 3, fields: ['bo', 'linkedin.com/in/bo'] },
    ]);
  });

  it('strips the byte-order mark from the first column name', async () => {
    const contents = await reader.read(
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), file('full_name,linkedin_url', 'ada,linkedin.com/in/ada')]),
    );

    expect(contents.header[0]).toBe('full_name');
  });

  it('keeps a row whose field count is wrong instead of failing the file', async () => {
    const contents = await reader.read(file('a,b,c', '1,2', '3,4,5,6,7'));

    expect(contents.rows.map((row) => row.fields.length)).toEqual([2, 5]);
  });

  it('keeps a quoted field that spans lines, and numbers the record by its first line', async () => {
    const contents = await reader.read(file('a,b,c', '1,"two,\r\ntwo",3', '4,5,6'));

    expect(contents.rows[0]).toEqual({ lineNumber: 2, fields: ['1', 'two,\r\ntwo', '3'] });
    expect(contents.rows[1].lineNumber).toBe(4);
  });

  it('tolerates a stray quote inside a quoted field', async () => {
    const contents = await reader.read(file('a,b', '1,"say ""hi"" ok"', '2,"loose " quote"'));

    expect(contents.rows[0].fields[1]).toBe('say "hi" ok');
    expect(contents.rows[1].fields[1]).toContain('loose');
  });

  it('skips blank lines without losing count of the ones that follow', async () => {
    const contents = await reader.read(file('a,b', '1,2', '', '', '3,4'));

    expect(contents.rows.map((row) => row.lineNumber)).toEqual([2, 5]);
  });

  it('reads a file that has a header and nothing else', async () => {
    const contents = await reader.read(file('a,b'));

    expect(contents.header).toEqual(['a', 'b']);
    expect(contents.rows).toEqual([]);
  });

  it('refuses a file with no records at all', async () => {
    await expect(reader.read(Buffer.alloc(0))).rejects.toBeInstanceOf(DatasetUnreadableError);
  });

  it('refuses a file the parser cannot finish, and repeats what it complained about', async () => {
    // A quote opened and never closed is the one damage csv-parse will not read past.
    await expect(reader.read(file('a,b', '"never closed,2'))).rejects.toThrow(
      /not readable as CSV: .*Quote Not Closed/,
    );
  });

  it('refuses a file whose first line is not a header', async () => {
    await expect(reader.read(file('just-one-column', 'value'))).rejects.toBeInstanceOf(DatasetUnreadableError);
  });
});

describe('CsvDatasetReader.readLine', () => {
  it('returns the record that starts on the line, with the header and the source text', async () => {
    const contents = file('a,b,c', '1,2,3', '4,5,6');

    await expect(reader.readLine(contents, 3)).resolves.toEqual({
      header: ['a', 'b', 'c'],
      row: { lineNumber: 3, fields: ['4', '5', '6'] },
      raw: '4,5,6',
    });
  });

  it('hands back a spanned record whole, quoting and newlines included', async () => {
    const contents = file('a,b,c', '1,"two,\r\ntwo",3', '4,5,6');
    const record = await reader.readLine(contents, 2);

    expect(record?.raw).toBe('1,"two,\r\ntwo",3');
    expect(record?.row.fields[1]).toBe('two,\r\ntwo');
  });

  it('has no row on the header line', async () => {
    await expect(reader.readLine(file('a,b', '1,2'), 1)).resolves.toBeNull();
  });

  it('has no row on a line that falls inside a record, not at its start', async () => {
    // Line 3 is the second half of the record that began on line 2.
    await expect(reader.readLine(file('a,b,c', '1,"two,\r\ntwo",3', '4,5,6'), 3)).resolves.toBeNull();
  });

  it('has no row past the end of the file', async () => {
    await expect(reader.readLine(file('a,b', '1,2'), 99)).resolves.toBeNull();
  });

  it('reads no further than the line asked for', async () => {
    // An unclosed quote is the one damage csv-parse will not read past, so a reader that reached it would throw.
    const filler = Array.from({ length: 20_000 }, (_row, at) => `${at},filler`);
    const damagedLater = file('a,b', '1,2', ...filler, '"never closed,3');

    await expect(reader.readLine(damagedLater, 2)).resolves.toEqual({
      header: ['a', 'b'],
      row: { lineNumber: 2, fields: ['1', '2'] },
      raw: '1,2',
    });
    await expect(reader.read(damagedLater)).rejects.toBeInstanceOf(DatasetUnreadableError);
  });

  it('refuses a file it cannot parse as far as the line, and repeats the complaint', async () => {
    await expect(reader.readLine(file('a,b', '"never closed,2', '3,4'), 3)).rejects.toThrow(
      /not readable as CSV: .*Quote Not Closed/,
    );
  });

  it('skips blank lines without losing count of the ones that follow', async () => {
    const record = await reader.readLine(file('a,b', '1,2', '', '', '3,4'), 5);

    expect(record?.row.fields).toEqual(['3', '4']);
  });
});
