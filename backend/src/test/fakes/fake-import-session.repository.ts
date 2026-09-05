/**
 * An in-memory ImportSessionRepositoryPort. It keeps the stored preview blob exactly as it was
 * written, like the JSON column does, while status and counts live beside it as their own columns:
 * a reader that trusts the blob therefore sees stale values, which is what the real table does too.
 */

import { ImportCounts, ImportPreview, ImportStatus } from 'src/imports/domain/import-summary';
import {
  ImportRunRecord,
  ImportSession,
  ImportSessionRepositoryPort,
  NewImportSession,
  RejectedLine,
} from 'src/imports/domain/ports/import-session-repository.port';

/** The file column is NOT NULL in PostgreSQL, so a released payload is emptied rather than nulled. */
const NO_PAYLOAD = Buffer.alloc(0);

interface StoredRow {
  importId: string;
  filename: string;
  sizeBytes: number;
  checksum: string;
  status: ImportStatus;
  counts: ImportCounts;
  preview: ImportPreview;
  file: Buffer;
  createdAt: Date;
  expiresAt: Date;
  committedAt?: Date;
}

export class FakeImportSessionRepository implements ImportSessionRepositoryPort {
  private readonly rows = new Map<string, StoredRow>();
  private readonly rejected = new Map<string, RejectedLine[]>();

  /** Port calls in order. Share one array with the other fakes to assert cross-store ordering. */
  readonly journal: string[];
  readonly deleteExpiredCalls: Date[] = [];
  readonly listRecentLimits: number[] = [];
  readonly committedCounts: ImportCounts[] = [];

  /** Row creation timestamps come from here, so history ordering is not a race against the clock. */
  clock: () => Date = () => new Date();

  constructor(journal: string[] = []) {
    this.journal = journal;
  }

  async create(session: NewImportSession): Promise<ImportSession> {
    this.journal.push('sessions.create');
    if (this.rows.has(session.importId)) {
      throw new Error(`duplicate key value violates unique constraint on ${session.importId}`);
    }

    const row: StoredRow = {
      importId: session.importId,
      filename: session.filename,
      sizeBytes: session.sizeBytes,
      checksum: session.checksum,
      status: 'previewed',
      counts: session.preview.counts,
      preview: session.preview,
      file: Buffer.from(session.file),
      createdAt: this.clock(),
      expiresAt: session.expiresAt,
    };
    this.rows.set(row.importId, row);
    return toSession(row);
  }

  async findById(importId: string): Promise<ImportSession | null> {
    this.journal.push('sessions.findById');
    const row = this.rows.get(importId);
    return row ? toSession(row) : null;
  }

  async findPayload(importId: string): Promise<Buffer | null> {
    this.journal.push('sessions.findPayload');
    const row = this.rows.get(importId);
    return row ? Buffer.from(row.file) : null;
  }

  async markCommitted(importId: string, committedAt: Date, counts: ImportCounts): Promise<void> {
    this.journal.push('sessions.markCommitted');
    this.committedCounts.push(counts);
    const row = this.rows.get(importId);
    if (!row) return;
    row.status = 'committed';
    row.committedAt = committedAt;
    row.counts = counts;
    row.file = NO_PAYLOAD;
  }

  async markExpired(importId: string): Promise<void> {
    this.journal.push('sessions.markExpired');
    const row = this.rows.get(importId);
    if (row) row.status = 'expired';
  }

  async deleteExpired(now: Date): Promise<number> {
    this.journal.push('sessions.deleteExpired');
    this.deleteExpiredCalls.push(now);

    let removed = 0;
    for (const [importId, row] of this.rows) {
      if (row.status === 'committed') continue;
      if (row.expiresAt.getTime() > now.getTime()) continue;
      this.rows.delete(importId);
      this.rejected.delete(importId);
      removed++;
    }
    return removed;
  }

  async listRecent(limit: number): Promise<readonly ImportRunRecord[]> {
    this.journal.push('sessions.listRecent');
    this.listRecentLimits.push(limit);

    return [...this.rows.values()]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, Math.max(1, Math.trunc(limit) || 1))
      .map(toRunRecord);
  }

  async addRejections(importId: string, rejections: readonly RejectedLine[]): Promise<void> {
    this.journal.push('sessions.addRejections');
    const held = this.rejected.get(importId) ?? [];
    held.push(...rejections);
    this.rejected.set(importId, held);
  }

  // Test-side accessors and levers.

  ids(): readonly string[] {
    return [...this.rows.keys()];
  }

  payloadOf(importId: string): Buffer | undefined {
    return this.rows.get(importId)?.file;
  }

  rejectionsOf(importId: string): readonly RejectedLine[] {
    return this.rejected.get(importId) ?? [];
  }

  statusOf(importId: string): ImportStatus | undefined {
    return this.rows.get(importId)?.status;
  }

  /** Rewrites the counts column, to prove which side a reader takes them from. */
  overwriteCounts(importId: string, counts: ImportCounts): void {
    const row = this.rows.get(importId);
    if (!row) throw new Error(`no session ${importId}`);
    row.counts = counts;
  }

  setExpiresAt(importId: string, expiresAt: Date): void {
    const row = this.rows.get(importId);
    if (!row) throw new Error(`no session ${importId}`);
    row.expiresAt = expiresAt;
  }

  /** A history row without an upload behind it, for specs about the run list. */
  seedRun(run: ImportRunRecord): void {
    this.rows.set(run.importId, {
      importId: run.importId,
      filename: run.filename,
      sizeBytes: run.sizeBytes,
      checksum: '',
      status: run.status,
      counts: run.counts,
      preview: previewOf(run),
      file: NO_PAYLOAD,
      createdAt: run.createdAt,
      expiresAt: new Date(run.createdAt.getTime() + 3_600_000),
      committedAt: run.committedAt,
    });
  }
}

function toSession(row: StoredRow): ImportSession {
  return {
    importId: row.importId,
    filename: row.filename,
    sizeBytes: row.sizeBytes,
    checksum: row.checksum,
    status: row.status,
    counts: row.counts,
    preview: row.preview,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    committedAt: row.committedAt,
  };
}

function toRunRecord(row: StoredRow): ImportRunRecord {
  return {
    importId: row.importId,
    filename: row.filename,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt,
    committedAt: row.committedAt,
    status: row.status,
    counts: row.counts,
  };
}

function previewOf(run: ImportRunRecord): ImportPreview {
  return {
    importId: run.importId,
    filename: run.filename,
    sizeBytes: run.sizeBytes,
    createdAt: run.createdAt.toISOString(),
    status: run.status,
    counts: run.counts,
    countsWithRepair: {
      rowsAccepted: run.counts.rowsAccepted,
      scrambledRows: run.counts.scrambledRows,
      realignedRows: run.counts.realignedRows,
      fieldsQuarantined: run.counts.fieldsQuarantined,
      profilesNew: run.counts.profilesNew,
      profilesUpdated: run.counts.profilesUpdated,
      profilesUnchanged: run.counts.profilesUnchanged,
    },
    rejections: [],
    rows: [],
    rowsOmitted: 0,
    repairSample: [],
  };
}
