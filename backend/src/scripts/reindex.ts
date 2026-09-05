/** Rewrites every profile from Postgres into the search index, through the use case POST /api/admin/reindex calls. */

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from 'src/app.module';
import { reindexProfiles } from './reindex-profiles';

const logger = new Logger('Reindex');

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  await reindexProfiles(app, logger);
}

main().catch((error: unknown) => {
  logger.error('The reindex failed', error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
