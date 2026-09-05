/** Coercions that check a raw cell against the shape its column declares, quarantining misfits. */

import { parsePythonLiteral, PythonLiteralSyntaxError, PythonValue } from '../parsing/python-literal.parser';

/** The three closed vocabularies are declared once, in the search field registry. */
export {
  COMPANY_SIZE_ORDER as COMPANY_SIZES,
  SALARY_BAND_ORDER as SALARY_BANDS,
  SENIORITY_ORDER as SENIORITY_LEVELS,
} from '../../../profiles/domain/search/field-registry';

export type Coerced<T> = { ok: true; value: T } | { ok: false; reason: string };

const good = <T>(value: T): Coerced<T> => ({ ok: true, value });
const bad = (reason: string): Coerced<never> => ({ ok: false, reason });

/** The only two values the source uses. Anything else in this column is another column's value. */
export const GENDERS = ['male', 'female'] as const;

/** Capture group is the slug. row-classification shares both, using only `.test()`. */
export const LINKEDIN_PROFILE_URL = /^(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/([A-Za-z0-9\-_%.]+)\/?$/i;
export const NAME_SHAPED = /^[\p{L}][\p{L}\p{M}\s'’.\-,()&/]*$/u;
const GEO_POINT = /^(-?\d{1,3}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)$/;
const EMAIL = /^[^\s@,]+@[^\s@,]+\.[A-Za-z]{2,}$/;
/** Not E.164: the export writes phone numbers with the spacing and punctuation it was given. */
const PHONE_SHAPED = /^\+?[0-9][0-9\-\s().]{6,20}$/;
const YEAR = /^(1[89]\d{2}|20\d{2})$/;
const ISO_DATE = /^(1[89]\d{2}|20\d{2})(-\d{2})?(-\d{2})?$/;
const HOSTNAME = /^(?:https?:\/\/)?(?:www\.)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9-]+)+(?:\/\S*)?$/i;

/** Rejects only values that are unmistakably structured data from another column. */
export function asText(raw: string): Coerced<string> {
  const v = raw.trim();
  if (!v) return bad('empty');
  if (v.startsWith('[') || v.startsWith('{')) return bad('structured value in a text column');
  if (LINKEDIN_PROFILE_URL.test(v)) return bad('url in a text column');
  if (ISO_DATE.test(v) && v.length > 4) return bad('date in a text column');
  return good(v);
}

/** A social handle. */
export function asHandle(pattern: RegExp) {
  return (raw: string): Coerced<string> => {
    const v = raw.trim().replace(/^@/, '');
    if (!v) return bad('empty');
    return pattern.test(v) ? good(v) : bad('not a valid handle for this network');
  };
}

export const TWITTER_HANDLE = /^[A-Za-z0-9_]{1,15}$/;
export const GITHUB_HANDLE = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
export const FACEBOOK_HANDLE = /^[A-Za-z0-9.]{5,50}$/;

/** Letters, spaces and the usual punctuation; never a URL, date or number. */
export function asName(raw: string): Coerced<string> {
  const v = raw.trim();
  if (!v) return bad('empty');
  if (!NAME_SHAPED.test(v)) return bad('not a name-shaped value');
  if (v.length > 200) return bad('implausibly long for a name');
  return good(v);
}

export function asLinkedInUrl(raw: string): Coerced<string> {
  const v = raw.trim();
  const m = LINKEDIN_PROFILE_URL.exec(v);
  return m ? good(`linkedin.com/in/${m[1]}`) : bad('not a linkedin.com/in/ profile URL');
}

/** The stable business key: the slug of a LinkedIn profile URL. */
export function asLinkedInUsername(raw: string): Coerced<string> {
  const v = raw.trim();
  if (!v) return bad('empty');
  const fromUrl = LINKEDIN_PROFILE_URL.exec(v);
  if (fromUrl) return good(fromUrl[1].toLowerCase());
  if (/^[A-Za-z0-9\-_%.]{3,120}$/.test(v)) return good(v.toLowerCase());
  return bad('not a linkedin username');
}

