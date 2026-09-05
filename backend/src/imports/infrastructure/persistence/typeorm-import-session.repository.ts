/** The PostgreSQL side of ImportSessionRepositoryPort. */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { chunk } from 'src/shared/collections';
import { ImportCounts, ImportPreview } from '../../domain/import-summary';
import {
  ImportRunRecord,
  ImportSession,
  ImportSessionRepositoryPort,
  NewImportSession,
  RejectedLine,
} from '../../domain/ports/import-session-repository.port';
import { ImportRejectionEntity } from './import-rejection.entity';
import { ImportSessionEntity } from './import-session.entity';

const REJECTION_CHUNK = 500;

/** The file column is NOT NULL, so a released payload is emptied rather than nulled. */
const NO_PAYLOAD = Buffer.alloc(0);

const SESSION_COLUMNS = [
  'session.id',
  'session.filename',
  'session.sizeBytes',
  'session.checksum',
  'session.status',
  'session.counts',
  'session.createdAt',
  'session.committedAt',
  'session.expiresAt',
];

@Injectable()
export class TypeormImportSessionRepository implements ImportSessionRepositoryPort {
  constructor(
    @InjectRepository(ImportSessionEntity) private readonly sessions: Repository<ImportSessionEntity>,
    @InjectRepository(ImportRejectionEntity) private readonly rejections: Repository<ImportRejectionEntity>,
  ) {}

  async create(session: NewImportSession): Promise<ImportSession> {
    const row: ImportSessionEntity = {
      id: session.importId,
      filename: session.filename,
      sizeBytes: session.sizeBytes,
      checksum: session.checksum,
      status: 'previewed',
      counts: session.preview.counts,
      preview: session.preview,
      file: session.file,
      expiresAt: session.expiresAt,
      createdAt: new Date(),
      committedAt: null,
    };

    await this.sessions.insert(row);
    return toSession(row);
  }

  async findById(importId: string): Promise<ImportSession | null> {
    const row = await this.sessions
      .createQueryBuilder('session')
      .select([...SESSION_COLUMNS, 'session.preview'])
      .where('session.id = :importId', { importId })
      .getOne();

    return row ? toSession(row) : null;
  }

  async findPayload(importId: string): Promise<Buffer | null> {
    const row = await this.sessions
      .createQueryBuilder('session')
      .select(['session.id', 'session.file'])
      .where('session.id = :importId', { importId })
      .getOne();

    return row?.file ?? null;
  }

  async markCommitted(importId: string, committedAt: Date, counts: ImportCounts): Promise<void> {
    await this.sessions.update(
      { id: importId },
      { status: 'committed', committedAt, counts, file: NO_PAYLOAD },
    );
  }

  async markExpired(importId: string): Promise<void> {
    await this.sessions.update({ id: importId }, { status: 'expired' });
  }

  /** Committed sessions are kept: they are the import history, and no longer hold their payload. */
  async deleteExpired(now: Date): Promise<number> {
    const result = await this.sessions
      .createQueryBuilder()
      .delete()
      .from(ImportSessionEntity)
      .where('status <> :committed', { committed: 'committed' })
      .andWhere('expires_at <= :now', { now })
      .execute();

    return result.affected ?? 0;
  }

  async listRecent(limit: number): Promise<readonly ImportRunRecord[]> {
    const rows = await this.sessions
      .createQueryBuilder('session')
      .select(SESSION_COLUMNS)
      .orderBy('session.createdAt', 'DESC')
      .limit(Math.max(1, Math.trunc(limit) || 1))
      .getMany();

    return rows.map(toSummary);
  }

  async addRejections(importId: string, rejections: readonly RejectedLine[]): Promise<void> {
    for (const batch of chunk(rejections, REJECTION_CHUNK)) {
      await this.rejections.insert(
        batch.map((rejection) => ({
          sessionId: importId,
          lineNumber: rejection.lineNumber,
          reason: rejection.reason,
          label: rejection.label,
          rawExcerpt: rejection.excerpt,
        })),
      );
    }
  }
}

function toSession(row: ImportSessionEntity): ImportSession {
  return {
    importId: row.id,
    filename: row.filename,
    sizeBytes: row.sizeBytes,
    checksum: row.checksum,
    status: row.status,
    counts: row.counts,
    preview: toPreview(row),
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    committedAt: row.committedAt ?? undefined,
  };
}

/** The columns win over the stored copy, which still claims `previewed` after a commit. */
function toPreview(row: ImportSessionEntity): ImportPreview {
  return {
    ...row.preview,
    importId: row.id,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

function toSummary(row: ImportSessionEntity): ImportRunRecord {
  return {
    importId: row.id,
    filename: row.filename,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt,
    committedAt: row.committedAt ?? undefined,
    status: row.status,
    counts: row.counts,
  };
}
