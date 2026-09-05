/**
 * The session table against a real PostgreSQL. What is under test is the SQL: an int8 size that has
 * to come back a number, a bytea payload that has to survive the round trip, and a stored preview
 * blob whose stale `status` must lose to the column beside it.
 */

import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { ImportCounts, ImportPreview } from '../../domain/import-summary';
import { NewImportSession, RejectedLine } from '../../domain/ports/import-session-repository.port';
import { describeCluster, itNeedsCluster, truncateAll } from 'src/test/postgres/cluster';
import { ImportRejectionEntity } from './import-rejection.entity';
import { ImportSessionEntity } from './import-session.entity';
import { TypeormImportSessionRepository } from './typeorm-import-session.repository';

const COUNTS: ImportCounts = {
  rowsTotal: 336,
  rowsAccepted: 302,
  rowsRejected: 34,
  duplicatesCollapsed: 37,
  profilesNew: 265,
  profilesUpdated: 0,
  profilesUnchanged: 0,
  scrambledRows: 133,
  repairableRows: 20,
  realignedRows: 0,
  fieldsQuarantined: 9203,
};

function previewOf(importId: string): ImportPreview {
  return {
    importId,
    filename: 'export.csv',
    status: 'previewed',
    counts: COUNTS,
    rejections: [],
    rows: [],
    samples: [],
    createdAt: new Date('2020-01-01').toISOString(),
    expiresAt: new Date('2030-01-01').toISOString(),
  } as unknown as ImportPreview;
}

function newSession(importId: string, overrides: Partial<NewImportSession> = {}): NewImportSession {
  return {
    importId,
    filename: 'export.csv',
    sizeBytes: 4_984_667,
    checksum: `sha-${importId}`,
    file: Buffer.from(`bytes for ${importId}`),
    preview: previewOf(importId),
    expiresAt: new Date(Date.now() + 3_600_000),
    ...overrides,
  };
}

const rejection: RejectedLine = {
  lineNumber: 42,
  reason: 'junk_line',
  label: 'Junk line',
  excerpt: '/mnt/dump/part-0001',
};

