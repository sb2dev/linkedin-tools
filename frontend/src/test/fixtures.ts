/** Shared fixtures for the component tests. */

import type {
  Facet,
  ImportCommitResult,
  ImportPreview,
  ImportRowOutcome,
  ImportRowReport,
  ImportRowStatus,
  ProfileDetail,
  ProfileSummary,
  SearchField,
  SearchResult,
  SearchSchema,
  SourceEntry,
} from '@/types/api';

/** The backend registry's own order for the closed vocabularies. Not frequency order. */
export const SALARY_BANDS = [
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
];

export const COMPANY_SIZES = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5001-10000', '10001+'];

export const SENIORITY_LEVELS = [
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
];

export const SCHEMA_GROUPS = ['Expertise', 'Career', 'Company', 'Education', 'Location', 'Person', 'Data quality'];

const FIELDS: SearchField[] = [
  { key: 'skills', label: 'Skills', group: 'Expertise', kind: 'terms', facetable: true, typeahead: true, primary: true },
  { key: 'languages', label: 'Languages', group: 'Expertise', kind: 'terms', facetable: true },
  { key: 'jobTitle', label: 'Job title', group: 'Career', kind: 'terms', facetable: true, typeahead: true, primary: true },
  { key: 'jobRole', label: 'Job function', group: 'Career', kind: 'terms', facetable: true, primary: true },
  { key: 'seniority', label: 'Seniority', group: 'Career', kind: 'ordered_terms', facetable: true, options: SENIORITY_LEVELS, primary: true },
  { key: 'industry', label: 'Industry', group: 'Career', kind: 'terms', facetable: true, primary: true },
  { key: 'yearsExperience', label: 'Years of experience', group: 'Career', kind: 'range', facetable: false },
  {
    key: 'salaryBand',
    label: 'Salary band',
    group: 'Career',
    kind: 'ordered_terms',
    facetable: true,
    options: SALARY_BANDS,
    primary: true,
    hint: 'Inferred by the source; a band, not a figure',
  },
  { key: 'companyName', label: 'Company', group: 'Company', kind: 'terms', facetable: true, typeahead: true, primary: true },
  { key: 'companySize', label: 'Company size', group: 'Company', kind: 'ordered_terms', facetable: true, options: COMPANY_SIZES, primary: true },
  { key: 'graduationYear', label: 'Graduated', group: 'Education', kind: 'date_range', facetable: false },
  { key: 'country', label: 'Country', group: 'Location', kind: 'terms', facetable: true, primary: true },
  { key: 'gender', label: 'Gender', group: 'Person', kind: 'terms', facetable: true },
  { key: 'connections', label: 'Connections', group: 'Person', kind: 'range', facetable: false },
  { key: 'hasTwitter', label: 'Has Twitter', group: 'Person', kind: 'exists', facetable: false },
  {
    key: 'qualityScore',
    label: 'Data quality',
    group: 'Data quality',
    kind: 'range',
    facetable: false,
    hint: 'Share of the fields this row supplied that survived validation',
  },
];

export const SORT_OPTIONS = [
  { key: 'relevance' as const, label: 'Best match' },
  { key: 'name' as const, label: 'Name (A-Z)' },
  { key: 'connections' as const, label: 'Most connections' },
  { key: 'experience' as const, label: 'Most experience' },
  { key: 'quality' as const, label: 'Most complete profile' },
];

/** The schema the UI is generated from. `extra` stands in for a field the backend adds later. */
export function searchSchema(extra: SearchField[] = []): SearchSchema {
  return { fields: [...FIELDS.map((field) => ({ ...field })), ...extra], sorts: [...SORT_OPTIONS], groups: [...SCHEMA_GROUPS] };
}

export function fieldNamed(key: string): SearchField {
  const found = FIELDS.find((field) => field.key === key);
  if (!found) throw new Error(`no such field in the fixture schema: ${key}`);
  return { ...found };
}

export function facet(key: string, buckets: [string, number][], otherCount = 0): Facet {
  return { key, buckets: buckets.map(([value, count]) => ({ value, count })), otherCount };
}

const RECRUITER_SKILLS = [
  'recruiting',
  'leadership',
  'human resources',
  'training',
  'management',
  'interviews',
  'hiring',
  'team building',
  'employee benefits',
  'temporary placement',
];

export function profile(overrides: Partial<ProfileSummary> = {}): ProfileSummary {
  return {
    linkedinUsername: 'joeyholland',
    fullName: 'joseph holland',
    jobTitle: 'recruiting manager',
    companyName: 'garver',
    industry: 'civil engineering',
    location: 'denton, texas, united states',
    yearsExperience: 12,
    skills: [...RECRUITER_SKILLS],
    totalSkills: 50,
    qualityScore: 0.71,
    repaired: false,
    ...overrides,
  };
}

export function searchResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return { items: [profile()], total: 1, page: 1, size: 20, facets: [], tookMs: 7, ...overrides };
}

