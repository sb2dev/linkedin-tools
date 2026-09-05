/** Ingestion: upload, preview, commit, and the corpus admin endpoints. */

import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { ProfilesModule } from 'src/profiles/profiles.module';
import { AppConfigService } from 'src/shared/config/app-config.service';
import { CommitImportUseCase } from './application/commit-import.use-case';
import { DescribeCorpusUseCase } from './application/describe-corpus.use-case';
import { DescribeSourceRowUseCase } from './application/describe-source-row.use-case';
import { ListImportsUseCase } from './application/list-imports.use-case';
import { PreviewImportUseCase } from './application/preview-import.use-case';
import { PurgeCorpusUseCase } from './application/purge-corpus.use-case';
import { DATASET_READER } from './domain/ports/dataset-reader.port';
import { CsvDatasetReader } from './infrastructure/csv/csv-dataset.reader';
import { JsonDatasetReader } from './infrastructure/json/json-dataset.reader';
import { ImportsPersistenceModule } from './infrastructure/persistence/imports-persistence.module';
import { SniffingDatasetReader } from './infrastructure/sniffing-dataset.reader';
import { CorpusAdminController } from './interface/http/admin.controller';
import { ImportsController } from './interface/http/imports.controller';

@Module({
  imports: [
    ProfilesModule,
    ImportsPersistenceModule,
    MulterModule.registerAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        // No storage and no dest, so multer keeps the upload in memory and the use case gets a Buffer.
        limits: { fileSize: config.upload.maxBytes, files: 1 },
      }),
    }),
  ],
  controllers: [ImportsController, CorpusAdminController],
  providers: [
    PreviewImportUseCase,
    CommitImportUseCase,
    ListImportsUseCase,
    DescribeSourceRowUseCase,
    DescribeCorpusUseCase,
    PurgeCorpusUseCase,
    CsvDatasetReader,
    JsonDatasetReader,
    { provide: DATASET_READER, useClass: SniffingDatasetReader },
  ],
})
export class ImportsModule {}