describeCluster('TypeormImportSessionRepository', (context) => {
  let repository: TypeormImportSessionRepository;
  let sessions: Repository<ImportSessionEntity>;
  let rejections: Repository<ImportRejectionEntity>;

  /** The id column is a uuid, so a readable label is not a usable import id. */
  const ids = new Map<string, string>();
  const id = (label: string): string => {
    const known = ids.get(label);
    if (known) return known;
    const fresh = randomUUID();
    ids.set(label, fresh);
    return fresh;
  };

  beforeEach(async () => {
    if (!context.dataSource) return;
    ids.clear();
    await truncateAll(context.dataSource);
    sessions = context.dataSource.getRepository(ImportSessionEntity);
    rejections = context.dataSource.getRepository(ImportRejectionEntity);
    repository = new TypeormImportSessionRepository(sessions, rejections);
  });

  itNeedsCluster('stores a session and reads it back', async () => {
    const created = await repository.create(newSession(id('run-1')));

    expect(created).toMatchObject({
      importId: id('run-1'),
      filename: 'export.csv',
      status: 'previewed',
      checksum: `sha-${id('run-1')}`,
    });
    expect(await repository.findById(id('run-1'))).toMatchObject({ importId: id('run-1') });
  });

  itNeedsCluster('brings the int8 size back as a number, not as a string', async () => {
    await repository.create(newSession(id('run-1')));

    const found = await repository.findById(id('run-1'));

    expect(found?.sizeBytes).toBe(4_984_667);
    expect(typeof found?.sizeBytes).toBe('number');
  });

  itNeedsCluster('answers null for an import nobody uploaded', async () => {
    expect(await repository.findById(id('absent'))).toBeNull();
    expect(await repository.findPayload(id('absent'))).toBeNull();
  });

  itNeedsCluster('returns the uploaded bytes unchanged, so a commit can re-read them', async () => {
    await repository.create(newSession(id('run-1'), { file: Buffer.from([0, 1, 2, 253, 254, 255]) }));

    expect(await repository.findPayload(id('run-1'))).toEqual(Buffer.from([0, 1, 2, 253, 254, 255]));
  });

  itNeedsCluster('marks a session committed, replaces its counts and releases its bytes', async () => {
    await repository.create(newSession(id('run-1')));
    const committedAt = new Date('2026-09-01T10:05:00Z');

    await repository.markCommitted(id('run-1'), committedAt, { ...COUNTS, profilesNew: 1 });
    const found = await repository.findById(id('run-1'));

    expect(found?.status).toBe('committed');
    expect(found?.committedAt).toEqual(committedAt);
    expect(found?.counts.profilesNew).toBe(1);
    expect(await repository.findPayload(id('run-1'))).toHaveLength(0);
  });

  itNeedsCluster('lets the status column win over the stale copy inside the stored preview', async () => {
    await repository.create(newSession(id('run-1')));
    await repository.markCommitted(id('run-1'), new Date(), COUNTS);

    // The blob still says "previewed"; the reader must not.
    const stored = await sessions.findOneByOrFail({ id: id('run-1') });
    expect(stored.preview.status).toBe('previewed');
    expect((await repository.findById(id('run-1')))?.preview.status).toBe('committed');
  });

  itNeedsCluster('marks a session expired', async () => {
    await repository.create(newSession(id('run-1')));

    await repository.markExpired(id('run-1'));

    expect((await repository.findById(id('run-1')))?.status).toBe('expired');
  });

  describe('deleteExpired', () => {
    itNeedsCluster('removes a lapsed preview and reports how many it removed', async () => {
      await repository.create(newSession(id('old'), { expiresAt: new Date('2020-01-01') }));
      await repository.create(newSession(id('fresh')));

      const removed = await repository.deleteExpired(new Date());

      expect(removed).toBe(1);
      expect(await repository.findById(id('old'))).toBeNull();
      expect(await repository.findById(id('fresh'))).not.toBeNull();
    });

    itNeedsCluster('keeps a committed run however old it is: it is the import history', async () => {
      await repository.create(newSession(id('committed'), { expiresAt: new Date('2020-01-01') }));
      await repository.markCommitted(id('committed'), new Date('2020-01-02'), COUNTS);

      const removed = await repository.deleteExpired(new Date());

      expect(removed).toBe(0);
      expect(await repository.findById(id('committed'))).not.toBeNull();
    });

    itNeedsCluster('reports zero when the driver gave no count at all', async () => {
      // `affected` is optional on the driver's result; a missing count must read as "none", not NaN.
      const builder = { delete: () => builder, from: () => builder, where: () => builder, andWhere: () => builder, execute: () => Promise.resolve({}) };
      jest.spyOn(sessions, 'createQueryBuilder').mockReturnValue(builder as never);

      expect(await repository.deleteExpired(new Date())).toBe(0);

      jest.restoreAllMocks();
    });

    itNeedsCluster('reports zero when nothing had lapsed', async () => {
      await repository.create(newSession(id('fresh')));

      expect(await repository.deleteExpired(new Date())).toBe(0);
    });
  });

  describe('listRecent', () => {
    itNeedsCluster('returns runs newest first, capped at the limit', async () => {
      await repository.create(newSession(id('a')));
      await repository.create(newSession(id('b')));
      await repository.create(newSession(id('c')));

      const recent = await repository.listRecent(2);

      expect(recent).toHaveLength(2);
      expect(recent[0].createdAt.getTime()).toBeGreaterThanOrEqual(recent[1].createdAt.getTime());
    });

    itNeedsCluster('never asks the database for zero or a fractional number of rows', async () => {
      await repository.create(newSession(id('a')));

      expect(await repository.listRecent(0)).toHaveLength(1);
      expect(await repository.listRecent(-5)).toHaveLength(1);
    });

    itNeedsCluster('carries the commit timestamp on a committed run and nothing on a preview', async () => {
      await repository.create(newSession(id('a')));
      await repository.markCommitted(id('a'), new Date('2026-01-01'), COUNTS);
      await repository.create(newSession(id('b')));

      const recent = await repository.listRecent(10);
      const committed = recent.find((run) => run.importId === id('a'));
      const previewed = recent.find((run) => run.importId === id('b'));

      expect(committed?.committedAt).toEqual(new Date('2026-01-01'));
      expect(previewed?.committedAt).toBeUndefined();
    });
  });

  describe('addRejections', () => {
    itNeedsCluster('stores one row per refused line', async () => {
      await repository.create(newSession(id('run-1')));

      await repository.addRejections(id('run-1'), [rejection, { ...rejection, lineNumber: 43 }]);

      expect(await rejections.countBy({ sessionId: id('run-1') })).toBe(2);
    });

    itNeedsCluster('writes a list longer than one chunk', async () => {
      await repository.create(newSession(id('run-1')));
      const many = Array.from({ length: 600 }, (_unused, index) => ({
        ...rejection,
        lineNumber: index + 1,
      }));

      await repository.addRejections(id('run-1'), many);

      expect(await rejections.countBy({ sessionId: id('run-1') })).toBe(600);
    });

    itNeedsCluster('issues nothing for an empty list', async () => {
      await repository.create(newSession(id('run-1')));

      await repository.addRejections(id('run-1'), []);

      expect(await rejections.countBy({ sessionId: id('run-1') })).toBe(0);
    });

    itNeedsCluster('drops a run’s rejections with the run itself', async () => {
      await repository.create(newSession(id('old'), { expiresAt: new Date('2020-01-01') }));
      await repository.addRejections(id('old'), [rejection]);

      await repository.deleteExpired(new Date());

      expect(await rejections.countBy({ sessionId: id('old') })).toBe(0);
    });
  });
});
