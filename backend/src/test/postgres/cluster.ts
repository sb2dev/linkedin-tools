/**
 * A real PostgreSQL for the specs whose subject is the SQL itself: the migration, the two TypeORM
 * repositories and the entity mappings. None of that has an in-memory equivalent that would still
 * be evidence - a generated column, an int8 that has to come back a number, a down() that truly
 * reverses its up().
 *
 * Each block gets its own database, created before it and dropped after it. Jest runs suites in
 * parallel, so a shared one means a truncate in one file deleting rows another file just wrote.
 * The developer's own corpus is never touched: only databases named for the suite are.
 *
 * When no server answers, `describeCluster` becomes `describe.skip`, so `npm test` still passes on
 * a machine with nothing installed - and reports the block as skipped rather than as passed. The
 * probe runs once in globalSetup, because Jest chooses skip-or-run synchronously.
 */

import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from 'src/shared/config/data-source';
import { SERVER, clusterIsAvailable } from './server';

export { clusterIsAvailable } from './server';

const PREFIX = 'linkedin_spec_';

/** A legal identifier derived from the block's name, so a failure names the database it used. */
function databaseNameFor(suite: string): string {
  const slug = suite.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `${PREFIX}${slug}`.slice(0, 63);
}

/** DDL that cannot run inside the database it names, so it goes through the configured one. */
async function onServer(statements: readonly string[]): Promise<void> {
  const admin = new DataSource({ ...buildDataSourceOptions(SERVER), logging: false });
  await admin.initialize();
  try {
    for (const statement of statements) await admin.query(statement);
  } finally {
    await admin.destroy();
  }
}

/** Creates a database for one spec and hands back the call that drops it again. */
export async function createDatabase(name: string): Promise<() => Promise<void>> {
  await onServer([`DROP DATABASE IF EXISTS "${name}"`, `CREATE DATABASE "${name}"`]);
  return async () => {
    await onServer([`DROP DATABASE IF EXISTS "${name}"`]);
  };
}

export async function truncateAll(dataSource: DataSource): Promise<void> {
  await dataSource.query('TRUNCATE TABLE "profiles", "import_rejections", "import_sessions" CASCADE');
}

export interface ClusterContext {
  dataSource: DataSource;
}

/**
 * `describe` for a block that needs the server: it runs when one answers, and is skipped - as
 * skipped, not as passed - when none does.
 */
export function describeCluster(name: string, suite: (context: ClusterContext) => void): void {
  const context: ClusterContext = { dataSource: undefined as unknown as DataSource };
  const database = databaseNameFor(name);
  const block = clusterIsAvailable() ? describe : describe.skip;

  block(name, () => {
    beforeAll(async () => {
      await onServer([`DROP DATABASE IF EXISTS "${database}"`, `CREATE DATABASE "${database}"`]);
      context.dataSource = new DataSource({
        ...buildDataSourceOptions({ ...SERVER, name: database }),
        logging: false,
      });
      await context.dataSource.initialize();
      await context.dataSource.runMigrations();
    }, 60_000);

    afterAll(async () => {
      if (context.dataSource?.isInitialized) await context.dataSource.destroy();
      await onServer([`DROP DATABASE IF EXISTS "${database}"`]);
    }, 60_000);

    suite(context);
  });
}

/** Inside a describeCluster block every test needs the server, so this is plain `it`. */
export const itNeedsCluster = it;
