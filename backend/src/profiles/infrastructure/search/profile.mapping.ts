import { estypes } from '@elastic/elasticsearch';

/** Dates in this dataset are a year, a year-month or a full date, and are frequently absent. */
export const PARTIAL_DATE_FORMATS = 'yyyy-MM-dd||yyyy-MM||yyyy';

/** Bumped whenever PROFILE_MAPPING changes in a way that requires a reindex. */
export const INDEX_MAPPING_VERSION = 'v1';

const FOLDED = 'folded';
const FOLDED_EDGE = 'folded_edge';
const KEYWORD_LOWER = 'keyword_lower';

/** The concrete index the alias points at. */
export function concreteIndexName(alias: string): string {
  return `${alias}-${INDEX_MAPPING_VERSION}`;
}

export const PROFILE_INDEX_SETTINGS: estypes.IndicesIndexSettings = {
  number_of_shards: 1,
  number_of_replicas: 0,
  analysis: {
    filter: {
      edge_prefix: { type: 'edge_ngram', min_gram: 1, max_gram: 20 },
    },
    analyzer: {
      [FOLDED]: { type: 'custom', tokenizer: 'standard', filter: ['lowercase', 'asciifolding'] },
      [FOLDED_EDGE]: {
        type: 'custom',
        tokenizer: 'standard',
        filter: ['lowercase', 'asciifolding', 'edge_prefix'],
      },
    },
    normalizer: {
      [KEYWORD_LOWER]: { type: 'custom', filter: ['lowercase', 'asciifolding'] },
    },
  },
};

/** Free text: analysed for matching, with a keyword sub-field so it can also be sorted on. */
function textField(): estypes.MappingProperty {
  return {
    type: 'text',
    analyzer: FOLDED,
    fields: { keyword: { type: 'keyword', ignore_above: 256 } },
  };
}

/** An exact value driving filters and facets. `text` adds an analysed form, `prefix` a typeahead one. */
function facetField(options: { text?: boolean; prefix?: boolean } = {}): estypes.MappingProperty {
  const property: estypes.MappingKeywordProperty = { type: 'keyword', normalizer: KEYWORD_LOWER };
  if (options.text || options.prefix) {
    property.fields = {};
    if (options.text) property.fields.text = { type: 'text', analyzer: FOLDED };
    if (options.prefix) {
      property.fields.prefix = { type: 'text', analyzer: FOLDED_EDGE, search_analyzer: FOLDED };
    }
  }
  return property;
}

/** `ignore_malformed` keeps one unparseable date from rejecting an otherwise good profile. */
function partialDate(): estypes.MappingProperty {
  return { type: 'date', format: PARTIAL_DATE_FORMATS, ignore_malformed: true };
}

export const PROFILE_MAPPING: estypes.MappingTypeMapping = {
  dynamic: 'strict',
  properties: {
    linkedinUsername: { type: 'keyword' },
    linkedinUrl: { type: 'keyword', index: false },

    fullName: textField(),
    firstName: textField(),
    lastName: textField(),
    gender: facetField(),

    industry: facetField({ text: true }),
    jobTitle: facetField({ text: true, prefix: true }),
    jobRole: facetField({ text: true }),
    jobSubRole: facetField(),
    jobLevels: facetField(),
    jobStartDate: partialDate(),

    companyName: facetField({ text: true, prefix: true }),
    companySize: facetField(),
    companyIndustry: facetField(),
    companyFounded: { type: 'integer' },
    companyLocation: {
      type: 'object',
      properties: { country: facetField(), region: facetField(), locality: facetField() },
    },

    locationName: facetField(),
    locality: facetField({ prefix: true }),
    metro: facetField({ prefix: true }),
    region: facetField({ prefix: true }),
    country: facetField(),
    continent: facetField(),

    connections: { type: 'integer' },
    salaryBand: facetField(),
    yearsExperience: { type: 'float' },
    summary: { type: 'text', analyzer: FOLDED },

    skills: facetField({ text: true, prefix: true }),
    interests: facetField({ text: true, prefix: true }),
    certifications: {
      type: 'object',
      properties: { name: facetField({ prefix: true }), organization: facetField() },
    },
    languages: { type: 'object', properties: { name: facetField() } },

    // Nested, so two filters must match the same entry rather than the same person.
    experience: {
      type: 'nested',
      properties: {
        title: facetField({ text: true, prefix: true }),
        role: facetField(),
        levels: facetField(),
        companyName: facetField({ text: true, prefix: true }),
        companySize: facetField(),
        companyIndustry: facetField(),
        startDate: partialDate(),
        endDate: partialDate(),
        isPrimary: { type: 'boolean' },
      },
    },
    education: {
      type: 'nested',
      properties: {
        schoolName: facetField({ text: true, prefix: true }),
        schoolType: facetField(),
        degrees: facetField({ text: true }),
        majors: facetField({ text: true, prefix: true }),
        minors: facetField(),
        startDate: partialDate(),
        endDate: partialDate(),
      },
    },

    githubUsername: { type: 'keyword' },
    twitterUsername: { type: 'keyword' },
    facebookUsername: { type: 'keyword' },

    quality: {
      type: 'object',
      properties: {
        score: { type: 'float' },
        populated: { type: 'integer' },
        quarantined: { type: 'integer' },
        repaired: { type: 'boolean' },
        drifted: { type: 'boolean' },
      },
    },
    contentHash: { type: 'keyword' },
    indexedAt: { type: 'date' },
  },
};

interface MappingBranch {
  readonly properties?: Record<string, estypes.MappingProperty>;
  readonly fields?: Record<string, estypes.MappingProperty>;
}

/** The mapped property at a dotted path, walking both object properties and sub-fields. */
export function mappingPropertyAt(path: string): estypes.MappingProperty | undefined {
  let branch: MappingBranch = PROFILE_MAPPING;
  let property: estypes.MappingProperty | undefined;
  for (const segment of path.split('.')) {
    const next = branch.properties?.[segment] ?? branch.fields?.[segment];
    if (!next) return undefined;
    property = next;
    branch = next;
  }
  return property;
}

function propertyType(path: string): string | undefined {
  const property = mappingPropertyAt(path);
  return property && 'type' in property ? property.type : undefined;
}

/** The analysed form of a field, which is what a text query has to target. */
export function analyzedFieldFor(path: string): string {
  if (propertyType(path) === 'text') return path;
  return propertyType(`${path}.text`) === 'text' ? `${path}.text` : path;
}

/** The edge_ngram form of a field, when it has one. */
export function prefixFieldFor(path: string): string | undefined {
  return propertyType(`${path}.prefix`) === 'text' ? `${path}.prefix` : undefined;
}

/** True when the mapped field is a boolean, which changes what "has a value" means for a filter. */
export function isBooleanField(path: string): boolean {
  return propertyType(path) === 'boolean';
}
