/** The shapes a JSON export arrives in, and the line numbers a human can find in the file. */

import { DatasetUnreadableError } from '../../domain/ports/dataset-reader.port';
import { JsonDatasetReader } from './json-dataset.reader';

const reader = new JsonDatasetReader();
const file = (value: unknown): Buffer => Buffer.from(JSON.stringify(value, null, 2), 'utf8');
const text = (...lines: string[]): Buffer => Buffer.from(lines.join('\n'), 'utf8');

describe('JsonDatasetReader', () => {
  it('takes the header from the record keys and numbers rows by their line in the file', async () => {
    const contents = await reader.read(
      file([
        { full_name: 'ada', linkedin_url: 'linkedin.com/in/ada' },
        { full_name: 'bo', linkedin_url: 'linkedin.com/in/bo' },
      ]),
    );

    expect(contents.header).toEqual(['full_name', 'linkedin_url']);
    expect(contents.rows).toEqual([
      { lineNumber: 2, fields: ['ada', 'linkedin.com/in/ada'] },
      { lineNumber: 6, fields: ['bo', 'linkedin.com/in/bo'] },
    ]);
  });

  it('reads a minified file, where every record starts on the one line it has', async () => {
    const contents = await reader.read(
      Buffer.from('[{"a":"1","b":"2"},{"a":"3","b":"4"}]', 'utf8'),
    );

    expect(contents.rows.map((row) => row.fields)).toEqual([
      ['1', '2'],
      ['3', '4'],
    ]);
    expect(contents.rows.map((row) => row.lineNumber)).toEqual([1, 1]);
  });

  it('finds the records under a wrapper object', async () => {
    const contents = await reader.read(
      file({ exported_at: '2026-01-04', count: 1, profiles: [{ a: '1', b: '2' }] }),
    );

    expect(contents.header).toEqual(['a', 'b']);
    expect(contents.rows[0].fields).toEqual(['1', '2']);
  });

  it('widens the header for a column only a later record uses, and pads the ones without it', async () => {
    const contents = await reader.read(file([{ a: '1' }, { a: '2', b: '3' }]));

    expect(contents.header).toEqual(['a', 'b']);
    expect(contents.rows.map((row) => row.fields)).toEqual([
      ['1', ''],
      ['2', '3'],
    ]);
  });

  it('reads a column that arrives in a different order in each record', async () => {
    const contents = await reader.read(file([{ a: '1', b: '2' }, { b: '4', a: '3' }]));

    expect(contents.rows.map((row) => row.fields)).toEqual([
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('writes a nested value as the JSON the file wrote, and a null as an empty cell', async () => {
    const contents = await reader.read(
      file([{ skills: ['sql', 'go'], job_company_size: 51, is_open: true, gender: null }]),
    );

    expect(contents.rows[0].fields).toEqual(['["sql","go"]', '51', 'true', '']);
  });

  it('keeps a record whose keys are wrong instead of failing the file', async () => {
    const contents = await reader.read(file([{ a: '1', b: '2' }, { z: '9' }]));

    expect(contents.header).toEqual(['a', 'b', 'z']);
    expect(contents.rows[1].fields).toEqual(['', '', '9']);
  });

  it('strips the byte-order mark that precedes the array', async () => {
    const contents = await reader.read(
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), file([{ a: '1', b: '2' }])]),
    );

    expect(contents.header).toEqual(['a', 'b']);
  });

  it('refuses an empty file', async () => {
    await expect(reader.read(Buffer.alloc(0))).rejects.toBeInstanceOf(DatasetUnreadableError);
  });

  it('refuses an array with no records in it', async () => {
    await expect(reader.read(file([]))).rejects.toThrow(/no JSON records/);
  });

  it('refuses an object that holds no array of records', async () => {
    await expect(reader.read(file({ count: 0 }))).rejects.toThrow(/no array of records/);
  });

  it('refuses a record that is not an object, and says which line it is on', async () => {
    await expect(reader.read(file([{ a: '1' }, 'not-a-record']))).rejects.toThrow(
      /line 5 is not a JSON object/,
    );
  });

  it('refuses a record it cannot parse, and repeats what JSON complained about', async () => {
    await expect(reader.read(text('[', '  {"a": "1",},', '  {"a": "2"}', ']'))).rejects.toThrow(
      /line 2 is not readable as JSON/,
    );
  });

  it('refuses a file that ends inside a record', async () => {
    await expect(reader.read(text('[', '  {"a": "1"'))).rejects.toThrow(/ends inside a record/);
  });

  it('refuses a file that ends inside a string', async () => {
    await expect(reader.read(text('[', '  {"a": "1'))).rejects.toThrow(/ends inside a string/);
  });

  it('refuses records that name no fields at all, however many of them there are', async () => {
    await expect(reader.read(file([{}, {}]))).rejects.toThrow(/carry no field names/);
  });

  it('refuses a record that is a JSON array rather than an object', async () => {
    await expect(reader.read(Buffer.from('[["a","b"]]', 'utf8'))).rejects.toThrow(
      /line 1 is not a JSON object/,
    );
  });

  it('refuses a trailing comma, naming what stands where the next record should', async () => {
    await expect(reader.read(text('[', '  {"a": "1"},', ']'))).rejects.toThrow(
      /stray "\]" where a record was expected/,
    );
  });

  it('refuses a record that follows the one before it with no comma between them', async () => {
    await expect(reader.read(text('[', '  {"a": "1"}', '  {"a": "2"}', ']'))).rejects.toThrow(
      /stray "\{" between records/,
    );
  });

  it('reads a file whose closing bracket is missing, up to the last whole record', async () => {
    const contents = await reader.read(text('[', '  {"a": "1"},', '  {"a": "2"}'));

    expect(contents.rows.map((row) => row.fields)).toEqual([['1'], ['2']]);
  });

  it('refuses a wrapper object with nothing in it', async () => {
    await expect(reader.read(Buffer.from('{}', 'utf8'))).rejects.toThrow(/no array of records/);
  });

  it('refuses a wrapper whose key is not followed by a value', async () => {
    await expect(reader.read(Buffer.from('{"profiles" ["a"]}', 'utf8'))).rejects.toThrow(
      /no array of records/,
    );
  });
});

describe('JsonDatasetReader.readLine', () => {
  const dataset = file([
    { a: '1', b: '2' },
    { a: '3', b: '4' },
  ]);

  it('returns the record that starts on the line, with its own keys and its source text', async () => {
    await expect(reader.readLine(dataset, 6)).resolves.toEqual({
      header: ['a', 'b'],
      row: { lineNumber: 6, fields: ['3', '4'] },
      raw: '{\n    "a": "3",\n    "b": "4"\n  }',
    });
  });

  it('names only the columns that record carries, not the ones the file has elsewhere', async () => {
    const record = await reader.readLine(file([{ a: '1', b: '2' }, { z: '9' }]), 6);

    expect(record?.header).toEqual(['z']);
    expect(record?.row.fields).toEqual(['9']);
  });

  it('returns null for a line no record starts on', async () => {
    await expect(reader.readLine(dataset, 3)).resolves.toBeNull();
  });

  it('returns null for a line past the end of the file', async () => {
    await expect(reader.readLine(dataset, 99)).resolves.toBeNull();
  });

  it('reports the same failure read() does when the file is not a JSON array', async () => {
    await expect(reader.readLine(Buffer.from('a,b\n1,2', 'utf8'), 2)).rejects.toBeInstanceOf(
      DatasetUnreadableError,
    );
  });
});
