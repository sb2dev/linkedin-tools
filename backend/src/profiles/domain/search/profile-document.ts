/** The projection between the Profile aggregate and the flat document the index holds. */

import { compact, isFilledString } from 'src/shared/objects';
import { Profile } from '../profile';
import { PARTIAL_DATE } from './partial-date';

export interface ExperienceDocument {
  readonly title?: string;
  readonly role?: string;
  readonly levels?: string[];
  readonly companyName?: string;
  readonly companySize?: string;
  readonly companyIndustry?: string;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly isPrimary?: boolean;
}

export interface EducationDocument {
  readonly schoolName?: string;
  readonly schoolType?: string;
  readonly degrees?: string[];
  readonly majors?: string[];
  readonly minors?: string[];
  readonly startDate?: string;
  readonly endDate?: string;
}

export interface CertificationDocument {
  readonly name?: string;
  readonly organization?: string;
}

export interface LanguageDocument {
  readonly name?: string;
}

export interface ProfileDocument {
  readonly linkedinUsername: string;
  readonly linkedinUrl: string;
  readonly fullName: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly gender?: string;
  readonly industry?: string;
  readonly jobTitle?: string;
  readonly jobRole?: string;
  readonly jobSubRole?: string;
  readonly jobLevels?: string[];
  readonly jobStartDate?: string;
  readonly companyName?: string;
  readonly companySize?: string;
  readonly companyIndustry?: string;
  readonly companyFounded?: number;
  readonly companyLocation?: { readonly country?: string; readonly region?: string; readonly locality?: string };
  readonly locationName?: string;
  readonly locality?: string;
  readonly metro?: string;
  readonly region?: string;
  readonly country?: string;
  readonly continent?: string;
  readonly connections?: number;
  readonly salaryBand?: string;
  readonly yearsExperience?: number;
  readonly summary?: string;
  readonly skills?: string[];
  readonly interests?: string[];
  readonly experience?: ExperienceDocument[];
  readonly education?: EducationDocument[];
  readonly certifications?: CertificationDocument[];
  readonly languages?: LanguageDocument[];
  readonly githubUsername?: string;
  readonly twitterUsername?: string;
  readonly facebookUsername?: string;
  readonly quality: {
    readonly score: number;
    readonly populated: number;
    readonly quarantined: number;
    readonly repaired: boolean;
    readonly drifted: boolean;
  };
  readonly contentHash: string;
  readonly indexedAt: string;
}

/** The _source list the search request asks for: a result row needs a dozen fields, not a document. */
export const SUMMARY_SOURCE_FIELDS = [
  'linkedinUsername',
  'fullName',
  'jobTitle',
  'companyName',
  'industry',
  'locationName',
  'locality',
  'region',
  'country',
  'yearsExperience',
  'skills',
  'quality',
] as const;

export function toProfileDocument(profile: Profile, indexedAt: Date = new Date()): ProfileDocument {
  const job = profile.job;
  const company = job?.company;
  const place = profile.location;
  const companyPlace = company?.location;

  return compact({
    linkedinUsername: profile.identity.linkedinUsername,
    linkedinUrl: profile.identity.linkedinUrl,

    fullName: profile.person.fullName,
    firstName: profile.person.firstName,
    lastName: profile.person.lastName,
    gender: profile.person.gender,

    industry: job?.industry,
    jobTitle: job?.title,
    jobRole: job?.role,
    jobSubRole: job?.subRole,
    jobLevels: nonEmpty(job?.levels),
    jobStartDate: asPartialDate(job?.startDate),

    companyName: company?.name,
    companySize: company?.size,
    companyIndustry: company?.industry,
    companyFounded: company?.founded,
    companyLocation: objectOrUndefined({
      country: companyPlace?.country,
      region: companyPlace?.region,
      locality: companyPlace?.locality,
    }),

    locationName: place?.name,
    locality: place?.locality,
    metro: place?.metro,
    region: place?.region,
    country: place?.country,
    continent: place?.continent,

    connections: profile.metrics?.connections,
    salaryBand: profile.metrics?.salaryBand,
    yearsExperience: profile.metrics?.yearsExperience,
    summary: profile.summary,

    skills: nonEmpty(profile.skills),
    interests: nonEmpty(profile.interests),
    experience: nonEmpty(profile.experience?.map(toExperienceDocument)),
    education: nonEmpty(profile.education?.map(toEducationDocument)),
    certifications: nonEmpty(profile.certifications?.map(toCertificationDocument)),
    languages: nonEmpty(profile.languages?.map(toLanguageDocument)),

    githubUsername: profile.social?.githubUsername,
    twitterUsername: profile.social?.twitterUsername,
    facebookUsername: profile.social?.facebookUsername,

    quality: {
      score: profile.quality.score,
      populated: profile.quality.fieldsPopulated,
      quarantined: profile.quality.fieldsQuarantined,
      repaired: profile.quality.repaired,
      drifted: profile.quality.drifted,
    },
    contentHash: profile.contentHash,
    indexedAt: indexedAt.toISOString(),
  });
}

