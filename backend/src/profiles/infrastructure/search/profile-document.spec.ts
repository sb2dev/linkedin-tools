/** The projection is the boundary personal data must not cross. */

import { PII_TARGETS } from 'src/imports/domain/validation/column-catalog';
import { EducationEntry, ExperienceEntry, Profile } from '../../domain/profile';
import {
  ProfileSummarySource,
  toProfileSummary,
} from '../../domain/search/profile-summary';
import { toProfileDocument } from '../../domain/search/profile-document';
import { PROFILE_MAPPING, mappingPropertyAt } from './profile.mapping';

/** The histories reach the domain as Python literals: */
const SOURCE_EXPERIENCE = [
  {
    title: { name: 'senior engineer', role: 'customer_service', levels: ['senior', 'senior'] },
    company: { name: 'analytical engines ltd', size: '51-200', industry: 'computer software' },
    start_date: '2014-03',
    end_date: '2019-01',
    is_primary: false,
    summary: 'a summary the index has no field for',
  },
  'a bare string where an object was declared',
] as unknown as ExperienceEntry[];

const SOURCE_EDUCATION = [
  {
    school: { name: 'university of london', type: 'post-secondary institution' },
    degrees: ['bachelors'],
    majors: ['mathematics'],
    minors: ['philosophy'],
    start_date: '1832',
    end_date: 'sometime in the 1830s',
    gpa: 3.9,
  },
] as unknown as EducationEntry[];

const SKILLS = [
  'analysis',
  'algorithms',
  'mathematics',
  'poetry',
  'logic',
  'notation',
  'teaching',
  'writing',
  'translation',
  'correspondence',
];

function profileWithEveryField(): Profile {
  return {
    identity: {
      linkedinUsername: 'ada-lovelace',
      linkedinUrl: 'https://www.linkedin.com/in/ada-lovelace',
      linkedinId: 4242,
    },
    person: {
      fullName: 'ada lovelace',
      firstName: 'ada',
      lastName: 'lovelace',
      middleName: 'augusta',
      middleInitial: 'a',
      gender: 'female',
      birthYear: 1815,
      birthDate: '1815-12-10',
    },
    job: {
      industry: 'computer software',
      title: 'principal engineer',
      role: 'engineering',
      subRole: 'software',
      levels: ['senior', 'manager'],
      summary: 'the current role summary, which is import detail and not searchable',
      startDate: '2019-04',
      lastUpdated: '2021-08-01',
      company: {
        id: 'babbage-works',
        name: 'babbage works',
        website: 'babbageworks.example',
        size: '201-500',
        founded: 1837,
        industry: 'research',
        linkedinUrl: 'https://www.linkedin.com/company/babbage-works',
        location: {
          country: 'united kingdom',
          region: 'england',
          locality: 'cambridge',
          streetAddress: '3 trumpington street',
        },
      },
    },
    location: {
      name: 'london, england, united kingdom',
      locality: 'london',
      metro: 'greater london',
      region: 'england',
      country: 'united kingdom',
      continent: 'europe',
      geo: { lat: 51.50722, lon: -0.1275 },
      streetAddress: '12 st jamess square',
      postalCode: 'sw1y4lb',
      addressLine2: 'flat 7b',
      lastUpdated: '2021-08-01',
    },
    social: {
      facebookUrl: 'https://facebook.com/ada.enchantress',
      facebookUsername: 'ada.enchantress',
      twitterUrl: 'https://twitter.com/adanotation',
      twitterUsername: 'adanotation',
      githubUrl: 'https://github.com/adanotation',
      githubUsername: 'adanotation',
    },
    metrics: { connections: 930, salaryBand: '100,000-150,000', yearsExperience: 12.5 },
    summary: 'writes about engines that compose more than numbers',
    skills: SKILLS,
    interests: ['music', 'mathematics'],
    locationNames: ['london'],
    regionNames: ['england'],
    countryNames: ['united kingdom'],
    experience: SOURCE_EXPERIENCE,
    education: SOURCE_EDUCATION,
    certifications: [
      { name: 'certified analyst', organization: 'royal society', startDate: '1840' },
    ],
    languages: [{ name: 'english', proficiency: 5 }],
    socialProfiles: [{ network: 'github', username: 'adanotation' }],
    addresses: [
      { street_address: '12 st jamess square', postal_code: 'sw1y4lb', address_line_2: 'flat 7b' },
    ],
    contact: {
      emails: [{ address: 'ada@analyticalengine.example', type: 'personal' }],
      phones: ['+442075550101'],
      workEmail: 'a.lovelace@babbage.example',
      mobilePhone: ['+442075550202'],
    },
    sourceVersion: [{ status: 'ok', current_version: '13.0' }],
    contentHash: 'e3b0c44298fc1c149afbf4c8996fb924',
    quality: {
      fieldsPopulated: 61,
      fieldsQuarantined: 3,
      score: 0.95,
      quarantined: [
        { column: 'inferred_salary', target: 'metrics.salaryBand', reason: 'not a band', rawExcerpt: '930' },
      ],
      repaired: true,
      drifted: false,
    },
  };
}

