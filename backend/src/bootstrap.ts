import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { AppConfigService } from './shared/config/app-config.service';
import { ProblemDetailsFilter } from './shared/http/problem-details.filter';
import { RequestLoggingInterceptor } from './shared/http/request-logging.interceptor';
import { validationExceptionFactory } from './shared/http/validation-exception.factory';

/** Uploads are multipart and capped separately; these parsers only see the API's own small bodies. */
const BODY_LIMIT = '256kb';

export const API_PREFIX = 'api';

/** Everything main.ts applies to the app, kept here so it can be tested against a real server. */
export function configureApp(app: INestApplication): AppConfigService {
  const config = app.get(AppConfigService);
  const docsEnabled = !config.isProduction;

  app.setGlobalPrefix(API_PREFIX);
  // The Swagger UI is inline script and style; the default policy would blank the page.
  app.use(helmet({ contentSecurityPolicy: docsEnabled ? false : undefined }));
  app.enableCors({ origin: [...config.cors.origins], credentials: true });
  app.use(json({ limit: BODY_LIMIT }));
  app.use(urlencoded({ extended: true, limit: BODY_LIMIT }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.useGlobalInterceptors(new RequestLoggingInterceptor());
  app.enableShutdownHooks();

  if (docsEnabled) setupSwagger(app);
  return config;
}

function setupSwagger(app: INestApplication): void {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('LinkedIn profile search')
      .setDescription('Reads are public; imports and reindexing need a token from POST /api/auth/login.')
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
      .build(),
  );
  SwaggerModule.setup(`${API_PREFIX}/docs`, app, document, { jsonDocumentUrl: `${API_PREFIX}/docs-json` });
}

export function logStartup(config: AppConfigService, logger: Logger): void {
  const { port, upload, elasticsearch, nodeEnv } = config;

  logger.log(`API listening on http://localhost:${port}/${API_PREFIX} (${nodeEnv})`);
  logger.log(`Elasticsearch ${elasticsearch.node}, index "${elasticsearch.index}"`);
  logger.log(`Uploads accepted up to ${Math.round(upload.maxBytes / 1024 / 1024)} MB`);
  if (!config.isProduction) logger.log(`Swagger UI on http://localhost:${port}/${API_PREFIX}/docs`);
}
