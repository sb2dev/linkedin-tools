/**
 * Probes the PostgreSQL the SQL specs need, once, before any suite runs, and records the answer in
 * the environment. Reachability has to be settled here because it is asynchronous and Jest decides
 * whether a test is skipped synchronously, when the suite is being declared - which is why the
 * specs used to report "passed" for work they had not done.
 */

import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../../shared/config/data-source';
import { SERVER, CLUSTER_FLAG } from './server';

export default async function probeCluster(): Promise<void> {
  const probe = new DataSource({ ...buildDataSourceOptions(SERVER), logging: false });
  try {
    await probe.initialize();
    await probe.destroy();
    process.env[CLUSTER_FLAG] = 'yes';
  } catch {
    process.env[CLUSTER_FLAG] = 'no';
    console.warn(
      `\nNo PostgreSQL on ${SERVER.host}:${String(SERVER.port)}. The specs whose subject is the SQL ` +
        'itself will be reported as skipped, not as passed.\n',
    );
  }
}
