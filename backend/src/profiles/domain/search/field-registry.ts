/** One declaration per filterable field. */

export type FilterKind =
  /** One of a set of exact values. Rendered as a multi-select, or a typeahead when large. */
  | 'terms'
  /** A numeric interval. Rendered as a two-ended slider. */
  | 'range'
  /** A closed, ordered vocabulary. Rendered as ordered chips, not a slider. */
  | 'ordered_terms'
  /** A partial-date interval. Rendered as a year range. */
  | 'date_range'
  /** Presence or absence of the field. Rendered as a tri-state toggle. */
  | 'exists';

export interface SearchField {
  /** Stable key used in the API and the URL query string. */
  readonly key: string;
  readonly label: string;
  /** Section the field is filed under in the "Add filter" panel. */
  readonly group: string;
  readonly kind: FilterKind;
  /** Path in the Elasticsearch document. Whether it is nested is read from the mapping. */
  readonly esField: string;
  readonly facetable: boolean;
  /** Too many distinct values for a bucket list; completed through the suggest endpoint instead. */
  readonly typeahead?: boolean;
  /** For `ordered_terms`: the vocabulary, in its natural order. */
  readonly options?: readonly string[];
  /** Shown in the always-visible filter bar. */
  readonly primary?: boolean;
  /** Short help text surfaced in the UI. */
  readonly hint?: string;
}

// The closed vocabularies below serve both the query side and the import column catalog.
export const SALARY_BAND_ORDER = [
  '<20,000',
  '20,000-25,000',
  '25,000-35,000',
  '35,000-45,000',
  '45,000-55,000',
  '55,000-70,000',
  '70,000-85,000',
  '85,000-100,000',
  '100,000-150,000',
  '150,000-250,000',
  '>250,000',
] as const;

export const COMPANY_SIZE_ORDER = [
  '1-10',
  '11-50',
  '51-200',
  '201-500',
  '501-1000',
  '1001-5000',
  '5001-10000',
  '10001+',
] as const;

export const SENIORITY_ORDER = [
  'unpaid',
  'training',
  'entry',
  'senior',
  'manager',
  'director',
  'vp',
  'partner',
  'cxo',
  'owner',
] as const;

