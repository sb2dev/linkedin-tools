/** One operator account, held in configuration as a username and a bcrypt hash. */

import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AppConfigService } from 'src/shared/config/app-config.service';
import { AuthService } from './application/auth.service';
import { AuthController } from './interface/http/auth.controller';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [AppConfigService],
      // The lifetime is set per token by AuthService, which reports it in seconds on login.
      useFactory: (config: AppConfigService) => ({ secret: config.jwt.secret }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
