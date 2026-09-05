/** Turns the flat `f.<key>=<value>` query parameters into the domain's `FilterValue` map. */

import { SEARCH_FIELD_BY_KEY, SearchField } from '../../domain/search/field-registry';
import { PARTIAL_DATE } from '../../domain/search/partial-date';
import { FilterValue } from '../../domain/search/search-criteria';

/** Prefix that marks a query parameter as a filter rather than a search option. */
export const FILTER_PREFIX = 'f.';

/** Separator between the two ends of a `range` or `date_range` filter. */
const RANGE_SEPARATOR = '..';

/** Separator between the selected values of a `terms` filter. */
const VALUE_SEPARATOR = ',';

/** A bound that is a plain decimal number. `1e5`, `0x10` and `Infinity` are rejected as typos. */
const NUMERIC_BOUND = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;

/** Carries the parameter name, so the HTTP layer can report which filter was wrong. */
export class FilterQueryError extends Error {
  constructor(
    readonly parameter: string,
    readonly detail: string,
  ) {
    super(`${parameter}: ${detail}`);
    this.name = 'FilterQueryError';
  }
}

/**
 * @param rawQueryString the query string exactly as it arrived, with or without its leading `?`.
 * @throws FilterQueryError when a parameter names an unknown field or holds an unreadable value.
 */
export function parseFilterQuery(rawQueryString: string): Record<string, FilterValue> {
  const filters: Record<string, FilterValue> = {};

  for (const [key, rawValues] of groupFilterParameters(rawQueryString)) {
    const parameter = FILTER_PREFIX + key;
    const field = SEARCH_FIELD_BY_KEY.get(key);
    if (!field) {
      throw new FilterQueryError(parameter, `Unknown filter field "${key}"`);
    }

    const value = readValue(field, parameter, rawValues);
    if (value) filters[key] = value;
  }

  return filters;
}

/** Still-encoded values, keyed by field. `f.skills=a&f.skills=b` means `f.skills=a,b`. */
function groupFilterParameters(rawQueryString: string): ReadonlyMap<string, string[]> {
  const grouped = new Map<string, string[]>();

  for (const pair of rawQueryString.replace(/^\?/, '').split('&')) {
    if (!pair) continue;

    const separator = pair.indexOf('=');
    const rawName = separator < 0 ? pair : pair.slice(0, separator);
    const name = decodeComponent(rawName, rawName);
    if (!name.startsWith(FILTER_PREFIX)) continue;

    const key = name.slice(FILTER_PREFIX.length);
    const rawValue = separator < 0 ? '' : pair.slice(separator + 1);
    const values = grouped.get(key);
    if (values) values.push(rawValue);
    else grouped.set(key, [rawValue]);
  }

  return grouped;
}

/** Returns undefined when the parameter carries nothing, so an empty box never becomes a filter. */
function readValue(
  field: SearchField,
  parameter: string,
  rawValues: readonly string[],
): FilterValue | undefined {
  switch (field.kind) {
    case 'terms':
    case 'ordered_terms':
      return readTerms(field, parameter, rawValues);
    case 'range':
      return readRange(parameter, lastPresent(rawValues));
    case 'date_range':
      return readDateRange(parameter, lastPresent(rawValues));
    case 'exists':
      return readExists(parameter, lastPresent(rawValues));
  }
}

function readTerms(
  field: SearchField,
  parameter: string,
  rawValues: readonly string[],
): FilterValue | undefined {
  const values: string[] = [];
  const seen = new Set<string>();

  for (const rawValue of rawValues) {
    for (const part of rawValue.split(VALUE_SEPARATOR)) {
      const decoded = decodeComponent(part, parameter).trim();
      if (!decoded) continue;

      const value = field.options ? canonicalOption(field.options, decoded, parameter) : decoded;
      if (seen.has(value)) continue;
      seen.add(value);
      values.push(value);
    }
  }

  return values.length > 0 ? { type: 'terms', values } : undefined;
}

