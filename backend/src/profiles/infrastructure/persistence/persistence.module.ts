/** Binds the profile repository port to its PostgreSQL adapter. */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PROFILE_REPOSITORY } from '../../domain/ports/profile-repository.port';
import { ProfileEntity } from './profile.entity';
import { TypeormProfileRepository } from './typeorm-profile.repository';

@Module({
  imports: [TypeOrmModule.forFeature([ProfileEntity])],
  providers: [{ provide: PROFILE_REPOSITORY, useClass: TypeormProfileRepository }],
  exports: [PROFILE_REPOSITORY],
})
export class PersistenceModule {}
