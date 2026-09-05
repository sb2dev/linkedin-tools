/** Every display string the app builds. These decide what a reader is told about a damaged record. */

import { describe, expect, it } from 'vitest';
import {
  absoluteUrl,
  formatBytes,
  formatDateRange,
  formatDuration,
  formatFilterValue,
  formatLocation,
  formatNumber,
  formatPartialDate,
  formatQualityScore,
  formatSalaryBand,
  formatYears,
  initials,
  joinParts,
  pluralize,
  qualityFraction,
  readCertification,
  readEducation,
  readExperience,
  readLanguage,
  splitHighlight,
  titleCase,
} from './format';

describe('titleCase', () => {
  it('capitalises the words a name is made of', () => {
    expect(titleCase('joey holland')).toBe('Joey Holland');
  });

  it('leaves a minor word lowercase unless it opens the phrase', () => {
    expect(titleCase('head of growth')).toBe('Head of Growth');
    expect(titleCase('of counsel')).toBe('Of Counsel');
  });

  it('shouts an acronym', () => {
    expect(titleCase('vp of it')).toContain('VP');
  });

  it('answers empty for nothing at all', () => {
    expect(titleCase(undefined)).toBe('');
    expect(titleCase(null)).toBe('');
    expect(titleCase('')).toBe('');
  });
});

describe('the small formatters', () => {
  it('groups a number', () => {
    expect(formatNumber(9203)).toMatch(/9.203/);
  });

  it('pluralises on the count', () => {
    expect(pluralize(1, 'row')).toBe('row');
    expect(pluralize(2, 'row')).toBe('rows');
  });

  it('joins the parts that are there and drops the rest', () => {
    expect(joinParts(['a', undefined, '', 'b'])).toBe('a, b');
    expect(joinParts(['a', 'b'], ' at ')).toBe('a at b');
    expect(joinParts([undefined, ''])).toBe('');
  });

  it('builds initials from one or two names', () => {
    expect(initials('joey holland')).toBe('JH');
    expect(initials('cher')).toBe('C');
    expect(initials('')).toBe('?');
  });

  it('reads a quality score as a percentage', () => {
    expect(formatQualityScore(0.71)).toBe('71%');
    expect(qualityFraction(0.5)).toBe(0.5);
    expect(qualityFraction(Number.NaN)).toBe(0);
  });

  it('sizes a file', () => {
    expect(formatBytes(0)).toMatch(/0/);
    expect(formatBytes(1024)).toMatch(/1/);
    expect(formatBytes(4_984_667)).toMatch(/MB/);
  });
});

describe('the awkward inputs each formatter has to survive', () => {
  it('refuses a negative or unreadable byte count', () => {
    expect(formatBytes(-1)).toBe('');
    expect(formatBytes(Number.NaN)).toBe('');
  });

  it('names the unit a size actually needs', () => {
    expect(formatBytes(900)).toMatch(/B/);
    expect(formatBytes(5 * 1024 ** 3)).toMatch(/GB/);
  });

  it('leaves a date it cannot parse alone', () => {
    expect(formatPartialDate('not a date')).toBeUndefined();
    expect(formatPartialDate('2020-99')).toMatch(/99/);
  });

  it('reads a span that ends without ever starting', () => {
    expect(formatDateRange(undefined, '2022')).toMatch(/until/);
  });

  it('measures a span shorter than a year in months', () => {
    expect(formatDuration('2020-01', '2020-04')).toMatch(/mo/);
    expect(formatDuration('2020-01', '2021-02')).toMatch(/1 yr/);
    expect(formatDuration('not a date', '2020')).toBeUndefined();
  });

  it('drops a part it has already joined once', () => {
    expect(joinParts(['Texas', 'texas'])).toBe('Texas');
  });

  it('falls back to the raw place name when no part is usable', () => {
    expect(formatLocation({ name: 'somewhere' })).toBe('Somewhere');
  });

  it('reads a numeric field the source wrote as a number', () => {
    // pickText renders it as display text, so a GPA arrives as a string ready to print.
    expect(readEducation({ school: { name: 'x' }, gpa: 3.5 })).toMatchObject({ gpa: '3.5' });
  });

  it('reads a single value where a list was expected', () => {
    expect(readEducation({ degrees: 'bachelors' })).toMatchObject({ degrees: ['Bachelors'] });
  });

  it('leaves a figure it cannot read inside a band alone', () => {
    // The band shape is fixed, but a damaged row can still put anything in the column.
    // A figure too large for a JS number is left exactly as the row wrote it.
    const huge = '1'.repeat(400);
    expect(formatSalaryBand(`${huge}-x`)).toContain(huge);
  });

  it('rounds a small size to a decimal and a large one to a whole number', () => {
    expect(formatBytes(1536)).toMatch(/1\.5/);
    expect(formatBytes(50 * 1024)).toMatch(/^50 /);
  });

  it('measures a role that has not ended against today', () => {
    expect(formatDuration('2020-01', undefined)).toMatch(/yr/);
  });

  it('says one year and one month in the singular, and more in the plural', () => {
    // The span is inclusive of both ends, which is how a profile reads a tenure.
    expect(formatDuration('2020-01', '2021-01')).toBe('1 yr 1 mo');
    expect(formatDuration('2020-01', '2021-02')).toBe('1 yr 2 mos');
  });

  it('reads a date with no month as the start of its year', () => {
    expect(formatDuration('2020', '2021')).toBe('1 yr 1 mo');
  });

  it('treats a blank string as absent', () => {
    expect(readCertification({ name: '   ' })).toMatchObject({});
  });
});

