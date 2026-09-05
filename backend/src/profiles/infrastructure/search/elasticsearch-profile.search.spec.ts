/** Everything about this adapter that can be wrong without a cluster: */

import {
  FakeCluster,
  PERSONAL_VALUES,
  clusterError,
  cloneProfileAs,
  realProfile,
  searchResponse,
} from 'src/test/fakes';
import { SEARCH_FIELD_BY_KEY } from '../../domain/search/field-registry';
import {
  SUMMARY_SOURCE_FIELDS,
  toProfileDocument,
} from '../../domain/search/profile-document';
import { ProfileSummarySource } from '../../domain/search/profile-summary';
import { SearchCriteria, UnknownFilterFieldError } from '../../domain/search/search-criteria';
import { Logger } from '@nestjs/common';

import { ElasticsearchProfileSearch, SearchUnavailableError } from './elasticsearch-profile.search';

import { INDEX_MAPPING_VERSION } from './profile.mapping';

const ALIAS = 'profiles';
const CONCRETE = `${ALIAS}-${INDEX_MAPPING_VERSION}`;

/** Home address and postal code are held in PostgreSQL and must never reach the index either. */
const HOME_ADDRESS = ['3605 paint drive', '76210'];

function adapter(): { cluster: FakeCluster; subject: ElasticsearchProfileSearch } {
  const cluster = new FakeCluster();
  return {
    cluster,
    subject: new ElasticsearchProfileSearch(cluster.asClient(), { indexAlias: ALIAS }),
  };
}

/** Exactly what `_source: { includes: SUMMARY_SOURCE_FIELDS }` gives back for a real profile. */
function summarySource(username = 'joeyholland'): ProfileSummarySource {
  const document = toProfileDocument(cloneProfileAs(realProfile(), username)) as unknown as Record<
    string,
    unknown
  >;
  const source: Record<string, unknown> = {};
  for (const field of SUMMARY_SOURCE_FIELDS) {
    if (document[field] !== undefined) source[field] = document[field];
  }
  return source as unknown as ProfileSummarySource;
}

const criteria = (page = 1, size = 20) => SearchCriteria.create({ keywords: 'recruiting', page, size });

describe('what a search sends', () => {
  it('goes through the alias, so a reindex can swap the index underneath it', async () => {
    const { cluster, subject } = adapter();

    await subject.search(criteria());

    expect(cluster.searchRequests[0]?.index).toBe(ALIAS);
  });

  it('asks only for the fields a result row shows, not the whole document', async () => {
    const { cluster, subject } = adapter();

    await subject.search(criteria());

    expect(cluster.searchRequests[0]?._source).toEqual({ includes: [...SUMMARY_SOURCE_FIELDS] });
  });
});

