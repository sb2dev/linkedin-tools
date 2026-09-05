/** The only class that talks to Elasticsearch. Bodies come from query-builder.ts. */

import { Logger, OnModuleDestroy } from '@nestjs/common';
import { Client, errors, estypes } from '@elastic/elasticsearch';

import { chunk } from 'src/shared/collections';
import { Profile } from '../../domain/profile';
import { ProfileSearchPort } from '../../domain/ports/profile-search.port';
import { SEARCH_FIELD_BY_KEY, SearchField } from '../../domain/search/field-registry';
import { ProfileDocument, toProfileDocument } from '../../domain/search/profile-document';
import { ProfileSummarySource, toProfileSummary } from '../../domain/search/profile-summary';
import { SearchCriteria, UnknownFilterFieldError } from '../../domain/search/search-criteria';
import { SearchResult } from '../../domain/search/search-result';

import {
  PROFILE_INDEX_SETTINGS,
  PROFILE_MAPPING,
  concreteIndexName,
} from './profile.mapping';
import {
  FacetAggregationMap,
  SearchBody,
  buildSearchBody,
  buildSuggestBody,
  readFacet,
  readFacets,
} from './query-builder';

export interface ElasticsearchSearchOptions {
  /** The alias every request goes through, so a reindex can swap the index underneath it. */
  readonly indexAlias: string;
}

/** Large enough to keep round trips down, small enough to keep one failed batch cheap to retry. */
const BULK_BATCH_SIZE = 500;

/** Elasticsearch types stop at this class. */
export class SearchUnavailableError extends Error {
  constructor(operation: string, cause: unknown) {
    super(`The search index could not ${operation}`, { cause });
    this.name = 'SearchUnavailableError';
  }
}

export class ElasticsearchProfileSearch implements ProfileSearchPort, OnModuleDestroy {
  private readonly logger = new Logger(ElasticsearchProfileSearch.name);
  private mappingVersionChecked = false;

  constructor(
    private readonly client: Client,
    private readonly options: ElasticsearchSearchOptions,
  ) {}

  async search(criteria: SearchCriteria): Promise<SearchResult> {
    const response = await this.runSearch<ProfileDocument>(buildSearchBody(criteria));
    if (!response) {
      return {
        items: [],
        total: 0,
        page: criteria.pagination.page,
        size: criteria.pagination.size,
        facets: [],
        tookMs: 0,
      };
    }

    return {
      items: response.hits.hits
        .filter((hit) => hit._source !== undefined)
        .map((hit) =>
          toProfileSummary(hit._source as ProfileSummarySource, {
            highlights: hit.highlight,
            score: hit._score ?? undefined,
          }),
        ),
      total: totalOf(response.hits.total),
      page: criteria.pagination.page,
      size: criteria.pagination.size,
      facets: readFacets(criteria, aggregationsOf(response)),
      tookMs: response.took,
    };
  }

  async suggest(fieldKey: string, prefix: string, limit: number): Promise<readonly string[]> {
    const field = this.fieldFor(fieldKey);
    const response = await this.runSearch(buildSuggestBody(field, prefix, limit));
    if (!response) return [];
    return readFacet(field, aggregationsOf(response))
      .buckets.slice(0, limit)
      .map((bucket) => bucket.value);
  }

  /** Safe to call on every boot, and safe to lose the race: a create that lost adds the alias. */
  async ensureIndex(): Promise<void> {
    try {
      await this.prepareIndex();
    } catch (error) {
      throw new SearchUnavailableError('be prepared', error);
    }
  }

  private async prepareIndex(): Promise<void> {
    const alias = this.options.indexAlias;
    const index = concreteIndexName(alias);

    if (await this.client.indices.existsAlias({ name: alias })) {
      await this.warnOnStaleMapping(alias, index);
      return;
    }

    if (await this.client.indices.exists({ index })) {
      await this.pointAliasAt(index);
      return;
    }

    try {
      await this.client.indices.create({
        index,
        settings: PROFILE_INDEX_SETTINGS,
        mappings: PROFILE_MAPPING,
        aliases: { [alias]: {} },
      });
    } catch (error) {
      if (!isErrorType(error, 'resource_already_exists_exception')) throw error;
      await this.pointAliasAt(index);
    }
  }