describe('formatYears', () => {
  it('reads a span in years', () => {
    expect(formatYears(8)).toBe('8 years');
    expect(formatYears(1)).toBe('1 year');
  });

  it('calls anything under a year exactly that', () => {
    expect(formatYears(0.4)).toBe('under a year');
  });

  it('answers nothing for a value the source never gave', () => {
    expect(formatYears(undefined)).toBeUndefined();
    expect(formatYears(null)).toBeUndefined();
    expect(formatYears(Number.NaN)).toBeUndefined();
  });
});

describe('formatSalaryBand', () => {
  it('shortens the thousands and marks it as money', () => {
    expect(formatSalaryBand('55,000-70,000')).toBe('$55k-70k');
  });

  it('keeps the comparator on an open-ended band', () => {
    expect(formatSalaryBand('<20,000')).toBe('<$20k');
    expect(formatSalaryBand('>250,000')).toBe('>$250k');
  });

  it('leaves a small figure alone', () => {
    expect(formatSalaryBand('500')).toBe('$500');
  });

  it('answers nothing for a band the row never carried', () => {
    expect(formatSalaryBand(undefined)).toBeUndefined();
    expect(formatSalaryBand('')).toBeUndefined();
  });
});

describe('formatFilterValue', () => {
  it('lists the terms', () => {
    expect(formatFilterValue({ type: 'terms', values: ['a', 'b'] })).toBe('A, B');
  });

  it('reads a range at both ends and at each end alone', () => {
    expect(formatFilterValue({ type: 'range', min: 5, max: 15 })).toBe('5 – 15');
    expect(formatFilterValue({ type: 'range', min: 5 })).toBe('5 or more');
    expect(formatFilterValue({ type: 'range', max: 15 })).toBe('up to 15');
    expect(formatFilterValue({ type: 'range' })).toBe('any');
  });

  it('reads a date range the same way', () => {
    expect(formatFilterValue({ type: 'date_range', from: '2000', to: '2010' })).toBe('2000 – 2010');
    expect(formatFilterValue({ type: 'date_range', from: '2000' })).toBe('from 2000');
    expect(formatFilterValue({ type: 'date_range', to: '2010' })).toBe('until 2010');
    expect(formatFilterValue({ type: 'date_range' })).toBe('any');
  });

  it('reads an exists filter as present or absent', () => {
    expect(formatFilterValue({ type: 'exists', present: true })).toBe('present');
    expect(formatFilterValue({ type: 'exists', present: false })).toBe('absent');
  });
});

