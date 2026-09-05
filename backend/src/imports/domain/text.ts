/** Leaf module: dataset-ingestor and profile-row.validator both excerpt raw values this way. */

export function truncate(value: string, limit: number): string {
  const collapsed = value.replace(/\s+/g, ' ').trim();
  return collapsed.length > limit ? `${collapsed.slice(0, limit)}…` : collapsed;
}
