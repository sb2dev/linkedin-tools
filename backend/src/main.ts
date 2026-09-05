/** The process entry point. Everything it applies to the app lives in bootstrap.ts. */

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp, logStartup } from './bootstrap';

async function bootstrap(): Promise<void> {
  // bodyParser: false, because configureApp installs the parsers with the limits it decides.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  const config = configureApp(app);

  await app.listen(config.port);
  logStartup(config, new Logger('Bootstrap'));
}

bootstrap().catch((error: unknown) => {
  new Logger('Bootstrap').error(
    'The API failed to start',
    error instanceof Error ? error.stack : String(error),
  );
  process.exit(1);
});
