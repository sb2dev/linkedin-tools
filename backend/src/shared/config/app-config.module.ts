import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppConfigService } from './app-config.service';
import { loadConfiguration } from './configuration';

/** Loads and validates the environment once, then exposes it as AppConfigService. */
@Global()
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, cache: true, load: [loadConfiguration] })],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
