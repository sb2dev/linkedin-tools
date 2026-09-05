/** One upload, three extensions: the format follows the bytes, so the filename never decides. */

import { csvOf, jsonOf, rowOf } from 'src/test/fakes';
import { CsvDatasetReader } from './csv/csv-dataset.reader';
import { JsonDatasetReader } from './json/json-dataset.reader';
import { SniffingDatasetReader } from './sniffing-dataset.reader';

const reader = new SniffingDatasetReader(new CsvDatasetReader(), new JsonDatasetReader());
const ROWS = [rowOf('clean'), rowOf('scrambledOffsetMinus1')];

describe('SniffingDatasetReader', () => {
  it('reads the same rows out of the CSV export and the JSON one', async () => {
    const fromCsv = await reader.read(csvOf(ROWS));
    const fromJson = await reader.read(jsonOf(ROWS));

    expect(fromJson.header).toEqual(fromCsv.header);
    expect(fromJson.rows.map((row) => row.fields)).toEqual(fromCsv.rows.map((row) => row.fields));
  });

  it('reads either shape, whatever the upload was named', async () => {
    await expect(reader.read(jsonOf([rowOf('clean')]))).resolves.toMatchObject({
      header: expect.arrayContaining(['full_name', 'linkedin_url']),
    });
    await expect(reader.read(csvOf([rowOf('clean')]))).resolves.toMatchObject({
      header: expect.arrayContaining(['full_name', 'linkedin_url']),
    });
  });

  it('reads a file of nothing but blank space as CSV: no JSON document ever opens', async () => {
    await expect(reader.read(Buffer.from('   \r\n\t   ', 'utf8'))).rejects.toThrow(/CSV/);
  });

  it('reads one line out of whichever format the upload is', async () => {
    const fromCsv = await reader.readLine(csvOf(ROWS), 2);
    const fromJson = await reader.readLine(jsonOf(ROWS), 2);

    expect(fromCsv?.row.fields).toEqual(fromJson?.row.fields);
    expect(fromJson?.raw.startsWith('{')).toBe(true);
  });
});