/** Every scalar reachable from a value: what a leak would look like in the index. */
function leaves(value: unknown): string[] {
  if (Array.isArray(value)) return (value as unknown[]).flatMap(leaves);
  if (typeof value === 'object' && value !== null) {
    return Object.values(value as Record<string, unknown>).flatMap(leaves);
  }
  if (typeof value === 'string') return [value];
  if (typeof value === 'number' || typeof value === 'boolean') return [String(value)];
  return [];
}

/** Dotted paths to every scalar, so a projected field can be looked up in the mapping. */
function documentPaths(value: unknown, prefix = ''): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => documentPaths(item, prefix));
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([key, child]) =>
      documentPaths(child, prefix ? `${prefix}.${key}` : key),
    );
  }
  return prefix ? [prefix] : [];
}

function valueAt(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (typeof current !== 'object' || current === null) return undefined;
    return (current as Record<string, unknown>)[segment];
  }, source);
}

describe('personal data', () => {
  it('populates every field the catalog marks personal, so the assertions below mean something', () => {
    const profile = profileWithEveryField();

    const unpopulated = PII_TARGETS.filter((target) => leaves(valueAt(profile, target)).length === 0);

    expect(unpopulated).toEqual([]);
    expect(PII_TARGETS.length).toBeGreaterThan(0);
  });

  it('projects no value belonging to a field the catalog marks personal', () => {
    const profile = profileWithEveryField();
    const projected = new Set(leaves(toProfileDocument(profile)));

    const leaked = PII_TARGETS.flatMap((target) =>
      leaves(valueAt(profile, target))
        .filter((value) => projected.has(value))
        .map((value) => `${target} = ${value}`),
    );

    expect(leaked).toEqual([]);
  });

  it('does not carry a personal value inside some other field either', () => {
    const profile = profileWithEveryField();
    const serialised = JSON.stringify(toProfileDocument(profile));

    // Short values are skipped: a four-digit year is a substring of half the dates in the corpus.
    const secrets = PII_TARGETS.flatMap((target) => leaves(valueAt(profile, target))).filter(
      (value) => value.length >= 6,
    );
    const embedded = secrets.filter((value) => serialised.includes(value));

    expect(secrets.length).toBeGreaterThan(5);
    expect(embedded).toEqual([]);
  });
});

describe('mapping conformance', () => {
  it('projects only fields the strict mapping declares', () => {
    const document = toProfileDocument(profileWithEveryField());

    const undeclared = [...new Set(documentPaths(document))].filter(
      (path) => mappingPropertyAt(path) === undefined,
    );

    expect(undeclared).toEqual([]);
  });

  it('fills every field the mapping declares, so nothing is mapped but never written', () => {
    const document = toProfileDocument(profileWithEveryField());
    const written = new Set(Object.keys(document));

    const mapped = Object.keys(PROFILE_MAPPING.properties ?? {});

    expect(mapped.filter((field) => !written.has(field))).toEqual([]);
  });

  it('keeps a nested history entry to the keys its nested mapping declares', () => {
    const [experience] = toProfileDocument(profileWithEveryField()).experience ?? [];

    expect(Object.keys(experience)).toEqual([
      'title',
      'role',
      'levels',
      'companyName',
      'companySize',
      'companyIndustry',
      'startDate',
      'endDate',
      'isPrimary',
    ]);
  });
});