export const SEARCH_FIELDS: readonly SearchField[] = [
  // Expertise
  { key: 'skills', label: 'Skills', group: 'Expertise', kind: 'terms', esField: 'skills', facetable: true, typeahead: true, primary: true },
  { key: 'interests', label: 'Interests', group: 'Expertise', kind: 'terms', esField: 'interests', facetable: true, typeahead: true },
  { key: 'languages', label: 'Languages', group: 'Expertise', kind: 'terms', esField: 'languages.name', facetable: true },
  { key: 'certifications', label: 'Certifications', group: 'Expertise', kind: 'terms', esField: 'certifications.name', facetable: true, typeahead: true },

  // Career
  { key: 'jobTitle', label: 'Job title', group: 'Career', kind: 'terms', esField: 'jobTitle', facetable: true, typeahead: true, primary: true },
  { key: 'jobRole', label: 'Job function', group: 'Career', kind: 'terms', esField: 'jobRole', facetable: true, primary: true },
  { key: 'jobSubRole', label: 'Job speciality', group: 'Career', kind: 'terms', esField: 'jobSubRole', facetable: true },
  { key: 'seniority', label: 'Seniority', group: 'Career', kind: 'ordered_terms', esField: 'jobLevels', facetable: true, options: SENIORITY_ORDER, primary: true },
  { key: 'industry', label: 'Industry', group: 'Career', kind: 'terms', esField: 'industry', facetable: true, primary: true },
  { key: 'yearsExperience', label: 'Years of experience', group: 'Career', kind: 'range', esField: 'yearsExperience', facetable: false },
  { key: 'salaryBand', label: 'Salary band', group: 'Career', kind: 'ordered_terms', esField: 'salaryBand', facetable: true, options: SALARY_BAND_ORDER, primary: true, hint: 'Inferred by the source; a band, not a figure' },
  { key: 'jobStartYear', label: 'Started current role', group: 'Career', kind: 'date_range', esField: 'jobStartDate', facetable: false },

  // Company
  { key: 'companyName', label: 'Company', group: 'Company', kind: 'terms', esField: 'companyName', facetable: true, typeahead: true, primary: true },
  { key: 'companySize', label: 'Company size', group: 'Company', kind: 'ordered_terms', esField: 'companySize', facetable: true, options: COMPANY_SIZE_ORDER, primary: true },
  { key: 'companyIndustry', label: 'Company industry', group: 'Company', kind: 'terms', esField: 'companyIndustry', facetable: true },
  { key: 'companyFounded', label: 'Company founded', group: 'Company', kind: 'range', esField: 'companyFounded', facetable: false },
  { key: 'companyCountry', label: 'Company country', group: 'Company', kind: 'terms', esField: 'companyLocation.country', facetable: true },

  // Past roles (nested)
  { key: 'pastCompany', label: 'Worked at', group: 'Past roles', kind: 'terms', esField: 'experience.companyName', facetable: true, typeahead: true },
  { key: 'pastTitle', label: 'Previous title', group: 'Past roles', kind: 'terms', esField: 'experience.title', facetable: true, typeahead: true },
  { key: 'pastIndustry', label: 'Previous industry', group: 'Past roles', kind: 'terms', esField: 'experience.companyIndustry', facetable: true },

  // Education (nested)
  { key: 'school', label: 'School', group: 'Education', kind: 'terms', esField: 'education.schoolName', facetable: true, typeahead: true },
  { key: 'degree', label: 'Degree', group: 'Education', kind: 'terms', esField: 'education.degrees', facetable: true },
  { key: 'major', label: 'Field of study', group: 'Education', kind: 'terms', esField: 'education.majors', facetable: true, typeahead: true },
  { key: 'graduationYear', label: 'Graduated', group: 'Education', kind: 'date_range', esField: 'education.endDate', facetable: false },

  // Location
  { key: 'country', label: 'Country', group: 'Location', kind: 'terms', esField: 'country', facetable: true, primary: true },
  { key: 'region', label: 'Region / state', group: 'Location', kind: 'terms', esField: 'region', facetable: true, typeahead: true },
  { key: 'locality', label: 'City', group: 'Location', kind: 'terms', esField: 'locality', facetable: true, typeahead: true },
  { key: 'metro', label: 'Metro area', group: 'Location', kind: 'terms', esField: 'metro', facetable: true, typeahead: true },
  { key: 'continent', label: 'Continent', group: 'Location', kind: 'terms', esField: 'continent', facetable: true },

  // Person
  { key: 'gender', label: 'Gender', group: 'Person', kind: 'terms', esField: 'gender', facetable: true },
  { key: 'connections', label: 'Connections', group: 'Person', kind: 'range', esField: 'connections', facetable: false },
  { key: 'hasGithub', label: 'Has GitHub', group: 'Person', kind: 'exists', esField: 'githubUsername', facetable: false },
  { key: 'hasTwitter', label: 'Has Twitter', group: 'Person', kind: 'exists', esField: 'twitterUsername', facetable: false },
  { key: 'hasSummary', label: 'Has a bio', group: 'Person', kind: 'exists', esField: 'summary', facetable: false },

  // Data quality
  {
    key: 'qualityScore',
    label: 'Data quality',
    group: 'Data quality',
    kind: 'range',
    esField: 'quality.score',
    facetable: false,
    hint: 'Share of the fields this row supplied that survived validation',
  },
  {
    key: 'wasRepaired',
    label: 'Repaired on import',
    group: 'Data quality',
    kind: 'exists',
    esField: 'quality.repaired',
    facetable: false,
    hint: 'The row needed structural realignment before it could be read',
  },
];

export const SEARCH_FIELD_BY_KEY: ReadonlyMap<string, SearchField> = new Map(
  SEARCH_FIELDS.map((field) => [field.key, field]),
);

export const FACETABLE_FIELDS: readonly SearchField[] = SEARCH_FIELDS.filter((f) => f.facetable);
export const PRIMARY_FIELDS: readonly SearchField[] = SEARCH_FIELDS.filter((f) => f.primary);

/** Fields the free-text box searches, with their weights. */
export const KEYWORD_FIELDS: readonly { field: string; boost: number; fuzzy: boolean }[] = [
  { field: 'fullName', boost: 6, fuzzy: true },
  { field: 'jobTitle', boost: 4, fuzzy: true },
  { field: 'skills', boost: 3, fuzzy: false },
  { field: 'companyName', boost: 2.5, fuzzy: true },
  { field: 'industry', boost: 2, fuzzy: false },
  { field: 'jobRole', boost: 2, fuzzy: false },
  { field: 'experience.title', boost: 1.5, fuzzy: false },
  { field: 'experience.companyName', boost: 1.5, fuzzy: false },
  { field: 'education.schoolName', boost: 1.2, fuzzy: false },
  { field: 'education.majors', boost: 1.2, fuzzy: false },
  { field: 'interests', boost: 1, fuzzy: false },
  { field: 'summary', boost: 1, fuzzy: false },
];

export type SortKey = 'relevance' | 'name' | 'connections' | 'experience' | 'quality';

export const SORT_OPTIONS: readonly { key: SortKey; label: string }[] = [
  { key: 'relevance', label: 'Best match' },
  { key: 'name', label: 'Name (A–Z)' },
  { key: 'connections', label: 'Most connections' },
  { key: 'experience', label: 'Most experience' },
  { key: 'quality', label: 'Most complete profile' },
];
