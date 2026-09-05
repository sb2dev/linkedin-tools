/** The reader the port is bound to: it reads the bytes to decide which of the two formats they are. */

import { Injectable } from '@nestjs/common';
import { looksLikeJson } from '../domain/dataset-format';
import {
  DatasetContents,
  DatasetReaderPort,
  SourceRecord,
} from '../domain/ports/dataset-reader.port';
import { CsvDatasetReader } from './csv/csv-dataset.reader';
import { JsonDatasetReader } from './json/json-dataset.reader';

@Injectable()
export class SniffingDatasetReader implements DatasetReaderPort {
  constructor(
    private readonly csv: CsvDatasetReader,
    private readonly json: JsonDatasetReader,
  ) {}

  read(buffer: Buffer): Promise<DatasetContents> {
    return this.readerFor(buffer).read(buffer);
  }

  readLine(buffer: Buffer, lineNumber: number): Promise<SourceRecord | null> {
    return this.readerFor(buffer).readLine(buffer, lineNumber);
  }

  /** The filename is not consulted: an export is named after its source, not after its shape. */
  private readerFor(buffer: Buffer): DatasetReaderPort {
    return looksLikeJson(buffer) ? this.json : this.csv;
  }
}