/** A source entry as the export wrote it: keys and value types are whatever the row carried. */
type Loose = Record<string, unknown>;

function loose(value: unknown): Loose {
  return typeof value === 'object' && value !== null ? (value as Loose) : {};
}

function toExperienceDocument(entry: unknown): ExperienceDocument {
  const raw = loose(entry);
  const title = loose(raw.title);
  const company = loose(raw.company);
  return compact({
    title: readText(title, 'name') ?? readText(raw, 'title'),
    role: readRole(title, 'role'),
    levels: readTextList(title, 'levels'),
    companyName: readText(company, 'name') ?? readText(raw, 'company'),
    companySize: readText(company, 'size'),
    companyIndustry: readText(company, 'industry'),
    startDate: readDate(raw, 'startDate', 'start_date'),
    endDate: readDate(raw, 'endDate', 'end_date'),
    isPrimary: readBoolean(raw, 'isPrimary', 'is_primary'),
  });
}

function toEducationDocument(entry: unknown): EducationDocument {
  const raw = loose(entry);
  const school = loose(raw.school);
  return compact({
    schoolName: readText(school, 'name') ?? readText(raw, 'school'),
    schoolType: readText(school, 'type'),
    degrees: readTextList(raw, 'degrees'),
    majors: readTextList(raw, 'majors'),
    minors: readTextList(raw, 'minors'),
    startDate: readDate(raw, 'startDate', 'start_date'),
    endDate: readDate(raw, 'endDate', 'end_date'),
  });
}

function toCertificationDocument(entry: unknown): CertificationDocument {
  const raw = loose(entry);
  return compact({
    name: readText(raw, 'name'),
    organization: readText(raw, 'organization'),
  });
}

function toLanguageDocument(entry: unknown): LanguageDocument {
  const raw = loose(entry);
  return compact({ name: readText(raw, 'name') });
}

function readText(source: Loose, ...keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (isFilledString(value)) return value.trim();
  }
  return undefined;
}

/** Roles arrive underscored inside the histories, de-underscored in the current role. */
function readRole(source: Loose, key: string): string | undefined {
  return readText(source, key)?.replace(/_/g, ' ');
}

function readTextList(source: Loose, ...keys: readonly string[]): string[] | undefined {
  for (const key of keys) {
    const value = source[key];
    if (!Array.isArray(value)) continue;
    const items = unique(value.filter(isFilledString).map((item) => item.trim()));
    if (items.length > 0) return items;
  }
  return undefined;
}

function readDate(source: Loose, ...keys: readonly string[]): string | undefined {
  return asPartialDate(readText(source, ...keys));
}

function readBoolean(source: Loose, ...keys: readonly string[]): boolean | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'boolean') return value;
  }
  return undefined;
}

/** `ignore_malformed` would swallow a bad date silently; dropping it here keeps _source honest. */
function asPartialDate(value: string | undefined): string | undefined {
  return value && PARTIAL_DATE.test(value) ? value : undefined;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function nonEmpty<T>(values: readonly T[] | undefined): T[] | undefined {
  if (!values) return undefined;
  const kept = values.filter((value) => !(isEmptyObject(value) || value === undefined));
  return kept.length > 0 ? kept : undefined;
}

function isEmptyObject(value: unknown): boolean {
  return typeof value === 'object' && value !== null && Object.keys(value).length === 0;
}

function objectOrUndefined<T extends object>(value: T): T | undefined {
  const compacted = compact(value);
  return Object.keys(compacted).length > 0 ? compacted : undefined;
}