/** Case-insensitive, so a capitalised `CXO` matches the indexed `cxo`; a typo is reported. */
function canonicalOption(
  options: readonly string[],
  value: string,
  parameter: string,
): string {
  const match = options.find((option) => option.toLowerCase() === value.toLowerCase());
  if (match) return match;

  throw new FilterQueryError(
    parameter,
    `"${value}" is not one of: ${options.join(', ')}`,
  );
}

function readRange(parameter: string, rawValue: string | undefined): FilterValue | undefined {
  const ends = splitRange(parameter, rawValue, '5..15');
  if (!ends) return undefined;

  const min = numericBound(parameter, ends.left, 'lower');
  const max = numericBound(parameter, ends.right, 'upper');
  if (min === undefined && max === undefined) return undefined;
  if (min !== undefined && max !== undefined && min > max) {
    throw new FilterQueryError(parameter, `The lower bound ${min} is above the upper bound ${max}`);
  }

  return { type: 'range', min, max };
}

function readDateRange(parameter: string, rawValue: string | undefined): FilterValue | undefined {
  const ends = splitRange(parameter, rawValue, '2000..2010');
  if (!ends) return undefined;

  const from = dateBound(parameter, ends.left, 'lower');
  const to = dateBound(parameter, ends.right, 'upper');
  if (from === undefined && to === undefined) return undefined;
  if (from !== undefined && to !== undefined && from > to) {
    throw new FilterQueryError(parameter, `The lower bound ${from} is after the upper bound ${to}`);
  }

  return { type: 'date_range', from, to };
}

function readExists(parameter: string, rawValue: string | undefined): FilterValue | undefined {
  if (rawValue === undefined) return undefined;

  const value = decodeComponent(rawValue, parameter).trim().toLowerCase();
  if (!value) return undefined;
  if (value === 'true') return { type: 'exists', present: true };
  if (value === 'false') return { type: 'exists', present: false };

  throw new FilterQueryError(parameter, `Expected "true" or "false"; received "${value}"`);
}

function splitRange(
  parameter: string,
  rawValue: string | undefined,
  example: string,
): { left: string; right: string } | undefined {
  if (rawValue === undefined) return undefined;

  const text = decodeComponent(rawValue, parameter).trim();
  if (!text) return undefined;

  const at = text.indexOf(RANGE_SEPARATOR);
  if (at < 0) {
    throw new FilterQueryError(
      parameter,
      `Expected a range like "${example}", with either end optional; received "${text}"`,
    );
  }

  return { left: text.slice(0, at), right: text.slice(at + RANGE_SEPARATOR.length) };
}

function numericBound(parameter: string, raw: string, end: string): number | undefined {
  const text = raw.trim();
  if (!text) return undefined;
  if (!NUMERIC_BOUND.test(text)) {
    throw new FilterQueryError(parameter, `The ${end} bound "${text}" is not a number`);
  }

  return Number(text);
}

function dateBound(parameter: string, raw: string, end: string): string | undefined {
  const text = raw.trim();
  if (!text) return undefined;
  if (!PARTIAL_DATE.test(text)) {
    throw new FilterQueryError(
      parameter,
      `The ${end} bound "${text}" is not a year, year-month or full date`,
    );
  }

  return text;
}

/** The last value a repeated single-valued parameter carried; undefined when every one was blank. */
function lastPresent(rawValues: readonly string[]): string | undefined {
  for (let i = rawValues.length - 1; i >= 0; i -= 1) {
    if (rawValues[i] !== '') return rawValues[i];
  }

  return undefined;
}

/** `+` is a space in a query string, and a malformed escape is a bad request, not a crash. */
function decodeComponent(raw: string, parameter: string): string {
  try {
    return decodeURIComponent(raw.replace(/\+/g, ' '));
  } catch {
    throw new FilterQueryError(parameter, `"${raw}" is not valid percent-encoded text`);
  }
}
