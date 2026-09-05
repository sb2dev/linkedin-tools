/**
 * A real DataSource that has never connected. Metadata is built from the same entity classes the
 * application registers, so TypeOrmModule.forFeature hands out genuine repositories and a spec can
 * boot a persistence module without a cluster; any query through it fails, which is what a module
 * wiring spec wants, since a module that issues a query at boot is the defect being looked for.
 */

import { DynamicModule, Global, Module } from '@nestjs/common';
import { getDataSourceToken, getEntityManagerToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DatabaseConfig } from 'src/shared/config/configuration';
import { buildDataSourceOptions } from 'src/shared/config/data-source';

/** Never dialled, so the values only have to be the shape buildDataSourceOptions expects. */
const UNREACHABLE: DatabaseConfig = {
  host: '127.0.0.1',
  port: 1,
  user: 'offline',
  password: 'offline',
  name: 'offline',
};

/** buildMetadatas is protected on the class but is what initialize() calls before it dials. */
interface MetadataBuilder {
  buildMetadatas(): Promise<void>;
}

export async function createOfflineDataSource(): Promise<DataSource> {
  const dataSource = new DataSource(buildDataSourceOptions(UNREACHABLE));
  await (dataSource as unknown as MetadataBuilder).buildMetadatas();
  return dataSource;
}

/**
 * Stands in for TypeOrmModule.forRoot, which is the only thing DatabaseModule contributes to a
 * module under test and the only thing that would open a socket.
 */
export function offlineDataSourceModule(dataSource: DataSource): DynamicModule {
  const providers = [
    { provide: getDataSourceToken(), useValue: dataSource },
    { provide: getEntityManagerToken(), useValue: dataSource.manager },
  ];
  return {
    module: OfflineDataSourceModule,
    providers,
    exports: providers.map((provider) => provider.provide),
  };
}

@Global()
@Module({})
class OfflineDataSourceModule {}
