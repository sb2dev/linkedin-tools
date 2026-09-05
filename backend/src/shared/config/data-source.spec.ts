import { ImportRejectionEntity } from 'src/imports/infrastructure/persistence/import-rejection.entity';
import { ImportSessionEntity } from 'src/imports/infrastructure/persistence/import-session.entity';
import { InitialSchema1788426000000 } from 'src/migrations/1788426000000-InitialSchema';
import { ProfileEntity } from 'src/profiles/infrastructure/persistence/profile.entity';
import { buildDataSourceOptions } from './data-source';

const database = { host: 'db', port: 5433, user: 'u', password: 'p', name: 'n' };

describe('buildDataSourceOptions', () => {
  it('maps the config section onto the names the driver expects', () => {
    expect(buildDataSourceOptions(database)).toMatchObject({
      type: 'postgres',
      host: 'db',
      port: 5433,
      username: 'u',
      password: 'p',
      database: 'n',
    });
  });

  it('never infers the schema: only a checked-in migration changes it', () => {
    const options = buildDataSourceOptions(database);

    expect(options.synchronize).toBe(false);
    expect(options.migrationsRun).toBe(false);
  });

  it('lists entities and migrations rather than globbing, so dist/ resolves the same', () => {
    const options = buildDataSourceOptions(database);

    expect(options.entities).toEqual([ProfileEntity, ImportSessionEntity, ImportRejectionEntity]);
    expect(options.migrations).toEqual([InitialSchema1788426000000]);
  });
});
