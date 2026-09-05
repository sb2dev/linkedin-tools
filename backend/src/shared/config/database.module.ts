/** Opens the single PostgreSQL connection pool the application runs on. */

import { Module } from '@nestjs/common';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { AppConfigService } from './app-config.service';
import { buildDataSourceOptions } from './data-source';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): TypeOrmModuleOptions => ({
        ...buildDataSourceOptions(config.database),
        // PostgreSQL is often still starting when the API boots beside it.
        retryAttempts: 10,
        retryDelay: 2000,
      }),
    }),
  ],
})
export class DatabaseModule {}
