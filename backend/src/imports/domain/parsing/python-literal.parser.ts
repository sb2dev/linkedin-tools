/** Recursive-descent parser for the `repr()` output in fourteen columns of the export. */

export type PythonValue =
  | string
  | number
  | boolean
  | null
  | PythonValue[]
  | { [key: string]: PythonValue };

export class PythonLiteralSyntaxError extends Error {
  constructor(
    message: string,
    readonly position: number,
  ) {
    super(`${message} (at offset ${position})`);
    this.name = 'PythonLiteralSyntaxError';
  }
}

const MAX_DEPTH = 32;

class Reader {
  pos = 0;
  constructor(readonly src: string) {}

  get eof(): boolean {
    return this.pos >= this.src.length;
  }

  peek(): string {
    return this.src[this.pos] ?? '';
  }

  skipWhitespace(): void {
    while (!this.eof && /\s/.test(this.src[this.pos])) this.pos++;
  }

  expect(char: string): void {
    if (this.peek() !== char) {
      throw new PythonLiteralSyntaxError(`expected '${char}' but found '${this.peek() || 'EOF'}'`, this.pos);
    }
    this.pos++;
  }

  /** True when `word` follows and is not glued to another identifier character. */
  lookaheadWord(word: string): boolean {
    if (this.src.startsWith(word, this.pos)) {
      const after = this.src[this.pos + word.length];
      return after === undefined || !/[A-Za-z0-9_]/.test(after);
    }
    return false;
  }
}

const ESCAPES: Record<string, string> = {
  n: '\n',
  t: '\t',
  r: '\r',
  b: '\b',
  f: '\f',
  v: '\v',
  '0': '\0',
  '\\': '\\',
  "'": "'",
  '"': '"',
};

function parseString(r: Reader): string {
  const quote = r.peek();
  r.pos++;
  let out = '';
  while (true) {
    if (r.eof) throw new PythonLiteralSyntaxError('unterminated string', r.pos);
    const ch = r.src[r.pos];

    if (ch === '\\') {
      const next = r.src[r.pos + 1];
      if (next === undefined) throw new PythonLiteralSyntaxError('dangling escape', r.pos);
      if (next === 'x') {
        const hex = r.src.slice(r.pos + 2, r.pos + 4);
        if (/^[0-9a-fA-F]{2}$/.test(hex)) {
          out += String.fromCharCode(parseInt(hex, 16));
          r.pos += 4;
          continue;
        }
      }
      if (next === 'u') {
        const hex = r.src.slice(r.pos + 2, r.pos + 6);
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          out += String.fromCharCode(parseInt(hex, 16));
          r.pos += 6;
          continue;
        }
      }
      // Unknown escapes are kept verbatim, which is what Python does for e.g. "\d".
      out += ESCAPES[next] ?? `\\${next}`;
      r.pos += 2;
      continue;
    }

    if (ch === quote) {
      r.pos++;
      return out;
    }

    out += ch;
    r.pos++;
  }
}

const NUMBER_RE = /^[+-]?(\d+\.?\d*([eE][+-]?\d+)?|\.\d+([eE][+-]?\d+)?)/;

function parseNumber(r: Reader): number {
  const match = NUMBER_RE.exec(r.src.slice(r.pos));
  if (!match) throw new PythonLiteralSyntaxError('malformed number', r.pos);
  r.pos += match[0].length;
  return Number(match[0]);
}

function parseValue(r: Reader, depth: number): PythonValue {
  if (depth > MAX_DEPTH) throw new PythonLiteralSyntaxError('nesting too deep', r.pos);
  r.skipWhitespace();
  if (r.eof) throw new PythonLiteralSyntaxError('unexpected end of input', r.pos);

  const ch = r.peek();

  if (ch === '[') return parseSequence(r, depth, '[', ']');
  if (ch === '(') return parseSequence(r, depth, '(', ')');
  if (ch === '{') return parseDict(r, depth);
  if (ch === "'" || ch === '"') return parseString(r);
  if (r.lookaheadWord('None')) return (r.pos += 4), null;
  if (r.lookaheadWord('True')) return (r.pos += 4), true;
  if (r.lookaheadWord('False')) return (r.pos += 5), false;
  if (r.lookaheadWord('nan') || r.lookaheadWord('NaN')) return (r.pos += 3), null;
  if (/[+-.\d]/.test(ch)) return parseNumber(r);

  throw new PythonLiteralSyntaxError(`unexpected character '${ch}'`, r.pos);
}

function parseSequence(r: Reader, depth: number, open: string, close: string): PythonValue[] {
  r.expect(open);
  const items: PythonValue[] = [];
  r.skipWhitespace();
  if (r.peek() === close) return r.pos++, items;

  while (true) {
    items.push(parseValue(r, depth + 1));
    r.skipWhitespace();
    if (r.peek() === ',') {
      r.pos++;
      r.skipWhitespace();
      if (r.peek() === close) break; // trailing comma
      continue;
    }
    break;
  }
  r.skipWhitespace();
  r.expect(close);
  return items;
}

function parseDict(r: Reader, depth: number): Record<string, PythonValue> {
  r.expect('{');
  const out: Record<string, PythonValue> = {};
  r.skipWhitespace();
  if (r.peek() === '}') return r.pos++, out;

  while (true) {
    const key = parseValue(r, depth + 1);
    r.skipWhitespace();
    r.expect(':');
    const value = parseValue(r, depth + 1);
    // Python allows any scalar as a key and the export uses numbers and booleans as well as
    // strings; a list or dict key has no sensible property name, so the row is refused instead.
    if (key !== null && typeof key === 'object') {
      throw new PythonLiteralSyntaxError('dict key is not a scalar', r.pos);
    }
    // defineProperty, not assignment: `out['__proto__'] = value` would invoke the prototype
    // setter instead of storing a key, losing the value and changing what `in` answers.
    Object.defineProperty(out, String(key), {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });

    r.skipWhitespace();
    if (r.peek() === ',') {
      r.pos++;
      r.skipWhitespace();
      if (r.peek() === '}') break; // trailing comma
      continue;
    }
    break;
  }
  r.skipWhitespace();
  r.expect('}');
  return out;
}

/** Throws {@link PythonLiteralSyntaxError} on malformed input. */
export function parsePythonLiteral(source: string): PythonValue {
  const r = new Reader(source);
  const value = parseValue(r, 0);
  r.skipWhitespace();
  if (!r.eof) throw new PythonLiteralSyntaxError('trailing characters after value', r.pos);
  return value;
}

/** Returns `undefined` instead of throwing. */
export function tryParsePythonLiteral(source: string): PythonValue | undefined {
  try {
    return parsePythonLiteral(source);
  } catch {
    return undefined;
  }
}