describe('source shapes', () => {
  it('reads the snake_case keys the export actually contains', () => {
    const [experience] = toProfileDocument(profileWithEveryField()).experience ?? [];

    expect(experience).toMatchObject({
      title: 'senior engineer',
      companyName: 'analytical engines ltd',
      companySize: '51-200',
      startDate: '2014-03',
      endDate: '2019-01',
      isPrimary: false,
    });
  });

  it('speaks one vocabulary for roles, whichever side of the export they came from', () => {
    const [experience] = toProfileDocument(profileWithEveryField()).experience ?? [];

    expect(experience.role).toBe('customer service');
  });

  it('drops a history entry that arrived as a bare string instead of an object', () => {
    expect(toProfileDocument(profileWithEveryField()).experience).toHaveLength(1);
  });

  it('drops a date the index could not parse rather than leaving it to ignore_malformed', () => {
    const [education] = toProfileDocument(profileWithEveryField()).education ?? [];

    expect(education.startDate).toBe('1832');
    expect(education.endDate).toBeUndefined();
  });

  it('reads a school that arrived as a bare name rather than an object', () => {
    // The export carries both shapes for this key: a nested school object, and just its name.
    const bare = [{ school: 'hocking college', degrees: ['associate'] }] as unknown as EducationEntry[];
    const [education] = toProfileDocument({ ...profileWithEveryField(), education: bare }).education ?? [];

    expect(education.schoolName).toBe('hocking college');
    expect(education.schoolType).toBeUndefined();
  });

  it('deduplicates a repeated value inside a history entry', () => {
    const [experience] = toProfileDocument(profileWithEveryField()).experience ?? [];

    expect(experience.levels).toEqual(['senior']);
  });

  it('omits absent fields entirely, so the indexed source carries only what exists', () => {
    const document = toProfileDocument({
      identity: { linkedinUsername: 'grace', linkedinUrl: 'https://www.linkedin.com/in/grace' },
      person: { fullName: 'grace hopper' },
      contentHash: 'abc',
      quality: {
        fieldsPopulated: 3,
        fieldsQuarantined: 0,
        score: 1,
        quarantined: [],
        repaired: false,
        drifted: false,
      },
    });

    expect(Object.keys(document)).toEqual([
      'linkedinUsername',
      'linkedinUrl',
      'fullName',
      'quality',
      'contentHash',
      'indexedAt',
    ]);
  });
});

describe('summaries', () => {
  function sourceFor(overrides: Partial<ProfileSummarySource> = {}): ProfileSummarySource {
    return {
      linkedinUsername: 'ada-lovelace',
      fullName: 'ada lovelace',
      jobTitle: 'principal engineer',
      skills: SKILLS,
      quality: { score: 0.95, repaired: true },
      ...overrides,
    };
  }

  it('ships a handful of skills but reports how many there really are', () => {
    const summary = toProfileSummary(sourceFor());

    expect(summary.skills).toHaveLength(8);
    expect(summary.totalSkills).toBe(SKILLS.length);
  });

  it('builds a location out of its parts when the source has no assembled name', () => {
    const summary = toProfileSummary(
      sourceFor({ locality: 'london', region: 'england', country: 'united kingdom' }),
    );

    expect(summary.location).toBe('london, england, united kingdom');
  });

  it('prefers the assembled name when there is one', () => {
    const summary = toProfileSummary(sourceFor({ locationName: 'greater london', locality: 'london' }));

    expect(summary.location).toBe('greater london');
  });

  it('reports highlights under the registry field name, not the analysed sub-field', () => {
    const summary = toProfileSummary(sourceFor(), {
      highlights: { 'jobTitle.text': ['principal <em>engineer</em>'], fullName: ['<em>ada</em>'] },
      score: 8.5,
    });

    expect(Object.keys(summary.highlights ?? {}).sort()).toEqual(['fullName', 'jobTitle']);
    expect(summary.score).toBe(8.5);
  });

  it('carries no highlights member when the engine matched on no field', () => {
    const summary = toProfileSummary(sourceFor(), { highlights: {} });

    expect(summary.highlights).toBeUndefined();
    expect('highlights' in summary).toBe(false);
  });

  it('survives a document indexed before a field existed', () => {
    const summary = toProfileSummary({
      linkedinUsername: 'grace',
      fullName: 'grace hopper',
    });

    expect(summary).toMatchObject({ skills: [], totalSkills: 0, qualityScore: 0, repaired: false });
    expect(summary.location).toBeUndefined();
  });
});
