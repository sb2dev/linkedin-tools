import { Module } from '@nestjs/common';
import { GetProfileUseCase } from './application/get-profile.use-case';
import { GetSearchSchemaUseCase } from './application/get-search-schema.use-case';
import { ReindexUseCase } from './application/reindex.use-case';
import { SearchProfilesUseCase } from './application/search-profiles.use-case';
import { SuggestValuesUseCase } from './application/suggest-values.use-case';
import { ElasticsearchModule } from './infrastructure/search/elasticsearch.module';
import { PersistenceModule } from './infrastructure/persistence/persistence.module';
import { AdminController } from './interface/http/admin.controller';
import { ProfilesController } from './interface/http/profiles.controller';
import { SearchController } from './interface/http/search.controller';

/** Both adapters are re-exported so the imports context reaches the ports by importing this alone. */
@Module({
  imports: [ElasticsearchModule, PersistenceModule],
  controllers: [SearchController, ProfilesController, AdminController],
  providers: [
    SearchProfilesUseCase,
    GetProfileUseCase,
    GetSearchSchemaUseCase,
    SuggestValuesUseCase,
    ReindexUseCase,
  ],
  exports: [ElasticsearchModule, PersistenceModule],
})
export class ProfilesModule {}
