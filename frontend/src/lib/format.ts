import type { FilterValue, Place, SourceEntry } from '@/types/api';

// Text

const ACRONYMS = new Set([
  'ai', 'api', 'aws', 'bsc', 'ceo', 'cfo', 'cio', 'coo', 'crm', 'cto', 'erp', 'hr', 'inc', 'iso', 'it',
  'llc', 'ltd', 'mba', 'ml', 'msc', 'phd', 'php', 'pmp', 'qa', 'sap', 'seo', 'sql', 'uae', 'ui', 'uk',
  'usa', 'ux', 'vp',
]);

const MINOR_WORDS = new Set(['a', 'an', 'and', 'at', 'by', 'de', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'van', 'von', 'with']);

const WORD = /[\p{L}\p{N}&']+/gu;

/** Everything in the dataset is lowercase, so names, titles and companies are cased for display only. */
export function titleCase(value?: string | null): string {
  if (!value) return '';
  return value.toLowerCase().replace(WORD, (word: string, offset: number) => {
    if (ACRONYMS.has(word)) return word.toUpperCase();
    if (offset > 0 && MINOR_WORDS.has(word)) return word;
    return word.charAt(0).toUpperCase() + word.slice(1);
  });
}

export function initials(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter((word) => word.length > 0);
  if (words.length === 0) return '?';
  const first = words[0].charAt(0);
  const last = words.length > 1 ? words[words.length - 1].charAt(0) : '';
  return (first + last).toUpperCase();
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

// Numbers

export function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

export function formatYears(value?: number | null): string | undefined {
  if (value === null || value === undefined || !Number.isFinite(value)) return undefined;
  const rounded = Math.round(value * 10) / 10;
  if (rounded < 1) return 'under a year';
  return `${String(rounded)} ${pluralize(rounded, 'year')}`;
}

/** Salary arrives as one of eleven band strings, never a number: "55,000-70,000" reads as "$55k-70k". */
export function formatSalaryBand(band?: string | null): string | undefined {
  if (!band) return undefined;
  const compact = band.replace(/[\d,]+/g, (match) => {
    const amount = Number(match.replace(/,/g, ''));
    if (!Number.isFinite(amount)) return match;
    return amount >= 1000 ? `${String(Math.round(amount / 1000))}k` : String(amount);
  });
  return compact.replace(/^([<>]?)/, (_match, comparator: string) => `${comparator}$`);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${String(bytes)} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

// Dates

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Source dates are yyyy, yyyy-MM or yyyy-MM-dd, so only the parts that exist are shown. */
export function formatPartialDate(value?: string | null): string | undefined {
  if (!value) return undefined;
  const match = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(value.trim());
  if (!match) return undefined;
  const [, year, month, day] = match;
  if (!month) return year;
  const label = MONTHS[Number(month) - 1] ?? month;
  return day ? `${String(Number(day))} ${label} ${year}` : `${label} ${year}`;
}

export function formatDateRange(start?: string | null, end?: string | null): string | undefined {
  const from = formatPartialDate(start);
  const to = formatPartialDate(end);
  // `to` is present whenever `from` is not, or both are absent and there is nothing to show.
  if (from === undefined) return to === undefined ? undefined : `until ${to}`;
  return `${from} – ${to ?? 'Present'}`;
}

/** How long a role or a course ran, as "2 yrs 6 mos". */
export function formatDuration(start?: string | null, end?: string | null, now = new Date()): string | undefined {
  const from = monthsSinceEpoch(start);
  if (from === undefined) return undefined;
  const to = monthsSinceEpoch(end) ?? now.getUTCFullYear() * 12 + now.getUTCMonth();

  // Inclusive of both ends, which is how a profile counts a single-month role as one month.
  const months = Math.max(0, to - from) + 1;
  const years = Math.floor(months / 12);
  const rest = months % 12;

  // months is at least 1, so one of the two is always non-zero and there is no empty case.
  const parts: string[] = [];
  if (years > 0) parts.push(`${String(years)} yr${years === 1 ? '' : 's'}`);
  if (rest > 0) parts.push(`${String(rest)} mo${rest === 1 ? '' : 's'}`);
  return parts.join(' ');
}

/** Months since year zero, so two partial dates can be subtracted without a Date for each. */
function monthsSinceEpoch(value?: string | null): number | undefined {
  if (value === undefined || value === null) return undefined;
  const match = /^(\d{4})(?:-(\d{2}))?/.exec(value.trim());
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = match[2] === undefined ? 0 : Number(match[2]) - 1;
  return year * 12 + month;
}

// Places

export function joinParts(parts: (string | undefined)[], separator = ', '): string {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const part of parts) {
    const value = part?.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(value);
  }
  return kept.join(separator);
}

export function formatLocation(place?: Place | null): string {
  if (!place) return '';
  const joined = joinParts([place.locality, place.region, place.country].map((part) => titleCase(part)));
  return joined.length > 0 ? joined : titleCase(place.name);
}

// Highlights

export interface HighlightPart {
  text: string;
  match: boolean;
}

const HIGHLIGHT_TAG = /<em>([\s\S]*?)<\/em>/g;

/** Fragments arrive as markup; splitting them into plain parts keeps dataset text out of the DOM. */
export function splitHighlight(fragment: string): HighlightPart[] {
  const parts: HighlightPart[] = [];
  let cursor = 0;
  for (const found of fragment.matchAll(HIGHLIGHT_TAG)) {
    const index = found.index;
    if (index > cursor) parts.push({ text: fragment.slice(cursor, index), match: false });
    parts.push({ text: found[1], match: true });
    cursor = index + found[0].length;
  }
  if (cursor < fragment.length) parts.push({ text: fragment.slice(cursor), match: false });
  return parts;
}

// Source entries

function asRecord(value: unknown): SourceEntry | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as SourceEntry) : undefined;
}

