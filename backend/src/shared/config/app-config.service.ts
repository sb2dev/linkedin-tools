import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from './configuration';

/** ConfigService.getOrThrow does not check the type it is given, so the keys are read once here. */
@Injectable()
export class AppConfigService {
  private readonly config: AppConfig;

  constructor(source: ConfigService) {
    this.config = {
      nodeEnv: source.getOrThrow('nodeEnv'),
      port: source.getOrThrow('port'),
      database: source.getOrThrow('database'),
      elasticsearch: source.getOrThrow('elasticsearch'),
      jwt: source.getOrThrow('jwt'),
      upload: source.getOrThrow('upload'),
      admin: source.getOrThrow('admin'),
      cors: source.getOrThrow('cors'),
    };
  }

  get nodeEnv(): AppConfig['nodeEnv'] {
    return this.config.nodeEnv;
  }

  get isProduction(): boolean {
    return this.config.nodeEnv === 'production';
  }

  get port(): number {
    return this.config.port;
  }

  get database(): AppConfig['database'] {
    return this.config.database;
  }

  get elasticsearch(): AppConfig['elasticsearch'] {
    return this.config.elasticsearch;
  }

  get jwt(): AppConfig['jwt'] {
    return this.config.jwt;
  }

  get upload(): AppConfig['upload'] {
    return this.config.upload;
  }

  get admin(): AppConfig['admin'] {
    return this.config.admin;
  }

  get cors(): AppConfig['cors'] {
    return this.config.cors;
  }
}
