/** Turns one raw row into a Profile, or explains why it cannot. */

import { createHash } from 'node:crypto';
import { Profile, QuarantinedField } from '../../../profiles/domain/profile';
import { COLUMN_CATALOG, ColumnSpec, MULTI_VALUE_BLOCK, SCRAMBLE_ANCHORS } from './column-catalog';
import { RejectionReason } from './row-classification';
import { asLinkedInUrl, asName } from './value-kinds';
import { tryParsePythonLiteral } from '../parsing/python-literal.parser';
import { truncate } from '../text';

export type RowValidation =
  | { status: 'accepted'; profile: Profile }
  | { status: 'rejected'; reason: RejectionReason; detail: string };

const MAX_EXCERPT = 80;

export class ProfileRowValidator {
  private readonly indexOf: ReadonlyMap<string, number>;

  constructor(header: readonly string[]) {
    this.indexOf = new Map(header.map((name, i) => [name.trim(), i]));
  }

  validate(fields: readonly string[], options: { repaired: boolean }): RowValidation {
    const identity = this.resolveIdentity(fields);
    if (!identity) {
      return {
        status: 'rejected',
        reason: RejectionReason.NoIdentity,
        detail: 'no name-shaped full_name together with a resolvable linkedin.com/in/ URL',
      };
    }

    // Pass 1: check every supplied cell against the shape its column declares.
    const outcomes = this.coerceAll(fields);

    // Pass 2: decide whether the block of list-valued columns is scrambled as a whole.
    const scrambled = isBlockScrambled(outcomes);

    const draft: Record<string, unknown> = {};
    const quarantined: QuarantinedField[] = [];
    let populated = 0;

    for (const outcome of outcomes) {
      const { spec, raw, result } = outcome;
      const untrusted = scrambled && MULTI_VALUE_BLOCK.has(spec.source);

      if (result.ok && !untrusted) {
        setPath(draft, spec.target, result.value);
        populated++;
        continue;
      }
      quarantined.push({
        column: spec.source,
        target: spec.target,
        reason: untrusted && result.ok ? SCRAMBLE_REASON : (result as { reason: string }).reason,
        rawExcerpt: truncate(raw, MAX_EXCERPT),
      });
    }

    // Identity always wins over whatever the individual columns produced for it.
    setPath(draft, 'identity.linkedinUsername', identity.username);
    setPath(draft, 'identity.linkedinUrl', identity.url);

    // Quarantined cells were supplied by the row, so they count towards the score's denominator.
    const supplied = populated + quarantined.length;
    const profile: Profile = {
      ...(draft as Omit<Profile, 'contentHash' | 'quality'>),
      contentHash: contentHash(draft),
      quality: {
        fieldsPopulated: populated,
        fieldsQuarantined: quarantined.length,
        score: Number((populated / supplied).toFixed(4)),
        quarantined,
        repaired: options.repaired,
        drifted: scrambled,
      },
    };

    return { status: 'accepted', profile };
  }

  /** Drift moves the URL, so try `linkedin_url`, then the `profiles` list, then `linkedin_username`. */
  private resolveIdentity(fields: readonly string[]): { username: string; url: string } | null {
    const name = asName(this.read(fields, 'full_name') ?? '');
    if (!name.ok) return null;

    const candidates: string[] = [];
    const direct = this.read(fields, 'linkedin_url');
    if (direct) candidates.push(direct);

    const profilesCell = this.read(fields, 'profiles');
    if (profilesCell) {
      const parsed = tryParsePythonLiteral(profilesCell);
      if (Array.isArray(parsed)) {
        for (const entry of parsed) {
          if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
            const record = entry as Record<string, unknown>;
            if (record.network === 'linkedin' && typeof record.url === 'string') candidates.push(record.url);
          }
        }
      }
    }

    const username = this.read(fields, 'linkedin_username');
    if (username) candidates.push(`linkedin.com/in/${username}`);

    for (const candidate of candidates) {
      const url = asLinkedInUrl(candidate);
      if (url.ok) {
        return { username: url.value.slice('linkedin.com/in/'.length).toLowerCase(), url: url.value };
      }
    }
    return null;
  }

  /** Keeps each column's header position: drift is positional, so order matters downstream. */
  private coerceAll(fields: readonly string[]): CellOutcome[] {
    const outcomes: CellOutcome[] = [];
    for (const spec of COLUMN_CATALOG) {
      const index = this.indexOf.get(spec.source);
      if (index === undefined) continue; // this upload's header does not carry the column
      const raw = this.cellAt(fields, index);
      if (!raw) continue; // absent is not an error; the source is sparse by nature
      outcomes.push({ spec, index, raw, result: spec.coerce(raw) });
    }
    return outcomes.sort((a, b) => a.index - b.index);
  }

  private read(fields: readonly string[], column: string): string | undefined {
    const index = this.indexOf.get(column);
    return index === undefined ? undefined : this.cellAt(fields, index);
  }

  /** A row narrower than the header reads as empty rather than throwing. */
  private cellAt(fields: readonly string[], index: number): string | undefined {
    const value = (fields[index] ?? '').trim();
    return value.length ? value : undefined;
  }
}

interface CellOutcome {
  readonly spec: ColumnSpec;
  /** Position in the source header. */
  readonly index: number;
  readonly raw: string;
  readonly result: ReturnType<ColumnSpec['coerce']>;
}

const SCRAMBLE_REASON = 'column drift: the multi-value block of this row is scrambled';

/** One failing anchor is enough: these five have no other way to be wrong. */
function isBlockScrambled(outcomes: readonly CellOutcome[]): boolean {
  return outcomes.some((o) => !o.result.ok && SCRAMBLE_ANCHORS.has(o.spec.source));
}

function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split('.');
  let cursor = target;
  for (const segment of segments.slice(0, -1)) {
    if (typeof cursor[segment] !== 'object' || cursor[segment] === null) cursor[segment] = {};
    cursor = cursor[segment] as Record<string, unknown>;
  }
  cursor[segments[segments.length - 1]] = value;
}

/** sha256 with keys sorted, so an unchanged row re-imports to the same hash. */
function contentHash(draft: Record<string, unknown>): string {
  return createHash('sha256').update(stableStringify(draft)).digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  // Default sort orders by UTF-16 code unit, which is what the field order has to be pinned to.
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}
