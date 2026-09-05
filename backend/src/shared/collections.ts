/** Splits a list into fixed-size batches. Callers size the batch to a driver limit. */
export function chunk<T>(values: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let offset = 0; offset < values.length; offset += size) {
    batches.push(values.slice(offset, offset + size));
  }
  return batches;
}
