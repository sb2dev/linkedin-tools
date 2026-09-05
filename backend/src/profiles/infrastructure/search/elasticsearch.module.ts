/** Wires the search port to its Elasticsearch adapter. */

import { Module, Provider } from '@nestjs/common';
import { Client } from '@elastic/elasticsearch';
import { AppConfigService } from 'src/shared/config/app-config.service';
import { PROFILE_SEARCH } from '../../domain/ports/profile-search.port';
import { ElasticsearchProfileSearch } from './elasticsearch-profile.search';

const ELASTICSEARCH_CLIENT = Symbol('ElasticsearchClient');

/** A search is a foreground request: failing is a better answer than a page that never renders. */
const REQUEST_TIMEOUT_MS = 15_000;

/** The client only retries what it knows to be safe to repeat, so this costs nothing on writes. */
const MAX_RETRIES = 3;

const clientProvider: Provider = {
  provide: ELASTICSEARCH_CLIENT,
  inject: [AppConfigService],
  useFactory: (config: AppConfigService): Client =>
    new Client({
      node: config.elasticsearch.node,
      requestTimeout: REQUEST_TIMEOUT_MS,
      maxRetries: MAX_RETRIES,
    }),
};

/** `index` from the configuration is the alias; the adapter creates the versioned index behind it. */
const searchProvider: Provider = {
  provide: PROFILE_SEARCH,
  inject: [ELASTICSEARCH_CLIENT, AppConfigService],
  useFactory: (client: Client, config: AppConfigService): ElasticsearchProfileSearch =>
    new ElasticsearchProfileSearch(client, { indexAlias: config.elasticsearch.index }),
};

@Module({
  providers: [clientProvider, searchProvider],
  exports: [PROFILE_SEARCH],
})
export class ElasticsearchModule {}