describe('what a search makes of the answer', () => {
  it('trims a long skill list for the row but reports how many there really are', async () => {
    const { cluster, subject } = adapter();
    const source = summarySource();
    cluster.respondToSearch = () => searchResponse({ hits: [{ _index: CONCRETE, _id: 'joeyholland', _source: source }] });

    const [item] = (await subject.search(criteria())).items;

    expect(source.skills).toHaveLength(50);
    expect(item?.skills).toHaveLength(8);
    expect(item?.skills?.[0]).toBe('recruiting');
    expect(item?.totalSkills).toBe(50);
  });

  it('reads the total from an object total, which is what track_total_hits returns', async () => {
    const { cluster, subject } = adapter();
    cluster.respondToSearch = () =>
      searchResponse({
        hits: [{ _index: CONCRETE, _id: 'joeyholland', _source: summarySource() }],
        total: { value: 302, relation: 'eq' },
      });

    expect((await subject.search(criteria())).total).toBe(302);
  });

  it('reads the total from a bare number, which older clusters return', async () => {
    const { cluster, subject } = adapter();
    cluster.respondToSearch = () => searchResponse({ hits: [], total: 265 });

    expect((await subject.search(criteria())).total).toBe(265);
  });

  it('reports no total at all as zero rather than as NaN', async () => {
    const { cluster, subject } = adapter();
    // `hits.total` is optional in the cluster's own response type:
    cluster.respondToSearch = () => {
      const response = searchResponse({ hits: [] });
      return { ...response, hits: { ...response.hits, total: undefined } };
    };

    expect((await subject.search(criteria())).total).toBe(0);
  });

  it('reports the time the cluster spent, not a time of its own', async () => {
    const { cluster, subject } = adapter();
    cluster.respondToSearch = () => searchResponse({ took: 47 });

    expect((await subject.search(criteria())).tookMs).toBe(47);
  });

  it('echoes the page the caller asked for, since the response does not carry it', async () => {
    const { cluster, subject } = adapter();
    cluster.respondToSearch = () => searchResponse({ total: 265 });

    const result = await subject.search(criteria(4, 25));

    expect(result).toMatchObject({ page: 4, size: 25 });
  });

  it('carries highlights through under the field name the client knows', async () => {
    const { cluster, subject } = adapter();
    cluster.respondToSearch = () =>
      searchResponse({
        hits: [
          {
            _index: CONCRETE,
            _id: 'joeyholland',
            _score: 12.5,
            _source: summarySource(),
            highlight: {
              // The cluster answers on the analysed sub-field; the client filters by "skills".
              'skills.text': ['<em>recruiting</em>'],
              fullName: ['<em>joseph</em> holland'],
            },
          },
        ],
      });

    const [item] = (await subject.search(criteria())).items;

    expect(item?.highlights).toEqual({
      skills: ['<em>recruiting</em>'],
      fullName: ['<em>joseph</em> holland'],
    });
    expect(item?.score).toBe(12.5);
  });

  it('drops a hit the cluster returned without a source rather than emitting a blank row', async () => {
    const { cluster, subject } = adapter();
    cluster.respondToSearch = () =>
      searchResponse({
        hits: [
          { _index: CONCRETE, _id: 'ghost' },
          { _index: CONCRETE, _id: 'joeyholland', _source: summarySource() },
        ],
        total: 2,
      });

    const result = await subject.search(criteria());

    expect(result.items.map((item) => item.linkedinUsername)).toEqual(['joeyholland']);
    // The total still reflects what the cluster matched; only the unreadable row is gone.
    expect(result.total).toBe(2);
  });

  it('answers an empty page on a cluster that has never been indexed', async () => {
    const { cluster, subject } = adapter();
    cluster.respondToSearch = () => {
      throw clusterError(404, 'index_not_found_exception');
    };

    const result = await subject.search(criteria(3, 50));

    expect(result).toEqual({ items: [], total: 0, page: 3, size: 50, facets: [], tookMs: 0 });
  });
});

describe('suggesting values', () => {
  it('refuses a field the registry does not know before any request is issued', async () => {
    const { cluster, subject } = adapter();

    await expect(subject.suggest('twitterUsername', 'a', 10)).rejects.toBeInstanceOf(
      UnknownFilterFieldError,
    );
    expect(cluster.log).toEqual([]);
  });

  it('reads the buckets of a flat field and stops at the limit', async () => {
    const { cluster, subject } = adapter();
    cluster.respondToSearch = () =>
      searchResponse({
        aggregations: {
          jobTitle: {
            buckets: [
              { key: 'recruiting manager', doc_count: 9 },
              { key: 'recruiting coordinator', doc_count: 4 },
              { key: 'recruiting director', doc_count: 1 },
            ],
            sum_other_doc_count: 0,
          },
        },
      });

    await expect(subject.suggest('jobTitle', 'recruiting', 2)).resolves.toEqual([
      'recruiting manager',
      'recruiting coordinator',
    ]);
  });

  it('reads a nested field through its inner terms aggregation', async () => {
    const { cluster, subject } = adapter();
    cluster.respondToSearch = () =>
      searchResponse({
        aggregations: {
          pastCompany: {
            doc_count: 40,
            values: {
              buckets: [{ key: 'garver', doc_count: 6, profiles: { doc_count: 3 } }],
              sum_other_doc_count: 0,
            },
          },
        },
      });

    await expect(subject.suggest('pastCompany', 'gar', 5)).resolves.toEqual(['garver']);
  });

  it('sends a request that names the field key as its aggregation, so the read finds it', async () => {
    const { cluster, subject } = adapter();

    await subject.suggest('companyName', 'north', 5);

    const request = cluster.searchRequests[0];
    expect(request?.index).toBe(ALIAS);
    expect(Object.keys(request?.aggs ?? {})).toEqual(['companyName']);
    expect(request?.size).toBe(0);
    expect(request?._source).toBe(false);
  });

  it('answers nothing on a cluster that has never been indexed', async () => {
    const { cluster, subject } = adapter();
    cluster.respondToSearch = () => {
      throw clusterError(404, 'index_not_found_exception');
    };

    await expect(subject.suggest('skills', 'ja', 10)).resolves.toEqual([]);
  });
});

