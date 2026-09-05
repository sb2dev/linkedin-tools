/** The 77 source columns, each mapped to a canonical field and the shape it must have. */

import {
  Coerced,
  COMPANY_SIZES,
  GENDERS,
  SALARY_BANDS,
  SENIORITY_LEVELS,
  asBoundedFloat,
  asBoundedInteger,
  asEmail,
  asEmailList,
  asGeoPoint,
  asHostUrl,
  asInteger,
  asLinkedInUrl,
  asHandle,
  asLinkedInUsername,
  asName,
  asObjectList,
  asOneOf,
  asPartialDate,
  asPhoneList,
  asStringList,
  asText,
  FACEBOOK_HANDLE,
  GITHUB_HANDLE,
  TWITTER_HANDLE,
  asWebsite,
  asYear,
  hasAnyKey,
} from './value-kinds';

export interface ColumnSpec {
  /** Header name in the source export, and the key a JSON record carries it under. */
  readonly source: string;
  /** Dot-path of the field on the canonical profile. */
  readonly target: string;
  readonly coerce: (raw: string) => Coerced<unknown>;
  /** Personal data: persisted in PostgreSQL, never indexed in Elasticsearch. */
  readonly pii?: boolean;
}

const CONTINENTS = ['africa', 'asia', 'europe', 'north america', 'south america', 'oceania', 'antarctica'] as const;

/** A place name, for every locality / region / metro / country column. */
const place = asName;

export const COLUMN_CATALOG: readonly ColumnSpec[] = [
  // Identity
  { source: 'linkedin_url', target: 'identity.linkedinUrl', coerce: asLinkedInUrl },
  { source: 'linkedin_username', target: 'identity.linkedinUsername', coerce: asLinkedInUsername },
  { source: 'linkedin_id', target: 'identity.linkedinId', coerce: asInteger },

  // Person
  { source: 'full_name', target: 'person.fullName', coerce: asName },
  { source: 'first_name', target: 'person.firstName', coerce: asName },
  { source: 'last_name', target: 'person.lastName', coerce: asName },
  { source: 'middle_name', target: 'person.middleName', coerce: asName },
  { source: 'middle_initial', target: 'person.middleInitial', coerce: asName },
  { source: 'gender', target: 'person.gender', coerce: asOneOf(GENDERS) },
  { source: 'birth_year', target: 'person.birthYear', coerce: asYear, pii: true },
  { source: 'birth_date', target: 'person.birthDate', coerce: asPartialDate, pii: true },

  // Social handles
  { source: 'facebook_url', target: 'social.facebookUrl', coerce: asHostUrl('facebook.com') },
  { source: 'facebook_username', target: 'social.facebookUsername', coerce: asHandle(FACEBOOK_HANDLE) },
  { source: 'facebook_id', target: 'social.facebookId', coerce: asInteger },
  { source: 'twitter_url', target: 'social.twitterUrl', coerce: asHostUrl('twitter.com') },
  { source: 'twitter_username', target: 'social.twitterUsername', coerce: asHandle(TWITTER_HANDLE) },
  { source: 'github_url', target: 'social.githubUrl', coerce: asHostUrl('github.com') },
  { source: 'github_username', target: 'social.githubUsername', coerce: asHandle(GITHUB_HANDLE) },

  // Current role
  { source: 'industry', target: 'job.industry', coerce: asName },
  { source: 'job_title', target: 'job.title', coerce: asName },
  { source: 'job_title_role', target: 'job.role', coerce: (v) => asName(v.replace(/_/g, ' ')) },
  { source: 'job_title_sub_role', target: 'job.subRole', coerce: (v) => asName(v.replace(/_/g, ' ')) },
  { source: 'job_title_levels', target: 'job.levels', coerce: filteredStringList(SENIORITY_LEVELS) },
  { source: 'job_summary', target: 'job.summary', coerce: asText },
  { source: 'job_start_date', target: 'job.startDate', coerce: asPartialDate },
  { source: 'job_last_updated', target: 'job.lastUpdated', coerce: asPartialDate },

  // Current employer
  { source: 'job_company_id', target: 'job.company.id', coerce: asText },
  { source: 'job_company_name', target: 'job.company.name', coerce: asName },
  { source: 'job_company_website', target: 'job.company.website', coerce: asWebsite },
  { source: 'job_company_size', target: 'job.company.size', coerce: asOneOf(COMPANY_SIZES) },
  { source: 'job_company_founded', target: 'job.company.founded', coerce: asYear },
  { source: 'job_company_industry', target: 'job.company.industry', coerce: asName },
  { source: 'job_company_linkedin_url', target: 'job.company.linkedinUrl', coerce: asHostUrl('linkedin.com') },
  { source: 'job_company_linkedin_id', target: 'job.company.linkedinId', coerce: asInteger },
  { source: 'job_company_facebook_url', target: 'job.company.facebookUrl', coerce: asHostUrl('facebook.com') },
  { source: 'job_company_twitter_url', target: 'job.company.twitterUrl', coerce: asHostUrl('twitter.com') },
  { source: 'job_company_location_name', target: 'job.company.location.name', coerce: place },
  { source: 'job_company_location_locality', target: 'job.company.location.locality', coerce: place },
  { source: 'job_company_location_metro', target: 'job.company.location.metro', coerce: place },
  { source: 'job_company_location_region', target: 'job.company.location.region', coerce: place },
  { source: 'job_company_location_country', target: 'job.company.location.country', coerce: place },
  { source: 'job_company_location_continent', target: 'job.company.location.continent', coerce: asOneOf(CONTINENTS) },
  { source: 'job_company_location_geo', target: 'job.company.location.geo', coerce: asGeoPoint },
  { source: 'job_company_location_street_address', target: 'job.company.location.streetAddress', coerce: asText },
  { source: 'job_company_location_postal_code', target: 'job.company.location.postalCode', coerce: asText },
  { source: 'job_company_location_address_line_2', target: 'job.company.location.addressLine2', coerce: asText },

  // Location
  { source: 'location_name', target: 'location.name', coerce: place },
  { source: 'location_locality', target: 'location.locality', coerce: place },
  { source: 'location_metro', target: 'location.metro', coerce: place },
  { source: 'location_region', target: 'location.region', coerce: place },
  { source: 'location_country', target: 'location.country', coerce: place },
  { source: 'location_continent', target: 'location.continent', coerce: asOneOf(CONTINENTS) },
  { source: 'location_geo', target: 'location.geo', coerce: asGeoPoint, pii: true },
  { source: 'location_last_updated', target: 'location.lastUpdated', coerce: asPartialDate },
  { source: 'location_street_address', target: 'location.streetAddress', coerce: asText, pii: true },
  { source: 'location_postal_code', target: 'location.postalCode', coerce: asText, pii: true },
  { source: 'location_address_line_2', target: 'location.addressLine2', coerce: asText, pii: true },

  { source: 'linkedin_connections', target: 'metrics.connections', coerce: asBoundedInteger(0, 100_000) },
  { source: 'inferred_salary', target: 'metrics.salaryBand', coerce: asOneOf(SALARY_BANDS) },
  { source: 'inferred_years_experience', target: 'metrics.yearsExperience', coerce: asBoundedFloat(0, 70) },

  // Free text and lists
  { source: 'summary', target: 'summary', coerce: asText },
  { source: 'skills', target: 'skills', coerce: asStringList },
  { source: 'interests', target: 'interests', coerce: asStringList },
  { source: 'location_names', target: 'locationNames', coerce: asStringList },
  { source: 'regions', target: 'regionNames', coerce: asStringList },
  { source: 'countries', target: 'countryNames', coerce: asStringList },

  // Nested histories
  { source: 'experience', target: 'experience', coerce: asObjectList(hasAnyKey('company', 'title')) },
  { source: 'education', target: 'education', coerce: asObjectList(hasAnyKey('school', 'degrees', 'majors')) },
  { source: 'certifications', target: 'certifications', coerce: asObjectList(hasAnyKey('name', 'organization')) },
  { source: 'languages', target: 'languages', coerce: asObjectList(hasAnyKey('name', 'proficiency')) },
  { source: 'profiles', target: 'socialProfiles', coerce: asObjectList(hasAnyKey('network', 'url', 'username')) },
  { source: 'street_addresses', target: 'addresses', coerce: asObjectList(hasAnyKey('street_address', 'locality', 'name')), pii: true },

  // Contact (personal data)
  { source: 'emails', target: 'contact.emails', coerce: asEmailList, pii: true },
  { source: 'phone_numbers', target: 'contact.phones', coerce: asPhoneList, pii: true },
  { source: 'work_email', target: 'contact.workEmail', coerce: asEmail, pii: true },
  { source: 'mobile_phone', target: 'contact.mobilePhone', coerce: (v) => asPhoneList(`['${v.trim()}']`), pii: true },

  // Provenance
  { source: 'version_status', target: 'sourceVersion', coerce: asObjectList(hasAnyKey('status', 'current_version')) },
];