function asDisplayText(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

/** Reads the first key that carries text: the export mixes snake_case and camelCase spellings. */
function pickText(entry: SourceEntry | undefined, keys: string[]): string | undefined {
  if (!entry) return undefined;
  for (const key of keys) {
    const found = asDisplayText(entry[key]);
    if (found !== undefined) return found;
  }
  return undefined;
}

function pickList(entry: SourceEntry | undefined, keys: string[]): string[] {
  if (!entry) return [];
  for (const key of keys) {
    const value = entry[key];
    if (Array.isArray(value)) {
      const items = value.map(asDisplayText).filter((item): item is string => item !== undefined);
      if (items.length > 0) return items;
    }
    const single = asDisplayText(value);
    if (single !== undefined) return [single];
  }
  return [];
}

export interface ExperienceView {
  title?: string;
  company?: string;
  companyIndustry?: string;
  companySize?: string;
  location?: string;
  start?: string;
  end?: string;
  summary?: string;
  levels: string[];
  isPrimary: boolean;
}

export function readExperience(entry: SourceEntry): ExperienceView {
  const company = asRecord(entry.company);
  const title = asRecord(entry.title);
  return {
    title: titleCase(pickText(title, ['name', 'title']) ?? pickText(entry, ['title_name'])) || undefined,
    company: titleCase(pickText(company, ['name']) ?? pickText(entry, ['company_name'])) || undefined,
    companyIndustry: titleCase(pickText(company, ['industry'])) || undefined,
    companySize: pickText(company, ['size']),
    location: titleCase(pickText(asRecord(company?.location), ['name', 'locality'])) || undefined,
    start: pickText(entry, ['start_date', 'startDate']),
    end: pickText(entry, ['end_date', 'endDate']),
    summary: pickText(entry, ['summary']),
    levels: pickList(title, ['levels']).map((level) => titleCase(level)),
    isPrimary: entry.is_primary === true || entry.isPrimary === true,
  };
}

export interface EducationView {
  school?: string;
  schoolType?: string;
  degrees: string[];
  majors: string[];
  minors: string[];
  gpa?: string;
  start?: string;
  end?: string;
}

export function readEducation(entry: SourceEntry): EducationView {
  const school = asRecord(entry.school);
  return {
    school: titleCase(pickText(school, ['name']) ?? pickText(entry, ['school_name'])) || undefined,
    schoolType: titleCase(pickText(school, ['type'])) || undefined,
    degrees: pickList(entry, ['degrees', 'degree']).map((value) => titleCase(value)),
    majors: pickList(entry, ['majors', 'major']).map((value) => titleCase(value)),
    minors: pickList(entry, ['minors', 'minor']).map((value) => titleCase(value)),
    gpa: pickText(entry, ['gpa']),
    start: pickText(entry, ['start_date', 'startDate']),
    end: pickText(entry, ['end_date', 'endDate']),
  };
}

export interface CertificationView {
  name?: string;
  organization?: string;
  start?: string;
  end?: string;
}

export function readCertification(entry: SourceEntry): CertificationView {
  return {
    name: titleCase(pickText(entry, ['name'])) || undefined,
    organization: titleCase(pickText(entry, ['organization', 'organisation'])) || undefined,
    start: pickText(entry, ['start_date', 'startDate']),
    end: pickText(entry, ['end_date', 'endDate']),
  };
}

export interface LanguageView {
  name?: string;
  proficiency?: string;
}

export function readLanguage(entry: SourceEntry): LanguageView {
  return {
    name: titleCase(pickText(entry, ['name', 'language'])) || undefined,
    proficiency: pickText(entry, ['proficiency', 'level']),
  };
}

// Filters

/** Shared by the filter chips and the empty state. */
export function formatFilterValue(value: FilterValue): string {
  switch (value.type) {
    case 'terms':
      return value.values.map((entry) => titleCase(entry)).join(', ');
    case 'range': {
      if (value.min !== undefined && value.max !== undefined) return `${String(value.min)} – ${String(value.max)}`;
      if (value.min !== undefined) return `${String(value.min)} or more`;
      if (value.max !== undefined) return `up to ${String(value.max)}`;
      return 'any';
    }
    case 'date_range': {
      if (value.from !== undefined && value.to !== undefined) return `${value.from} – ${value.to}`;
      if (value.from !== undefined) return `from ${value.from}`;
      if (value.to !== undefined) return `until ${value.to}`;
      return 'any';
    }
    case 'exists':
      return value.present ? 'present' : 'absent';
  }
}

/** The API sends the score as a fraction of the expected fields, 0 to 1. */
export function qualityFraction(score: number): number {
  return Number.isFinite(score) ? score : 0;
}

export function formatQualityScore(score: number): string {
  return `${String(Math.round(qualityFraction(score) * 100))}%`;
}

/** The source stores URLs without a scheme, as `linkedin.com/in/someone`. */
export function absoluteUrl(href: string): string {
  return /^https?:\/\//i.test(href) ? href : `https://${href.replace(/^\/+/, '')}`;
}
