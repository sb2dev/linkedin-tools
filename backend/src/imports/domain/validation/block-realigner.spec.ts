/** The realigner decides whether a scrambled row is repaired and by how far it is shifted. */

import { HEADER, columnOf, rowOf } from 'src/test/fakes/dataset-fixture';
import { realignBlock } from './block-realigner';

const INDEX_OF: ReadonlyMap<string, number> = new Map(
  HEADER.map((name, position) => [name, position] as const),
);

function positionOf(column: string): number {
  const at = HEADER.indexOf(column);
  if (at < 0) throw new Error(`no column named ${column}`);
  return at;
}

/** A row of the real width holding real cells at chosen positions and nothing anywhere else. */
function rowHolding(cells: ReadonlyArray<readonly [number, string]>): string[] {
  const row = new Array<string>(HEADER.length).fill('');
  for (const [position, value] of cells) row[position] = value;
  return row;
}

const CLEAN = rowOf('clean');
const SKILLS = columnOf(CLEAN, 'skills');
const INTERESTS = columnOf(CLEAN, 'interests');
const LOCATIONS = columnOf(CLEAN, 'location_names');
const PHONES = columnOf(CLEAN, 'phone_numbers');

describe('proving the shift a scrambled row carries', () => {
  it('recovers the values a one-place shift displaced, not just the fact that it shifted', () => {
    const realignment = realignBlock(rowOf('scrambledOffsetMinus1'), INDEX_OF);

    expect(realignment?.offset).toBe(-1);
    expect(columnOf(realignment?.fields ?? [], 'skills')).toBe(
      columnOf(rowOf('scrambledOffsetMinus1'), 'interests'),
    );
  });

  it('recovers a three-place shift, so the distance is proven rather than assumed to be one', () => {
    const realignment = realignBlock(rowOf('scrambledOffsetMinus3'), INDEX_OF);

    expect(realignment?.offset).toBe(-3);
    expect(realignment?.fields).not.toEqual(rowOf('scrambledOffsetMinus3'));
  });

  it('leaves a row that was never scrambled exactly as it found it', () => {
    expect(realignBlock(CLEAN, INDEX_OF)).toBeNull();
  });

  it('refuses a row whose damage no single shift explains', () => {
    expect(realignBlock(rowOf('unrepairable'), INDEX_OF)).toBeNull();
  });
});

describe('the rules that stop a repair from inventing data', () => {
  it('will not infer a shift from a handful of columns that happen to line up', () => {
    const thin = rowHolding([
      [positionOf('emails'), INTERESTS],
      [positionOf('interests'), SKILLS],
      [positionOf('skills'), LOCATIONS],
    ]);

    expect(realignBlock(thin, INDEX_OF)).toBeNull();
  });

  it('prefers the shift that explains more of the block, not the nearest one that fits', () => {
    // Both -1 and -2 validate every column they populate; only -2 also explains the phone column.
    const ambiguous = rowHolding([
      [positionOf('phone_numbers') - 2, PHONES],
      [positionOf('emails'), INTERESTS],
      [positionOf('interests'), SKILLS],
      [positionOf('skills'), LOCATIONS],
      [positionOf('location_names'), INTERESTS],
    ]);

    const realignment = realignBlock(ambiguous, INDEX_OF);

    expect(realignment?.offset).toBe(-2);
    expect(columnOf(realignment?.fields ?? [], 'phone_numbers')).toBe(PHONES);
  });
});

/** An export narrow enough that the block runs to the end of the header. */
describe('a header whose last column is part of the block', () => {
  const NARROW: readonly string[] = [
    'full_name',
    'linkedin_url',
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
  const NARROW_INDEX: ReadonlyMap<string, number> = new Map(NARROW.map((name, at) => [name, at]));
  const narrowPosition = (column: string): number => NARROW.indexOf(column);

  /** Every block value one place to the right of the column it belongs to, which is a shift of +1. */
  const shiftedRight = (): string[] => {
    const row = new Array<string>(NARROW.length).fill('');
    row[narrowPosition('skills')] = INTERESTS;
    row[narrowPosition('location_names')] = SKILLS;
    row[narrowPosition('regions')] = LOCATIONS;
    row[narrowPosition('countries')] = INTERESTS;
    return row;
  };

  it('proves the shift and reads the row past its end as an empty cell', () => {
    const realignment = realignBlock(shiftedRight(), NARROW_INDEX);

    expect(realignment?.offset).toBe(1);
    expect(realignment?.fields[narrowPosition('interests')]).toBe(INTERESTS);
    // `languages` is the last column, so its value would have come from one past the row.
    expect(realignment?.fields[narrowPosition('languages')]).toBe('');
  });
});