describe('preparing the index', () => {
  it('creates the concrete index with its mapping and alias on an empty cluster', async () => {
    const { cluster, subject } = adapter();

    await subject.ensureIndex();

    expect(cluster.createRequests).toHaveLength(1);
    expect(cluster.createRequests[0]?.index).toBe(CONCRETE);
    expect(Object.keys(cluster.createRequests[0]?.aliases ?? {})).toEqual([ALIAS]);
    expect(cluster.indicesBehind(ALIAS)).toEqual([CONCRETE]);
  });

  it('does not recreate an index it has already made', async () => {
    const { cluster, subject } = adapter();

    await subject.ensureIndex();
    await subject.ensureIndex();

    expect(cluster.createRequests).toHaveLength(1);
    expect(cluster.indicesBehind(ALIAS)).toEqual([CONCRETE]);
  });

  it('adopts an index another node made before the alias was attached', async () => {
    const { cluster, subject } = adapter();
    cluster.givenIndex(CONCRETE);

    await subject.ensureIndex();

    expect(cluster.createRequests).toEqual([]);
    expect(cluster.indicesBehind(ALIAS)).toEqual([CONCRETE]);
  });

  it('reports a cluster that cannot be reached at all rather than carrying on', async () => {
    const { cluster, subject } = adapter();
    cluster.indices.existsAlias = async () => {
      throw clusterError(503, 'circuit_breaking_exception');
    };

    await expect(subject.ensureIndex()).rejects.toBeInstanceOf(SearchUnavailableError);
  });

  it('does not mistake any other create failure for the create race', async () => {
    const { cluster, subject } = adapter();
    // Not a ResponseError at all, which is what a DNS or TLS failure looks like from here.
    cluster.indices.create = async () => {
      throw new Error('getaddrinfo ENOTFOUND search.internal');
    };

    await expect(subject.ensureIndex()).rejects.toBeInstanceOf(SearchUnavailableError);
    expect(cluster.indicesBehind(ALIAS)).toEqual([]);
  });

  it('warns once when the alias resolves to an index built on an older mapping', async () => {
    const { cluster, subject } = adapter();
    cluster.givenIndex(`${ALIAS}-v0`, ALIAS);
    const warnings: unknown[] = [];
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation((...args: unknown[]) => void warnings.push(args[0]));

    try {
      await subject.ensureIndex();
      await subject.ensureIndex();
    } finally {
      warn.mockRestore();
    }

    expect(warnings).toEqual([
      `Alias "${ALIAS}" resolves to ${ALIAS}-v0 but the mapping expects ${CONCRETE}. Reindex to apply it.`,
    ]);
    // The second call asked the cluster nothing about the alias: the check runs once per process.
    expect(cluster.log.filter((call) => call === `getAlias(${ALIAS})`)).toHaveLength(1);
  });

  it('attaches the alias rather than failing when it loses the create race', async () => {
    const { cluster, subject } = adapter();
    let raced = false;
    const create = cluster.indices.create;
    cluster.indices.create = async (request) => {
      if (!raced) {
        raced = true;
        cluster.givenIndex(request.index);
        throw clusterError(400, 'resource_already_exists_exception');
      }
      return create(request);
    };

    await expect(subject.ensureIndex()).resolves.toBeUndefined();
    expect(cluster.indicesBehind(ALIAS)).toEqual([CONCRETE]);
  });
});

