/**
 * A hand-written Elasticsearch client. It records every request body the adapter builds and keeps
 * just enough cluster state - which indices exist and what each alias resolves to - for index
 * creation to be genuinely idempotent rather than idempotent by assertion.
 */

import { Client, errors, estypes } from '@elastic/elasticsearch';

type Diagnostic = ConstructorParameters<typeof errors.ResponseError>[0];

/** A cluster response the client turns into a ResponseError, e.g. a 404 or a missing index. */
export function clusterError(statusCode: number, type?: string): errors.ResponseError {
  const diagnostic = {
    statusCode,
    body: type ? { error: { type, reason: `${type} from the fake cluster` } } : undefined,
    headers: {},
    warnings: null,
    meta: {
      context: null,
      name: 'fake',
      request: { params: { method: 'GET', path: '/' }, options: {}, id: 1 },
      connection: null,
      attempts: 0,
      aborted: false,
    },
  } as unknown as Diagnostic;
  return new errors.ResponseError(diagnostic);
}

export interface CreateIndexRequest {
  readonly index: string;
  readonly settings?: unknown;
  readonly mappings?: unknown;
  readonly aliases?: Record<string, unknown>;
}

interface AliasAction {
  readonly add?: { readonly index?: string; readonly alias?: string };
}

type SearchResponder = (request: estypes.SearchRequest) => estypes.SearchResponse<unknown>;
type BulkResponder = (request: estypes.BulkRequest) => estypes.BulkResponse;
type GetResponder = (id: string) => estypes.GetGetResult<unknown>;

const NOT_FOUND = 404;

export class FakeCluster {
  /** Every API call in order, so a spec can assert what was and was not asked of the cluster. */
  readonly log: string[] = [];
  readonly searchRequests: estypes.SearchRequest[] = [];
  readonly bulkRequests: estypes.BulkRequest[] = [];
  readonly createRequests: CreateIndexRequest[] = [];
  readonly getRequests: { index: string; id: string }[] = [];

  private readonly existingIndices = new Set<string>();
  private readonly aliasTargets = new Map<string, Set<string>>();
  private closed = false;

  /** Answers a search. Throw from here to make the cluster fail. */
  respondToSearch: SearchResponder = () => emptySearchResponse();
  respondToBulk: BulkResponder = (request) => bulkAccepting(request);
  respondToGet: GetResponder = () => {
    throw clusterError(NOT_FOUND);
  };

  readonly indices = {
    existsAlias: async ({ name }: { name: string }): Promise<boolean> => {
      this.log.push(`existsAlias(${name})`);
      return (this.aliasTargets.get(name)?.size ?? 0) > 0;
    },

    exists: async ({ index }: { index: string }): Promise<boolean> => {
      this.log.push(`exists(${index})`);
      return this.existingIndices.has(index);
    },

    create: async (request: CreateIndexRequest): Promise<void> => {
      this.log.push(`create(${request.index})`);
      this.createRequests.push(request);
      if (this.existingIndices.has(request.index)) {
        throw clusterError(400, 'resource_already_exists_exception');
      }
      this.existingIndices.add(request.index);
      for (const alias of Object.keys(request.aliases ?? {})) this.attach(alias, request.index);
    },

    updateAliases: async ({ actions }: { actions?: readonly AliasAction[] }): Promise<void> => {
      this.log.push('updateAliases');
      for (const action of actions ?? []) {
        const { index, alias } = action.add ?? {};
        if (index && alias) this.attach(alias, index);
      }
    },

    getAlias: async ({ name }: { name: string }): Promise<Record<string, unknown>> => {
      this.log.push(`getAlias(${name})`);
      const targets = this.aliasTargets.get(name);
      if (!targets || targets.size === 0) throw clusterError(NOT_FOUND);
      return Object.fromEntries([...targets].map((index) => [index, { aliases: { [name]: {} } }]));
    },

    delete: async ({ index }: { index: string | readonly string[] }): Promise<void> => {
      const names = typeof index === 'string' ? [index] : [...index];
      this.log.push(`delete(${names.join(',')})`);
      for (const name of names) {
        this.existingIndices.delete(name);
        for (const targets of this.aliasTargets.values()) targets.delete(name);
      }
    },
  };

  async search<T>(request: estypes.SearchRequest): Promise<estypes.SearchResponse<T>> {
    this.log.push('search');
    this.searchRequests.push(request);
    return this.respondToSearch(request) as estypes.SearchResponse<T>;
  }

  async get<T>(request: { index: string; id: string }): Promise<estypes.GetGetResult<T>> {
    this.log.push(`get(${request.id})`);
    this.getRequests.push(request);
    return this.respondToGet(request.id) as estypes.GetGetResult<T>;
  }

  async bulk(request: estypes.BulkRequest): Promise<estypes.BulkResponse> {
    this.log.push('bulk');
    this.bulkRequests.push(request);
    return this.respondToBulk(request);
  }

  async close(): Promise<void> {
    this.closed = true;
  }

  isClosed(): boolean {
    return this.closed;
  }

  /** Pre-existing cluster state, for the paths that only run against an index somebody else made. */
  givenIndex(index: string, alias?: string): void {
    this.existingIndices.add(index);
    if (alias) this.attach(alias, index);
  }

  indicesBehind(alias: string): string[] {
    return [...(this.aliasTargets.get(alias) ?? [])];
  }

  /** The action/document line pairs of a bulk request, as the cluster would read them. */
  bulkPairs(
    call = 0,
  ): { action: Record<string, { _index?: string; _id?: string }>; document: Record<string, unknown> }[] {
    const operations = this.bulkRequests[call]?.operations ?? [];
    const pairs: { action: Record<string, { _index?: string; _id?: string }>; document: Record<string, unknown> }[] = [];
    for (let at = 0; at < operations.length; at += 2) {
      pairs.push({
        action: operations[at] as Record<string, { _index?: string; _id?: string }>,
        document: operations[at + 1] as Record<string, unknown>,
      });
    }
    return pairs;
  }

  asClient(): Client {
    return this as unknown as Client;
  }

  private attach(alias: string, index: string): void {
    const targets = this.aliasTargets.get(alias) ?? new Set<string>();
    targets.add(index);
    this.aliasTargets.set(alias, targets);
  }
}

export function emptySearchResponse(): estypes.SearchResponse<unknown> {
  return searchResponse({});
}

export function searchResponse(options: {
  hits?: estypes.SearchHit<unknown>[];
  total?: estypes.SearchHitsMetadata['total'];
  took?: number;
  aggregations?: Record<string, unknown>;
}): estypes.SearchResponse<unknown> {
  const hits = options.hits ?? [];
  return {
    took: options.took ?? 3,
    timed_out: false,
    _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
    hits: {
      total: options.total ?? { value: hits.length, relation: 'eq' },
      max_score: null,
      hits,
    },
    ...(options.aggregations
      ? { aggregations: options.aggregations as estypes.SearchResponse['aggregations'] }
      : {}),
  };
}

/** The response a healthy cluster gives: one `index` item per document line, none of them failed. */
export function bulkAccepting(request: estypes.BulkRequest): estypes.BulkResponse {
  const operations = request.operations ?? [];
  const items: estypes.BulkResponseItem[] = [];
  for (let at = 0; at < operations.length; at += 2) {
    const action = operations[at] as { index?: { _index?: string; _id?: string } };
    items.push({ _index: action.index?._index ?? '', _id: action.index?._id, status: 201 });
  }
  return { took: 1, errors: false, items: items.map((item) => ({ index: item })) };
}
