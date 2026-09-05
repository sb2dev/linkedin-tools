/** Throttler defaults and the health probe. */

import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { ProfilesModule } from 'src/profiles/profiles.module';
import { HealthController } from './http/health.controller';

// A ceiling, not a quota: normal use never approaches it.
const WINDOW_MS = 60_000;
const REQUESTS_PER_WINDOW = 60;

@Module({
  imports: [ProfilesModule, ThrottlerModule.forRoot([{ ttl: WINDOW_MS, limit: REQUESTS_PER_WINDOW }])],
  controllers: [HealthController],
})
export class SharedModule {}
