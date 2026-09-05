/** Composition root. Every other wiring decision lives in the module that owns it. */

import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ImportsModule } from './imports/imports.module';
import { ProfilesModule } from './profiles/profiles.module';
import { AppConfigModule } from './shared/config/app-config.module';
import { DatabaseModule } from './shared/config/database.module';
import { SharedModule } from './shared/shared.module';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    SharedModule,
    AuthModule,
    ProfilesModule,
    ImportsModule,
  ],
})
export class AppModule {}
