/**
 * The entity metadata against the table the migration actually built. This is the one class of
 * defect that otherwise surfaces at deploy time: a column renamed on the entity and not in the
 * migration compiles, passes every spec that uses a fake, and fails on the first real query.
 */

import { DataSource } from 'typeorm';
import { ImportRejectionEntity } from 'src/imports/infrastructure/persistence/import-rejection.entity';
import { ImportSessionEntity } from 'src/imports/infrastructure/persistence/import-session.entity';
import { ProfileEntity } from 'src/profiles/infrastructure/persistence/profile.entity';
import { createOfflineDataSource } from 'src/test/nest/offline-data-source';
import { describeCluster, itNeedsCluster } from 'src/test/postgres/cluster';

const ENTITIES = [ProfileEntity, ImportSessionEntity, ImportRejectionEntity];

describe('the entity declarations', () => {
  let offline: DataSource;

  beforeAll(async () => {
    offline = await createOfflineDataSource();
  });

  it('defaults every array column to an empty array, so a missing list reads as none', () => {
    const arrayColumns = ENTITIES.flatMap((entity) =>
      offline.getMetadata(entity).columns.filter((column) => column.isArray),
    );

    expect(arrayColumns.length).toBeGreaterThan(0);
    for (const column of arrayColumns) {
      const value = typeof column.default === 'function' ? (column.default)() : column.default;
      expect(value).toBe("'{}'");
    }
  });

  it('stamps created_at from the database clock rather than from the process', () => {
    const stamped = ENTITIES.flatMap((entity) =>
      offline.getMetadata(entity).columns.filter((column) => column.databaseName === 'created_at'),
    );

    expect(stamped.length).toBeGreaterThan(0);
    for (const column of stamped) {
      const value = typeof column.default === 'function' ? (column.default)() : column.default;
      expect(value).toBe('now()');
    }
  });
});

describeCluster('the migrated schema', (context) => {
  /** Column names the live table has, lower-cased the way PostgreSQL stores them. */
  async function columnsOf(table: string): Promise<Set<string>> {
    const rows: { column_name: string }[] = await context.dataSource.query(
      'SELECT column_name FROM information_schema.columns WHERE table_name = $1',
      [table],
    );
    return new Set(rows.map((row) => row.column_name));
  }

  for (const entity of ENTITIES) {
    itNeedsCluster(`has every column ${entity.name} declares`, async () => {
      const metadata = context.dataSource.getMetadata(entity);
      const actual = await columnsOf(metadata.tableName);

      const missing = metadata.columns
        .map((column) => column.databaseName)
        .filter((name) => !actual.has(name));

      expect(missing).toEqual([]);
    });
  }

  itNeedsCluster('has the three tables and nothing the code does not know about', async () => {
    const rows: { table_name: string }[] = await context.dataSource.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
    );
    const tables = rows.map((row) => row.table_name).filter((name) => name !== 'migrations');

    expect(tables.sort()).toEqual(['import_rejections', 'import_sessions', 'profiles']);
  });
});
