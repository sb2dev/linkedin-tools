/** The one description of the server the SQL specs talk to, shared by the probe and the suites. */

import { DatabaseConfig } from '../../shared/config/configuration';

/** Set by global-setup before any suite is declared; read synchronously by describeCluster. */
export const CLUSTER_FLAG = 'LINKEDIN_SPEC_CLUSTER';

/** Only the database name below is ever overridden. */
export const SERVER: DatabaseConfig = {
  host: process.env.DATABASE_HOST ?? 'localhost',
  port: Number(process.env.DATABASE_PORT ?? 5433),
  user: process.env.DATABASE_USER ?? 'linkedin',
  password: process.env.DATABASE_PASSWORD ?? 'linkedin',
  name: process.env.DATABASE_NAME ?? 'linkedin',
};

/** Whether the probe found a server. Synchronous, so `describe.skip` can be chosen on it. */
export function clusterIsAvailable(): boolean {
  return process.env[CLUSTER_FLAG] === 'yes';
}