describe('indexing documents', () => {
  it('issues no request at all for an empty batch', async () => {
    const { cluster, subject } = adapter();

    await expect(subject.index([])).resolves.toEqual({ indexed: 0, failures: [] });
    expect(cluster.log).toEqual([]);
  });

  it('sends alternating action and document lines keyed by the business key', async () => {
    const { cluster, subject } = adapter();

    await subject.index([cloneProfileAs(realProfile(), 'first'), cloneProfileAs(realProfile(), 'second')]);

    const pairs = cluster.bulkPairs();
    expect(pairs.map((pair) => pair.action.index?._id)).toEqual(['first', 'second']);
    expect(pairs.map((pair) => pair.action.index?._index)).toEqual([ALIAS, ALIAS]);
    expect(pairs.map((pair) => pair.document.linkedinUsername)).toEqual(['first', 'second']);
  });

  it('waits for the documents to become visible without forcing a refresh', async () => {
    const { cluster, subject } = adapter();

    await subject.index([realProfile()]);

    expect(cluster.bulkRequests[0]?.refresh).toBe('wait_for');
  });

  it('stamps every document in one run with the same indexedAt', async () => {
    const { cluster, subject } = adapter();

    await subject.index([cloneProfileAs(realProfile(), 'first'), cloneProfileAs(realProfile(), 'second')]);

    const stamps = cluster.bulkPairs().map((pair) => pair.document.indexedAt);
    expect(new Set(stamps).size).toBe(1);
    expect(typeof stamps[0]).toBe('string');
  });

  it('sends no email address, phone number or home address to the cluster', async () => {
    const { cluster, subject } = adapter();
    const profile = realProfile();

    await subject.index([profile]);

    const body = JSON.stringify(cluster.bulkRequests[0]?.operations);
    expect(profile.contact?.emails?.length).toBeGreaterThan(0);
    for (const personal of [...PERSONAL_VALUES, ...HOME_ADDRESS]) {
      expect(body).not.toContain(personal);
    }
    const [document] = cluster.bulkPairs().map((pair) => pair.document);
    for (const key of ['contact', 'emails', 'phones', 'workEmail', 'mobilePhone', 'addresses']) {
      expect(document).not.toHaveProperty(key);
    }
  });

  it('splits a corpus larger than one bulk request into several', async () => {
    const { cluster, subject } = adapter();
    const profiles = Array.from({ length: 501 }, (_unused, at) => cloneProfileAs(realProfile(), `p${at}`));

    const result = await subject.index(profiles);

    expect(cluster.bulkRequests).toHaveLength(2);
    expect(cluster.bulkPairs(0)).toHaveLength(500);
    expect(cluster.bulkPairs(1)).toHaveLength(1);
    expect(result.indexed).toBe(501);
  });

  it('reports each rejected document by id and still counts the ones that landed', async () => {
    const { cluster, subject } = adapter();
    cluster.respondToBulk = () => ({
      took: 2,
      errors: true,
      items: [
        { index: { _index: CONCRETE, _id: 'first', status: 201 } },
        {
          index: {
            _index: CONCRETE,
            _id: 'second',
            status: 400,
            error: { type: 'strict_dynamic_mapping_exception', reason: 'mapping set to strict' },
          },
        },
        {
          index: {
            _index: CONCRETE,
            _id: 'third',
            status: 400,
            error: { type: 'mapper_parsing_exception', reason: 'failed to parse field [companyFounded]' },
          },
        },
      ],
    });

    const result = await subject.index([
      cloneProfileAs(realProfile(), 'first'),
      cloneProfileAs(realProfile(), 'second'),
      cloneProfileAs(realProfile(), 'third'),
    ]);

    expect(result.indexed).toBe(1);
    expect(result.failures).toEqual([
      'second: mapping set to strict',
      'third: failed to parse field [companyFounded]',
    ]);
  });

  it('names a failure the cluster could attribute to neither a document nor a reason', async () => {
    const { cluster, subject } = adapter();
    cluster.respondToBulk = () => ({
      took: 2,
      errors: true,
      items: [
        { index: { _index: CONCRETE, status: 400, error: { type: 'illegal_argument_exception' } } },
        // A line the adapter cannot read: it counts as neither indexed nor failed.
        {},
      ],
    });

    const result = await subject.index([
      cloneProfileAs(realProfile(), 'first'),
      cloneProfileAs(realProfile(), 'second'),
    ]);

    expect(result).toEqual({ indexed: 0, failures: ['unknown: illegal_argument_exception'] });
  });

  it('prepares the index before writing, so a cold cluster does not reject the batch', async () => {
    const { cluster, subject } = adapter();

    await subject.index([realProfile()]);

    expect(cluster.log.indexOf('bulk')).toBeGreaterThan(cluster.log.indexOf(`create(${CONCRETE})`));
    expect(cluster.indicesBehind(ALIAS)).toEqual([CONCRETE]);
  });
});

