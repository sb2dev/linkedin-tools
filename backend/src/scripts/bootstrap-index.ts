/** Creates the search index and its mapping if the alias is absent. */

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from 'src/app.module';
import { ensureSearchIndex } from './ensure-search-index';

const logger = new Logger('BootstrapIndex');

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  await ensureSearchIndex(app, logger);
}

main().catch((error: unknown) => {
  logger.error('Could not create the search index', error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
