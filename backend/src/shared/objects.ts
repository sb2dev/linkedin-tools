/** Drops keys whose value is undefined, so a projected object carries only what exists. */
export function compact<T extends object>(value: T): T {
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (record[key] === undefined) delete record[key];
  }
  return value;
}

export function isFilledString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