/** The reference run over the 336-row export. */
export function importPreview(overrides: Partial<ImportPreview> = {}): ImportPreview {
  return {
    importId: '3f2a9c04-8e1b-4d77-9a20-6c5f1d0b7e42',
    filename: '300 user linkedin.csv',
    sizeBytes: 11_534_336,
    createdAt: '2026-02-11T09:14:03.000Z',
    status: 'previewed',
    counts: {
      rowsTotal: 336,
      rowsAccepted: 302,
      rowsRejected: 34,
      duplicatesCollapsed: 37,
      profilesNew: 265,
      profilesUpdated: 0,
      profilesUnchanged: 0,
      scrambledRows: 213,
      repairableRows: 20,
      realignedRows: 0,
      fieldsQuarantined: 9203,
    },
    countsWithRepair: {
      profilesNew: 265,
      profilesUpdated: 0,
      profilesUnchanged: 0,
      rowsAccepted: 302,
      scrambledRows: 80,
      realignedRows: 133,
      fieldsQuarantined: 7602,
    },
    rejections: [
      {
        reason: 'JUNK_LINE',
        label: 'Junk line',
        count: 18,
        samples: [
          { lineNumber: 12, excerpt: 'H:\\New folder\\leak\\international\\linkedin\\part-00001' },
          { lineNumber: 47, excerpt: 'H:\\New folder\\leak\\international\\linkedin\\part-00002' },
          { lineNumber: 91, excerpt: 'H:\\New folder\\leak\\international\\linkedin\\part-00003' },
        ],
      },
      {
        reason: 'FIELD_COUNT_MISMATCH',
        label: 'Wrong number of fields',
        count: 15,
        samples: [
          { lineNumber: 63, excerpt: 'shoba murali,shoba,murali,female,...' },
          { lineNumber: 128, excerpt: 'tim martin,tim,martin,male,...' },
          { lineNumber: 204, excerpt: 'joseph holland,joseph,holland,male,...' },
        ],
      },
      {
        reason: 'EMBEDDED_HEADER',
        label: 'Repeated header row',
        count: 1,
        samples: [{ lineNumber: 171, excerpt: 'full_name,first_name,last_name,gender,linkedin_url,...' }],
      },
    ],
    repairSample: [
      {
        linkedinUsername: 'tsmartin',
        fullName: 'tim martin',
        offset: -1,
        before: {
          linkedin_connections: '85,000-100,000',
          inferred_salary: '23.0',
          summary: "['+18185540756']",
          skills: "['los angeles, california, united states', 'burbank, california, united states']",
        },
        after: {
          linkedin_connections: '',
          inferred_salary: '85,000-100,000',
          summary: 'I am an Army officer with 2 deployments to Iraq.',
          skills: "['operational planning', 'military operations']",
        },
      },
      {
        linkedinUsername: 'shoba-murali-95ab948',
        fullName: 'shoba murali',
        offset: -3,
        before: { inferred_salary: 'new york' },
        after: { inferred_salary: '100,000-150,000' },
      },
    ],
    rows: importRows(),
    rowsOmitted: 0,
    ...overrides,
  };
}

/** The part of a row repair can change. */
export function importOutcome(overrides: Partial<ImportRowOutcome> = {}): ImportRowOutcome {
  return {
    status: 'new',
    scrambled: false,
    realigned: false,
    totalSkills: 12,
    qualityScore: 0.9,
    duplicateRows: 0,
    ...overrides,
  };
}

export function importRow(lineNumber: number, overrides: Partial<ImportRowReport> = {}): ImportRowReport {
  return {
    lineNumber,
    linkedinUsername: 'joeyholland',
    fullName: 'joseph holland',
    jobTitle: 'recruiting manager',
    companyName: 'garver',
    location: 'denton, texas, united states',
    outcome: importOutcome(),
    ...overrides,
  };
}

const REJECTION_LABELS: Record<string, string> = {
  JUNK_LINE: 'Junk line',
  FIELD_COUNT_MISMATCH: 'Wrong number of fields',
  EMBEDDED_HEADER: 'Repeated header row',
};

/** A refused line never became a person, so it carries no identity fields at all. */
export function rejectedRow(lineNumber: number, reason: string, excerpt: string): ImportRowReport {
  return {
    lineNumber,
    outcome: importOutcome({ status: 'rejected', totalSkills: 0, qualityScore: 0 }),
    rejection: { reason, label: REJECTION_LABELS[reason] ?? reason, excerpt },
  };
}

