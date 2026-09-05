import { DataSource } from 'typeorm';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { ImportRejectionEntity } from '../../imports/infrastructure/persistence/import-rejection.entity';
import { ImportSessionEntity } from '../../imports/infrastructure/persistence/import-session.entity';
import { InitialSchema1788426000000 } from '../../migrations/1788426000000-InitialSchema';
import { ProfileEntity } from '../../profiles/infrastructure/persistence/profile.entity';
import { DatabaseConfig, loadDatabaseConfig } from './configuration';

// Listed rather than globbed, so the same code resolves under dist/.
const ENTITIES = [ProfileEntity, ImportSessionEntity, ImportRejectionEntity];
const MIGRATIONS = [InitialSchema1788426000000];

export function buildDataSourceOptions(database: DatabaseConfig): PostgresConnectionOptions {
  return {
    type: 'postgres',
    host: database.host,
    port: database.port,
    username: database.user,
    password: database.password,
    database: database.name,
    entities: ENTITIES,
    migrations: MIGRATIONS,
    // The schema only ever changes through a checked-in migration run on purpose.
    synchronize: false,
    migrationsRun: false,
    uuidExtension: 'pgcrypto',
  };
}

/** `typeorm migration:run -d` refuses a file that exports two DataSources. */
export default new DataSource(buildDataSourceOptions(loadDatabaseConfig()));
