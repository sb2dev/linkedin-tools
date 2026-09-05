/** Repairs a scrambled multi-value block by proving a single offset for the whole block. */

import { Profile } from '../../../profiles/domain/profile';
import { COLUMN_SPEC_BY_SOURCE } from './column-catalog';
import { ProfileRowValidator } from './profile-row.validator';

/** The columns realignment is allowed to move. */
const REALIGNMENT_BLOCK: readonly string[] = [
  'phone_numbers',
  'emails',
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
];

/** Nearest first; a negative offset puts a column's true value that many positions earlier. */
const CANDIDATE_OFFSETS = [-1, -2, -3, -4, -5, 1, 2, 3, 4, 5];

/** Below this many populated columns the evidence is too thin to call a shift proven. */
const MIN_EVIDENCE = 4;

export interface Realignment {
  readonly offset: number;
  /** Populated block columns that validated at this offset. */
  readonly evidence: number;
  readonly fields: string[];
}

/** A proven offset together with the row it produces, once that row has earned it. */
export interface AdoptedRealignment {
  readonly realignment: Realignment;
  readonly profile: Profile;
}

/** Applies a proven offset only if the moved row still validates. */
export function adoptRealignment(
  fields: readonly string[],
  indexOf: ReadonlyMap<string, number>,
  validator: ProfileRowValidator,
): AdoptedRealignment | null {
  const realignment = realignBlock(fields, indexOf);
  if (!realignment) return null;

  const revalidated = validator.validate(realignment.fields, { repaired: true });
  if (revalidated.status !== 'accepted' || revalidated.profile.quality.drifted) return null;

  return { realignment, profile: revalidated.profile };
}

/** The proven realignment, or null when no offset explains the whole block. */
export function realignBlock(
  fields: readonly string[],
  indexOf: ReadonlyMap<string, number>,
): Realignment | null {
  let best: Realignment | null = null;

  for (const offset of CANDIDATE_OFFSETS) {
    let populated = 0;
    let valid = 0;

    for (const column of REALIGNMENT_BLOCK) {
      const target = indexOf.get(column);
      const spec = COLUMN_SPEC_BY_SOURCE.get(column);
      if (target === undefined || spec === undefined) continue;

      const raw = (fields[target + offset] ?? '').trim();
      if (!raw) continue;

      populated++;
      if (spec.coerce(raw).ok) valid++;
    }

    // Every populated column must fit, or the offset is not the explanation.
    if (populated >= MIN_EVIDENCE && valid === populated) {
      if (!best || populated > best.evidence) {
        best = { offset, evidence: populated, fields: applyOffset(fields, indexOf, offset) };
      }
    }
  }

  return best;
}

function applyOffset(
  fields: readonly string[],
  indexOf: ReadonlyMap<string, number>,
  offset: number,
): string[] {
  const out = [...fields];
  for (const column of REALIGNMENT_BLOCK) {
    const target = indexOf.get(column);
    if (target === undefined) continue;
    out[target] = fields[target + offset] ?? '';
  }
  return out;
}