/** A row listing shaped like the reference run. */
export function importRows(count = 12): ImportRowReport[] {
  const statuses: ImportRowStatus[] = ['new', 'updated', 'unchanged'];
  const rows: ImportRowReport[] = [];

  for (let index = 0; index < count; index += 1) {
    rows.push(
      importRow(index + 2, {
        linkedinUsername: `person-${String(index)}`,
        fullName: `person ${String(index)} lastname`,
        jobTitle: index % 2 === 0 ? 'recruiting manager' : 'software engineer',
        companyName: index % 2 === 0 ? 'garver' : 'acme',
        location: index % 2 === 0 ? 'denton, texas, united states' : 'new york',
        outcome: importOutcome({
          status: statuses[index % statuses.length],
          totalSkills: 10 + index,
          qualityScore: (index + 1) / (count + 1),
        }),
      }),
    );
  }

  // The line that kept the person, and the two later lines that folded into it.
  rows[0] = { ...rows[0], outcome: { ...rows[0].outcome, duplicateRows: 2 } };
  rows.push(
    importRow(90, { outcome: importOutcome({ status: 'duplicate', supersededByLine: 2 }) }),
    importRow(91, { outcome: importOutcome({ status: 'duplicate', supersededByLine: 2 }) }),
  );

  // Scrambled as read, realigned once repair is allowed, which is what makes it a new profile.
  rows.push(
    importRow(120, {
      linkedinUsername: 'tsmartin',
      fullName: 'tim martin',
      outcome: importOutcome({ status: 'unchanged', scrambled: true, qualityScore: 0.21 }),
      withRepair: importOutcome({ status: 'new', realigned: true, offset: -1, qualityScore: 0.88 }),
    }),
    // Scrambled beyond what a proven offset can fix, so repair reports nothing different.
    importRow(121, { outcome: importOutcome({ status: 'updated', scrambled: true }) }),
  );

  rows.push(
    rejectedRow(264, 'JUNK_LINE', 'H:\\New folder\\leak\\international\\linkedin\\part-00001'),
    rejectedRow(266, 'FIELD_COUNT_MISMATCH', 'shoba murali,shoba,murali,,linkedin.com/in/shoba-murali-95ab948'),
    rejectedRow(268, 'EMBEDDED_HEADER', 'full_name,first_name,last_name,gender,linkedin_url,linkedin_username'),
  );

  return rows;
}

export function commitResult(overrides: Partial<ImportCommitResult['committed']> = {}): ImportCommitResult {
  return {
    importId: '3f2a9c04-8e1b-4d77-9a20-6c5f1d0b7e42',
    committed: { profilesInserted: 265, profilesUpdated: 0, indexed: 265, indexFailures: [], ...overrides },
  };
}

/** A full profile as the API returns one. */
const EXPERIENCE: SourceEntry[] = [
  {
    company: { name: 'aerotek', industry: 'staffing and recruiting', size: '5001-10000' },
    title: { name: 'recruiter', levels: ['entry'] },
    start_date: '2009-06',
    end_date: '2011-12',
    is_primary: false,
  },
  {
    company: {
      name: 'garver',
      industry: 'civil engineering',
      size: '501-1000',
      location: { name: 'north little rock, arkansas, united states' },
    },
    title: { name: 'recruiting manager', levels: ['manager'] },
    start_date: '2017-03',
    is_primary: true,
    summary: 'Leads technical recruiting for the water and transportation practices.',
  },
  {
    company: { name: 'garver', industry: 'civil engineering' },
    title: { name: 'senior recruiter', levels: ['senior'] },
    start_date: '2012-01',
    end_date: '2017-02',
    is_primary: false,
  },
];

const EDUCATION: SourceEntry[] = [
  {
    school: { name: 'university of north texas', type: 'post-secondary institution' },
    degrees: ['bachelors', 'bachelor of business administration'],
    majors: ['business administration'],
    start_date: '2004',
    end_date: '2008',
  },
];

export function profileDetail(overrides: Partial<ProfileDetail> = {}): ProfileDetail {
  return {
    identity: {
      linkedinUsername: 'joeyholland',
      linkedinUrl: 'linkedin.com/in/joeyholland',
      linkedinId: 148_209_331,
    },
    person: { fullName: 'joseph holland', firstName: 'joseph', lastName: 'holland', gender: 'male' },
    job: {
      title: 'recruiting manager',
      role: 'human_resources',
      industry: 'civil engineering',
      company: { name: 'garver', size: '501-1000', website: 'garverusa.com', industry: 'civil engineering' },
    },
    location: { name: 'denton, texas, united states', locality: 'denton', region: 'texas', country: 'united states' },
    social: { githubUrl: undefined, twitterUrl: undefined },
    metrics: { connections: 1247, salaryBand: '85,000-100,000', yearsExperience: 12 },
    summary: 'Recruiting manager with twelve years in technical staffing.',
    skills: ['recruiting', 'leadership', 'human resources'],
    interests: ['human rights'],
    experience: EXPERIENCE.map((entry) => ({ ...entry })),
    education: EDUCATION.map((entry) => ({ ...entry })),
    certifications: [
      { name: 'professional in human resources', organization: 'hr certification institute', start_date: '2015-06' },
    ],
    languages: [{ name: 'english', proficiency: 'native' }],
    contact: {
      workEmail: 'joseph.holland@garverusa.com',
      emails: [{ address: 'joeyholland@gmail.com', type: 'personal' }],
      phones: ['+19405550143'],
    },
    contentHash: '0f4d2b9a1c7e5836',
    quality: {
      fieldsPopulated: 42,
      fieldsQuarantined: 2,
      score: 0.71,
      repaired: false,
      drifted: false,
    },
    ...overrides,
  };
}
