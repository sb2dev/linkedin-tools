/** Which of the two export shapes an upload is, decided by its bytes rather than by its filename. */

/** Enough to step over any plausible run of leading whitespace without decoding a 32 MB upload. */
const SNIFF_CHARS = 64;

/** The byte-order mark counts as blank: it precedes the first real character of a UTF-8 export. */
const BLANK = new Set([' ', '\t', '\n', '\r', '\uFEFF']);

/**
 * True when the first character that is not blank opens a JSON document. A comma-separated export
 * starts with a column name, so the two shapes cannot be confused, and a file named `.csv` that
 * holds JSON still reads as JSON.
 */
export function looksLikeJson(buffer: Buffer): boolean {
  const head = buffer.subarray(0, SNIFF_CHARS).toString('utf8');
  for (const char of head) {
    if (!BLANK.has(char)) return char === '[' || char === '{';
  }
  return false;
}
