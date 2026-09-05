/**
 * Writes a comma-separated export back out as the JSON export the API also accepts, so the same
 * dataset can be imported in either format and produce the same corpus.
 *
 *   npm run dataset:json -- "../data/300 user linkedin.csv" "../data/300 user linkedin.json"
 *
 * A record is keyed by column name, so what a row means has to be settled before it is written:
 * the reader parses the file, and the importer's own classification says which fields of a row are
 * the record - the same source-dump prefix it strips on the way in is stripped here too, or those
 * rows would key every column one place out. The one row shape a keyed record cannot carry is the
 * one whose field count the header does not match; those are left out and counted, since the import
 * refuses them in either format and a truncated record would be accepted on values it never had.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { classifyRow } from 'src/imports/domain/validation/row-classification';
import { CsvDatasetReader } from 'src/imports/infrastructure/csv/csv-dataset.reader';

async function main(): Promise<void> {
  const [source, target] = process.argv.slice(2);
  if (!source || !target) {
    throw new Error('usage: npm run dataset:json -- <source.csv> <target.json>');
  }

  const { header, rows } = await new CsvDatasetReader().read(readFileSync(source));
  const columns = header.map((name) => name.trim());
  const options = {
    expectedFieldCount: columns.length,
    nameIndex: columns.indexOf('full_name'),
    urlIndex: columns.indexOf('linkedin_url'),
    header: columns,
  };

  const records: Record<string, string>[] = [];
  let dropped = 0;

  for (const row of rows) {
    const classification = classifyRow(row.fields, options);
    if (classification.status === 'rejected' && classification.reason === 'FIELD_COUNT_MISMATCH') {
      dropped++;
      continue;
    }

    // A rejected junk line or a repeated header stays in: both are still records, and the import
    // turns them down on their content, which is what the rejection report is there to show.
    const fields =
      classification.status === 'repairable' ? classification.repairedFields : row.fields;
    records.push(Object.fromEntries(columns.map((column, at) => [column, fields[at] ?? ''])));
  }

  writeFileSync(target, `${JSON.stringify(records, null, 2)}\n`);

  console.log(`${records.length} records, ${columns.length} columns -> ${target}`);
  if (dropped > 0) {
    console.log(`${dropped} row(s) whose field count the header does not match were left out`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