/** A string list narrowed to a known vocabulary; drifted values simply drop out. */
function filteredStringList(allowed: readonly string[]) {
  return (raw: string): Coerced<string[]> => {
    const parsed = asStringList(raw);
    if (!parsed.ok) return parsed;
    const kept = parsed.value.map((v) => v.toLowerCase()).filter((v) => allowed.includes(v));
    return kept.length ? { ok: true, value: kept } : { ok: false, reason: `no value in: ${allowed.join(', ')}` };
  };
}

export const COLUMN_SPEC_BY_SOURCE: ReadonlyMap<string, ColumnSpec> = new Map(
  COLUMN_CATALOG.map((spec) => [spec.source, spec]),
);

/** Canonical field paths that must never reach Elasticsearch. */
export const PII_TARGETS: readonly string[] = COLUMN_CATALOG.filter((c) => c.pii).map((c) => c.target);

/** Columns whose content proves the row's multi-value block has shifted. */
export const SCRAMBLE_ANCHORS: ReadonlySet<string> = new Set([
  'profiles',         // 0% false positives, detects 100%
  'street_addresses', // 0% / 100%
  'regions',          // 0% / 100%
  'countries',        // 0% /  97%
  'location_names',   // 0% /  69%
]);

/** Columns no longer trusted once an anchor fires. */
export const MULTI_VALUE_BLOCK: ReadonlySet<string> = new Set([
  'interests',
  'skills',
  'location_names',
  'regions',
  'countries',
  'street_addresses',
  'experience',
  'education',
  'profiles',
  'certifications',
  'languages',
]);