  async index(profiles: readonly Profile[]): Promise<{ indexed: number; failures: readonly string[] }> {
    if (profiles.length === 0) return { indexed: 0, failures: [] };
    await this.ensureIndex();

    // One timestamp for the whole run, so "indexed together" is visible in the documents.
    const indexedAt = new Date();
    const failures: string[] = [];
    let indexed = 0;

    for (const batch of chunk(profiles, BULK_BATCH_SIZE)) {
      const operations: NonNullable<estypes.BulkRequest['operations']> = [];
      for (const profile of batch) {
        const document = toProfileDocument(profile, indexedAt);
        operations.push(
          { index: { _index: this.options.indexAlias, _id: document.linkedinUsername } },
          document,
        );
      }

      const response = await this.runBulk(operations);
      for (const item of response.items) {
        // Every operation above is an `index`, so that is the only kind of line to read back.
        const outcome = item.index;
        if (!outcome) continue;
        if (outcome.error) failures.push(describeFailure(outcome, outcome.error));
        else indexed += 1;
      }
    }

    return { indexed, failures };
  }

  /** Dropping the index rather than deleting by query also guarantees the mapping is current. */
  async deleteAll(): Promise<void> {
    try {
      const aliases = await this.client.indices.getAlias({ name: this.options.indexAlias });
      const indices = Object.keys(aliases);
      if (indices.length > 0) await this.client.indices.delete({ index: indices });
    } catch (error) {
      if (!isNotFound(error)) throw new SearchUnavailableError('be emptied', error);
    }
    await this.ensureIndex();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.close();
  }

  private fieldFor(key: string): SearchField {
    const field = SEARCH_FIELD_BY_KEY.get(key);
    if (!field) throw new UnknownFilterFieldError(key);
    return field;
  }

  /** Only POST /api/admin/reindex picks up a new INDEX_MAPPING_VERSION, so say so rather than pass. */
  private async warnOnStaleMapping(alias: string, expected: string): Promise<void> {
    if (this.mappingVersionChecked) return;
    this.mappingVersionChecked = true;

    const live = Object.keys(await this.client.indices.getAlias({ name: alias }));
    if (live.length === 0 || live.includes(expected)) return;
    this.logger.warn(
      `Alias "${alias}" resolves to ${live.join(', ')} but the mapping expects ${expected}. Reindex to apply it.`,
    );
  }

  private async pointAliasAt(index: string): Promise<void> {
    await this.client.indices.updateAliases({
      actions: [{ add: { index, alias: this.options.indexAlias } }],
    });
  }

  private async runSearch<T>(body: SearchBody): Promise<estypes.SearchResponse<T> | undefined> {
    try {
      return await this.client.search<T>({ index: this.options.indexAlias, ...body });
    } catch (error) {
      if (isErrorType(error, 'index_not_found_exception')) return undefined;
      throw new SearchUnavailableError('be queried', error);
    }
  }

  private async runBulk(
    operations: NonNullable<estypes.BulkRequest['operations']>,
  ): Promise<estypes.BulkResponse> {
    try {
      // `wait_for` rather than `true`, which would force a refresh per batch.
      return await this.client.bulk({ refresh: 'wait_for', operations });
    } catch (error) {
      throw new SearchUnavailableError('accept documents', error);
    }
  }
}

function aggregationsOf(response: estypes.SearchResponse<unknown>): FacetAggregationMap | undefined {
  return response.aggregations as unknown as FacetAggregationMap | undefined;
}

function totalOf(total: estypes.SearchHitsMetadata['total']): number {
  if (typeof total === 'number') return total;
  return total?.value ?? 0;
}

function describeFailure(outcome: estypes.BulkResponseItem, error: estypes.ErrorCause): string {
  return `${outcome._id ?? 'unknown'}: ${error.reason ?? error.type}`;
}

function isNotFound(error: unknown): boolean {
  return error instanceof errors.ResponseError && error.statusCode === 404;
}

function isErrorType(error: unknown, type: string): boolean {
  if (!(error instanceof errors.ResponseError)) return false;
  const body = error.body as { error?: { type?: string } } | undefined;
  return body?.error?.type === type;
}