export function asHostUrl(host: string) {
  return (raw: string): Coerced<string> => {
    const v = raw.trim().toLowerCase();
    if (!v) return bad('empty');
    if (!HOSTNAME.test(v)) return bad('not a URL');

    // Matched against the host alone. A substring test would take `notfacebook.com/x` and
    // `evil.com/facebook.com` for facebook URLs, which is the drift this column exists to catch.
    const withoutScheme = v.replace(/^https?:\/\//, '');
    const hostname = withoutScheme.split('/')[0].replace(/^www\./, '');
    if (hostname !== host && !hostname.endsWith(`.${host}`)) return bad(`not a ${host} URL`);
    return good(withoutScheme);
  };
}

export function asWebsite(raw: string): Coerced<string> {
  const v = raw.trim().toLowerCase();
  if (!v) return bad('empty');
  if (!HOSTNAME.test(v)) return bad('not a URL');
  return good(v.replace(/^https?:\/\//, ''));
}

export function asInteger(raw: string): Coerced<number> {
  const v = raw.trim();
  if (!v) return bad('empty');
  if (!/^-?\d+(\.0+)?$/.test(v)) return bad('not an integer');
  const n = Number.parseFloat(v);
  return Number.isSafeInteger(n) ? good(n) : bad('integer out of range');
}

function asFloat(raw: string): Coerced<number> {
  const v = raw.trim();
  if (!v) return bad('empty');
  if (!/^-?\d+(\.\d+)?$/.test(v)) return bad('not a number');
  return good(Number.parseFloat(v));
}

/** Bounded integer, for columns where an out-of-range value means column drift. */
export function asBoundedInteger(min: number, max: number) {
  return (raw: string): Coerced<number> => {
    const r = asInteger(raw);
    if (!r.ok) return r;
    return r.value >= min && r.value <= max ? r : bad(`outside the plausible range ${min}..${max}`);
  };
}

/** Bounded number, for columns where an out-of-range value means column drift. */
export function asBoundedFloat(min: number, max: number) {
  return (raw: string): Coerced<number> => {
    const r = asFloat(raw);
    if (!r.ok) return r;
    return r.value >= min && r.value <= max ? r : bad(`outside the plausible range ${min}..${max}`);
  };
}

export function asYear(raw: string): Coerced<number> {
  const v = raw.trim();
  return YEAR.test(v) ? good(Number.parseInt(v, 10)) : bad('not a plausible year');
}

/** A partial ISO date: `yyyy`, `yyyy-MM` or `yyyy-MM-dd`, all of which occur in the source. */
export function asPartialDate(raw: string): Coerced<string> {
  const v = raw.trim();
  if (!ISO_DATE.test(v)) return bad('not an ISO date');
  const [, mm, dd] = /^\d{4}(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(v)!;
  if (mm && (Number(mm) < 1 || Number(mm) > 12)) return bad('month out of range');
  if (dd && (Number(dd) < 1 || Number(dd) > 31)) return bad('day out of range');
  return good(v);
}

export function asGeoPoint(raw: string): Coerced<{ lat: number; lon: number }> {
  const m = GEO_POINT.exec(raw.trim());
  if (!m) return bad('not a "lat,lon" pair');
  const lat = Number.parseFloat(m[1]);
  const lon = Number.parseFloat(m[2]);
  if (lat < -90 || lat > 90) return bad('latitude out of range');
  if (lon < -180 || lon > 180) return bad('longitude out of range');
  return good({ lat, lon });
}

export function asOneOf<T extends string>(allowed: readonly T[]) {
  return (raw: string): Coerced<T> => {
    const v = raw.trim().toLowerCase() as T;
    return allowed.includes(v) ? good(v) : bad(`not one of: ${allowed.join(', ')}`);
  };
}

export function asEmail(raw: string): Coerced<string> {
  const v = raw.trim().toLowerCase();
  return EMAIL.test(v) ? good(v) : bad('not an email address');
}

/** A Python list whose every element is a non-empty string. */
export function asStringList(raw: string): Coerced<string[]> {
  const parsed = parseLiteral(raw);
  if (!parsed.ok) return parsed;
  if (!Array.isArray(parsed.value)) return bad('not a list');
  const out: string[] = [];
  for (const item of parsed.value) {
    if (typeof item !== 'string') return bad('list contains a non-string element');
    const v = item.trim();
    if (v) out.push(v);
  }
  return good(dedupe(out));
}

/** A Python list of objects, each of which must satisfy `hasShape`. */
export function asObjectList(hasShape: (item: Record<string, PythonValue>) => boolean) {
  return (raw: string): Coerced<Record<string, PythonValue>[]> => {
    const parsed = parseLiteral(raw);
    if (!parsed.ok) return parsed;
    if (!Array.isArray(parsed.value)) return bad('not a list');
    const out: Record<string, PythonValue>[] = [];
    for (const item of parsed.value) {
      if (item === null || typeof item !== 'object' || Array.isArray(item)) {
        return bad('list contains a non-object element');
      }
      const record = item as Record<string, PythonValue>;
      if (!hasShape(record)) return bad('object does not have the expected keys');
      out.push(record);
    }
    return good(out);
  };
}

export function asPhoneList(raw: string): Coerced<string[]> {
  const parsed = asStringList(raw);
  if (!parsed.ok) return parsed;
  const phones = parsed.value.filter((p) => PHONE_SHAPED.test(p));
  return phones.length ? good(phones) : bad('no plausible phone numbers');
}

export function asEmailList(raw: string): Coerced<{ address: string; type?: string }[]> {
  const parsed = asObjectList((o) => typeof o.address === 'string')(raw);
  if (!parsed.ok) return parsed;
  const emails = parsed.value
    .map((o) => ({
      address: (o.address as string).trim().toLowerCase(),
      type: typeof o.type === 'string' ? o.type : undefined,
    }))
    .filter((e) => EMAIL.test(e.address));
  return emails.length ? good(emails) : bad('no valid email addresses');
}

/** At least one of `keys` must be present; a drifted object carries none of them. */
export const hasAnyKey =
  (...keys: string[]) =>
  (item: Record<string, PythonValue>): boolean =>
    // Own keys only: `in` would also answer for anything inherited from Object.prototype.
    keys.some((k) => Object.hasOwn(item, k));

function parseLiteral(raw: string): Coerced<PythonValue> {
  const v = raw.trim();
  if (!v) return bad('empty');
  if (!'[{('.includes(v[0])) return bad('not a Python literal');
  try {
    return good(parsePythonLiteral(v));
  } catch (error) {
    // The only throw reachable from here is the parser's own syntax error.
    return bad((error as PythonLiteralSyntaxError).message);
  }
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}
