/** Where an upload lives between "previewed" and "committed". */

import { ImportCounts, ImportPreview, ImportStatus } from '../import-summary';

export const IMPORT_SESSION_REPOSITORY = Symbol('ImportSessionRepositoryPort');

/** A row in the import history. Timestamps stay as Date; the ISO strings are the application's job. */
export interface ImportRunRecord {
  readonly importId: string;
  readonly filename: string;
  readonly sizeBytes: number;
  readonly createdAt: Date;
  readonly committedAt?: Date;
  readonly status: ImportStatus;
  readonly counts: ImportCounts;
}

/** One rejected source line, kept in full so a rejection can be explained after the fact. */
export interface RejectedLine {
  readonly lineNumber: number;
  readonly reason: string;
  readonly label: string;
  readonly excerpt: string;
}

export interface NewImportSession {
  /** Assigned by the application, because the preview it stores already refers to it. */
  readonly importId: string;
  readonly filename: string;
  readonly sizeBytes: number;
  /** sha256 of the uploaded bytes, so the same file can be recognised across uploads. */
  readonly checksum: string;
  readonly file: Buffer;
  readonly preview: ImportPreview;
  readonly expiresAt: Date;
}

/** The session without its payload; the uploaded bytes are read separately by findPayload. */
export interface ImportSession {
  readonly importId: string;
  readonly filename: string;
  readonly sizeBytes: number;
  readonly checksum: string;
  readonly status: ImportStatus;
  readonly counts: ImportCounts;
  readonly preview: ImportPreview;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly committedAt?: Date;
}

export interface ImportSessionRepositoryPort {
  create(session: NewImportSession): Promise<ImportSession>;

  findById(importId: string): Promise<ImportSession | null>;

  /** The uploaded bytes, for the commit that re-derives its profiles from them. */
  findPayload(importId: string): Promise<Buffer | null>;

  /** Records the commit with the counts it produced, and drops the payload. */
  markCommitted(importId: string, committedAt: Date, counts: ImportCounts): Promise<void>;

  markExpired(importId: string): Promise<void>;

  /** Drops sessions that were never committed and are past their expiry. Returns how many went. */
  deleteExpired(now: Date): Promise<number>;

  listRecent(limit: number): Promise<readonly ImportRunRecord[]>;

  addRejections(importId: string, rejections: readonly RejectedLine[]): Promise<void>;
}
