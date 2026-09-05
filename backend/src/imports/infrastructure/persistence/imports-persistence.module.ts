import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IMPORT_SESSION_REPOSITORY } from '../../domain/ports/import-session-repository.port';
import { ImportRejectionEntity } from './import-rejection.entity';
import { ImportSessionEntity } from './import-session.entity';
import { TypeormImportSessionRepository } from './typeorm-import-session.repository';

@Module({
  imports: [TypeOrmModule.forFeature([ImportSessionEntity, ImportRejectionEntity])],
  providers: [{ provide: IMPORT_SESSION_REPOSITORY, useClass: TypeormImportSessionRepository }],
  exports: [IMPORT_SESSION_REPOSITORY],
})
export class ImportsPersistenceModule {}