describe('emptying the index', () => {
  it('drops what the alias resolves to and leaves a fresh index behind it', async () => {
    const { cluster, subject } = adapter();
    await subject.ensureIndex();
    cluster.log.length = 0;

    await subject.deleteAll();

    expect(cluster.log).toContain(`delete(${CONCRETE})`);
    expect(cluster.indicesBehind(ALIAS)).toEqual([CONCRETE]);
  });

  it('leaves the cluster ready to be written to again', async () => {
    const { cluster, subject } = adapter();
    await subject.ensureIndex();

    await subject.deleteAll();
    const result = await subject.index([realProfile()]);

    expect(result).toEqual({ indexed: 1, failures: [] });
    expect(cluster.bulkRequests).toHaveLength(1);
  });

  it('is not an error on a cluster where the alias was never created', async () => {
    const { cluster, subject } = adapter();

    await expect(subject.deleteAll()).resolves.toBeUndefined();
    expect(cluster.indicesBehind(ALIAS)).toEqual([CONCRETE]);
  });

  it('reports a cluster that refuses the read rather than reporting an empty index', async () => {
    const { cluster, subject } = adapter();
    cluster.indices.getAlias = async () => {
      throw clusterError(503, 'circuit_breaking_exception');
    };

    await expect(subject.deleteAll()).rejects.toBeInstanceOf(SearchUnavailableError);
  });

  it('drops an index the alias picked up as well, so the mapping cannot survive a rebuild', async () => {
    const { cluster, subject } = adapter();
    cluster.givenIndex(`${ALIAS}-v0`, ALIAS);

    await subject.deleteAll();

    expect(cluster.log).toContain(`delete(${ALIAS}-v0)`);
    expect(cluster.indicesBehind(ALIAS)).toEqual([CONCRETE]);
  });
});

describe('a cluster that fails', () => {
  const failWith = () => clusterError(503, 'circuit_breaking_exception');

  it('does not let a search failure reach the caller as an Elasticsearch exception', async () => {
    const { cluster, subject } = adapter();
    cluster.respondToSearch = () => {
      throw failWith();
    };

    const error = await subject
      .search(criteria())
      .then(() => undefined)
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).name).not.toBe('ResponseError');
  });

  it('does not let a write failure reach the caller as an Elasticsearch exception', async () => {
    const { cluster, subject } = adapter();
    cluster.respondToBulk = () => {
      throw failWith();
    };

    const error = await subject
      .index([realProfile()])
      .then(() => undefined)
      .catch((thrown: unknown) => thrown);

    expect((error as Error).name).not.toBe('ResponseError');
  });

  it('keeps the underlying cluster error as the cause, so it is still diagnosable', async () => {
    const { cluster, subject } = adapter();
    const raised = failWith();
    cluster.respondToSearch = () => {
      throw raised;
    };

    const error = await subject
      .search(criteria())
      .then(() => undefined)
      .catch((thrown: unknown) => thrown);

    expect((error as Error).cause).toBe(raised);
  });

  it('still refuses an unknown field with its own error rather than a cluster failure', async () => {
    const { subject } = adapter();

    await expect(subject.suggest('nope', 'a', 5)).rejects.toBeInstanceOf(UnknownFilterFieldError);
    expect(SEARCH_FIELD_BY_KEY.has('nope')).toBe(false);
  });
});

describe('shutdown', () => {
  it('closes the client when the module is torn down, so the process can exit', async () => {
    const { cluster, subject } = adapter();

    await subject.onModuleDestroy();

    expect(cluster.isClosed()).toBe(true);
  });
});