describe('the date formatters', () => {
  it('reads all three widths the source uses', () => {
    expect(formatPartialDate('2020')).toBe('2020');
    expect(formatPartialDate('2020-04')).toMatch(/2020/);
    expect(formatPartialDate('2020-04-01')).toMatch(/2020/);
  });

  it('answers nothing for a date the row never carried', () => {
    expect(formatPartialDate(undefined)).toBeUndefined();
    expect(formatPartialDate('')).toBeUndefined();
  });

  it('reads a range, and says "Present" for a role that never ended', () => {
    expect(formatDateRange('2020', '2022')).toMatch(/2020/);
    expect(formatDateRange('2020', undefined)).toMatch(/Present/);
    expect(formatDateRange(undefined, undefined)).toBeUndefined();
  });

  it('measures how long something lasted', () => {
    expect(formatDuration('2004-01', '2008-02')).toMatch(/yr/);
    expect(formatDuration(undefined, '2008')).toBeUndefined();
  });
});

describe('formatLocation', () => {
  it('prefers the whole name the source spelled out', () => {
    expect(formatLocation({ name: 'denton, texas, united states' })).toBe('Denton, Texas, United States');
  });

  it('builds one out of the parts when it must', () => {
    expect(formatLocation({ locality: 'denton', country: 'united states' })).toContain('Denton');
  });

  it('answers empty for no place at all', () => {
    expect(formatLocation(undefined)).toBe('');
    expect(formatLocation({})).toBe('');
  });
});

describe('splitHighlight', () => {
  it('splits the marked run out of the fragment', () => {
    expect(splitHighlight('a <em>growth</em> role')).toEqual([
      { text: 'a ', match: false },
      { text: 'growth', match: true },
      { text: ' role', match: false },
    ]);
  });

  it('handles a fragment with no mark at all', () => {
    expect(splitHighlight('plain')).toEqual([{ text: 'plain', match: false }]);
  });
});

describe('the source-shaped readers', () => {
  it('reads an experience entry out of the export shape', () => {
    const entry = readExperience({
      company: { name: 'garver', industry: 'construction' },
      title: { name: 'recruiting manager', levels: ['manager'] },
      start_date: '2016-11',
      is_primary: true,
      summary: 'a note',
      location_names: ['denton, texas'],
    });

    // The readers title-case what they return, so the view is display-ready.
    expect(entry).toMatchObject({
      company: 'Garver',
      companyIndustry: 'Construction',
      title: 'Recruiting Manager',
      levels: ['Manager'],
      start: '2016-11',
      isPrimary: true,
      summary: 'a note',
    });
  });

  it('reads an experience entry that carries almost nothing', () => {
    expect(readExperience({})).toMatchObject({ levels: [], isPrimary: false });
  });

  it('reads an education entry', () => {
    const entry = readEducation({
      school: { name: 'university of north texas' },
      degrees: ['bachelors'],
      majors: ['business administration'],
      minors: [],
      gpa: 3.5,
      end_date: '2008',
    });

    expect(entry).toMatchObject({ school: 'University of North Texas', end: '2008', gpa: '3.5' });
  });

  it('reads an education entry with nothing in it', () => {
    expect(readEducation({})).toMatchObject({ degrees: [], majors: [], minors: [] });
  });

  it('reads a certification and a language', () => {
    expect(readCertification({ name: 'PMP', organization: 'PMI', start_date: '2020' })).toMatchObject({
      name: 'PMP',
      start: '2020',
    });
    expect(readCertification({})).toMatchObject({});
    expect(readLanguage({ name: 'english', proficiency: 'native' })).toEqual({
      name: 'English',
      proficiency: 'native',
    });
    expect(readLanguage({})).toEqual({});
  });
});

describe('absoluteUrl', () => {
  it('adds the scheme the source leaves off', () => {
    expect(absoluteUrl('linkedin.com/in/someone')).toBe('https://linkedin.com/in/someone');
  });

  it('leaves a URL that already has one', () => {
    expect(absoluteUrl('https://linkedin.com/in/someone')).toBe('https://linkedin.com/in/someone');
    expect(absoluteUrl('HTTP://example.test')).toBe('HTTP://example.test');
  });

  it('trims a leading slash rather than doubling it', () => {
    expect(absoluteUrl('//example.test')).toBe('https://example.test');
  });
});
