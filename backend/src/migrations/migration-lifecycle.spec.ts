/**
 * The migration run forwards and backwards against a real PostgreSQL. A down() that does not truly
 * reverse its up() is only discovered when someone needs it, which is the worst moment to find out.
 */

import { describeCluster, itNeedsCluster } from 'src/test/postgres/cluster';

describeCluster('InitialSchema', (context) => {
  async function tables(): Promise<string[]> {
    const rows: { table_name: string }[] = await context.dataSource.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name <> 'migrations'",
    );
    return rows.map((row) => row.table_name).sort();
  }

  itNeedsCluster('builds the three tables', async () => {
    expect(await tables()).toEqual(['import_rejections', 'import_sessions', 'profiles']);
  });

  itNeedsCluster('reverses itself completely, then rebuilds the same schema', async () => {
    const before = await tables();

    await context.dataSource.undoLastMigration();
    expect(await tables()).toEqual([]);

    await context.dataSource.runMigrations();
    expect(await tables()).toEqual(before);
  }, 60_000);

  itNeedsCluster('rebuilds the indexes the search and the import lookups rely on', async () => {
    const rows: { indexname: string }[] = await context.dataSource.query(
      "SELECT indexname FROM pg_indexes WHERE schemaname = 'public'",
    );
    const names = rows.map((row) => row.indexname);

    expect(names).toEqual(expect.arrayContaining(['profiles_content_hash_idx', 'profiles_skills_gin_idx']));
  });

  itNeedsCluster('keys profiles on the linkedin username, so one person is one row', async () => {
    const rows: { indexdef: string }[] = await context.dataSource.query(
      "SELECT indexdef FROM pg_indexes WHERE tablename = 'profiles' AND indexname = 'profiles_username_uq'",
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef).toContain('UNIQUE');
    expect(rows[0].indexdef).toContain('linkedin_username');
  });
});
