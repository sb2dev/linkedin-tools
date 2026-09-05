/**
 * The rejection paths of the coercions. Each decides whether a cell is indexed or quarantined, so a
 * coercion that accepts too much silently files one column's value under another column's name.
 */

import {
  FACEBOOK_HANDLE,
  GENDERS,
  asBoundedFloat,
  asBoundedInteger,
  asEmail,
  asEmailList,
  asGeoPoint,
  asHandle,
  asHostUrl,
  asInteger,
  asLinkedInUrl,
  asLinkedInUsername,
  asName,
  asObjectList,
  asOneOf,
  asPartialDate,
  asPhoneList,
  asStringList,
  asText,
  asWebsite,
  asYear,
  hasAnyKey,
} from './value-kinds';

describe('asLinkedInUsername', () => {
  it('takes the username out of a profile URL', () => {
    expect(asLinkedInUsername('linkedin.com/in/Ada-Lovelace')).toEqual({
      ok: true,
      value: 'ada-lovelace',
    });
  });

  it('accepts a bare username and lowercases it', () => {
    expect(asLinkedInUsername('Ada-Lovelace')).toEqual({ ok: true, value: 'ada-lovelace' });
  });

  it('refuses a value that is neither, rather than filing it as a username', () => {
    expect(asLinkedInUsername('a b c')).toEqual({ ok: false, reason: 'not a linkedin username' });
  });

  it('refuses a value too short to be a username', () => {
    expect(asLinkedInUsername('ab')).toEqual({ ok: false, reason: 'not a linkedin username' });
  });

  it('refuses an empty cell', () => {
    expect(asLinkedInUsername('  ')).toEqual({ ok: false, reason: 'empty' });
  });
});

describe('asHostUrl', () => {
  const twitter = asHostUrl('twitter.com');

  it('drops the scheme so two spellings of one profile compare equal', () => {
    expect(twitter('https://twitter.com/ada')).toEqual({ ok: true, value: 'twitter.com/ada' });
  });

  it('refuses a URL on another host', () => {
    expect(twitter('facebook.com/ada')).toEqual({ ok: false, reason: 'not a twitter.com URL' });
  });

  it('refuses text that is not a URL at all', () => {
    expect(twitter('@ada')).toEqual({ ok: false, reason: 'not a URL' });
  });

  it('refuses an empty cell', () => {
    expect(twitter('   ')).toEqual({ ok: false, reason: 'empty' });
  });
});

describe('asWebsite', () => {
  it('drops the scheme', () => {
    expect(asWebsite('HTTPS://Example.COM/x')).toEqual({ ok: true, value: 'example.com/x' });
  });

  it('refuses a phone number that drifted into the website column', () => {
    expect(asWebsite('+18185540756')).toEqual({ ok: false, reason: 'not a URL' });
  });

  it('refuses an empty cell', () => {
    expect(asWebsite('')).toEqual({ ok: false, reason: 'empty' });
  });
});

describe('the Python literal cells', () => {
  it('reads a list of strings', () => {
    expect(asStringList("['leadership', 'training']")).toEqual({
      ok: true,
      value: ['leadership', 'training'],
    });
  });

  it('refuses a cell that does not open a literal at all', () => {
    expect(asStringList('leadership')).toEqual({ ok: false, reason: 'not a Python literal' });
  });

  it('refuses an empty cell', () => {
    expect(asStringList('  ')).toEqual({ ok: false, reason: 'empty' });
  });

  it('quarantines a truncated literal, keeping the offset the parser reported', () => {
    const result = asStringList("['leadership', ");

    expect(result.ok).toBe(false);
    expect(result).toHaveProperty('reason', expect.stringContaining('at offset'));
  });
});

describe('asText', () => {
  it('keeps ordinary prose', () => {
    expect(asText('  head of growth ')).toEqual({ ok: true, value: 'head of growth' });
  });

  it('refuses a structured value that drifted into a text column', () => {
    expect(asText("['a', 'b']")).toEqual({ ok: false, reason: 'structured value in a text column' });
    expect(asText("{'a': 1}")).toEqual({ ok: false, reason: 'structured value in a text column' });
  });

  it('refuses a profile URL that drifted into a text column', () => {
    expect(asText('linkedin.com/in/ada')).toEqual({ ok: false, reason: 'url in a text column' });
  });

  it('refuses a date that drifted into a text column, but keeps a bare year', () => {
    expect(asText('2020-04-01')).toEqual({ ok: false, reason: 'date in a text column' });
    expect(asText('2020')).toEqual({ ok: true, value: '2020' });
  });

  it('refuses an empty cell', () => {
    expect(asText(' ')).toEqual({ ok: false, reason: 'empty' });
  });
});

describe('asName', () => {
  it('accepts a name and trims it', () => {
    expect(asName(' Ada Lovelace ')).toEqual({ ok: true, value: 'Ada Lovelace' });
  });

  it('refuses a value that does not open with a letter', () => {
    expect(asName('12345')).toEqual({ ok: false, reason: 'not a name-shaped value' });
  });

  it('refuses an implausibly long value', () => {
    expect(asName(`A${'b'.repeat(220)}`)).toEqual({ ok: false, reason: 'implausibly long for a name' });
  });

  it('refuses an empty cell', () => {
    expect(asName('')).toEqual({ ok: false, reason: 'empty' });
  });
});

describe('asHandle', () => {
  const facebook = asHandle(FACEBOOK_HANDLE);

  it('drops a leading @', () => {
    expect(facebook('@ada.lovelace')).toEqual({ ok: true, value: 'ada.lovelace' });
  });

  it('refuses a handle the network could not issue', () => {
    expect(facebook('a b')).toEqual({ ok: false, reason: 'not a valid handle for this network' });
  });

  it('refuses an empty cell', () => {
    expect(facebook('@')).toEqual({ ok: false, reason: 'empty' });
  });
});

describe('asLinkedInUrl', () => {
  it('normalises a profile URL to its canonical form', () => {
    expect(asLinkedInUrl('https://www.linkedin.com/in/ada-lovelace/')).toEqual({
      ok: true,
      value: 'linkedin.com/in/ada-lovelace',
    });
  });

  it('refuses a company URL, which is not a profile', () => {
    expect(asLinkedInUrl('linkedin.com/company/acme')).toEqual({
      ok: false,
      reason: 'not a linkedin.com/in/ profile URL',
    });
  });
});

describe('the numeric coercions', () => {
  it('reads an integer, including one the source wrote as a float', () => {
    expect(asInteger('116')).toEqual({ ok: true, value: 116 });
    expect(asInteger('116.0')).toEqual({ ok: true, value: 116 });
  });

  it('refuses text and an empty cell', () => {
    expect(asInteger('many')).toEqual({ ok: false, reason: 'not an integer' });
    expect(asInteger('')).toEqual({ ok: false, reason: 'empty' });
  });

  it('refuses an integer past what a JS number holds exactly', () => {
    expect(asInteger('9007199254740993')).toEqual({ ok: false, reason: 'integer out of range' });
  });

  it('bounds an integer, because an out-of-range value means column drift', () => {
    const connections = asBoundedInteger(0, 30_000);

    expect(connections('500')).toEqual({ ok: true, value: 500 });
    expect(connections('90000')).toEqual({ ok: false, reason: 'outside the plausible range 0..30000' });
    // A cell that is not an integer at all keeps the reason asInteger gave, not the range one.
    expect(connections('many')).toEqual({ ok: false, reason: 'not an integer' });
  });

  it('bounds a float the same way, and refuses a non-number', () => {
    const gpa = asBoundedFloat(0, 4);

    expect(gpa('3.5')).toEqual({ ok: true, value: 3.5 });
    expect(gpa('9')).toEqual({ ok: false, reason: 'outside the plausible range 0..4' });
    expect(gpa('good')).toEqual({ ok: false, reason: 'not a number' });
    expect(gpa('')).toEqual({ ok: false, reason: 'empty' });
  });

  it('reads a plausible year and refuses one that is not', () => {
    expect(asYear('2004')).toEqual({ ok: true, value: 2004 });
    expect(asYear('12')).toEqual({ ok: false, reason: 'not a plausible year' });
  });
});

describe('asPartialDate', () => {
  it('accepts all three widths the source uses', () => {
    expect(asPartialDate('2020')).toEqual({ ok: true, value: '2020' });
    expect(asPartialDate('2020-04')).toEqual({ ok: true, value: '2020-04' });
    expect(asPartialDate('2020-04-01')).toEqual({ ok: true, value: '2020-04-01' });
  });

  it('refuses an impossible month or day rather than storing it', () => {
    expect(asPartialDate('2020-13')).toEqual({ ok: false, reason: 'month out of range' });
    expect(asPartialDate('2020-00')).toEqual({ ok: false, reason: 'month out of range' });
    expect(asPartialDate('2020-04-32')).toEqual({ ok: false, reason: 'day out of range' });
    expect(asPartialDate('2020-04-00')).toEqual({ ok: false, reason: 'day out of range' });
  });

  it('refuses anything that is not an ISO date', () => {
    expect(asPartialDate('April 2020')).toEqual({ ok: false, reason: 'not an ISO date' });
  });
});

describe('asGeoPoint', () => {
  it('reads a "lat,lon" pair', () => {
    expect(asGeoPoint('33.19,-97.13')).toEqual({ ok: true, value: { lat: 33.19, lon: -97.13 } });
  });

  it('refuses a pair outside the globe', () => {
    expect(asGeoPoint('91.0,0.0')).toEqual({ ok: false, reason: 'latitude out of range' });
    expect(asGeoPoint('0.0,181.0')).toEqual({ ok: false, reason: 'longitude out of range' });
  });

  it('refuses anything that is not a pair', () => {
    expect(asGeoPoint('somewhere')).toEqual({ ok: false, reason: 'not a "lat,lon" pair' });
  });
});

describe('asOneOf and asEmail', () => {
  it('matches a closed vocabulary case-insensitively', () => {
    expect(asOneOf(GENDERS)('Male')).toEqual({ ok: true, value: 'male' });
  });

  it('names the vocabulary when nothing matched', () => {
    expect(asOneOf(GENDERS)('other')).toEqual({ ok: false, reason: 'not one of: male, female' });
  });

  it('reads an email and lowercases it', () => {
    expect(asEmail(' Ada@Example.COM ')).toEqual({ ok: true, value: 'ada@example.com' });
  });

  it('refuses text that is not an address', () => {
    expect(asEmail('ada at example')).toEqual({ ok: false, reason: 'not an email address' });
  });
});

describe('the list coercions', () => {
  it('drops blanks and duplicates from a string list', () => {
    expect(asStringList("['a', '', 'a', ' b ']")).toEqual({ ok: true, value: ['a', 'b'] });
  });

  it('refuses a literal that is not a list', () => {
    expect(asStringList("{'a': 1}")).toEqual({ ok: false, reason: 'not a list' });
  });

  it('refuses a list holding anything but strings', () => {
    expect(asStringList("['a', 1]")).toEqual({ ok: false, reason: 'list contains a non-string element' });
  });

  it('checks every object in a list against the shape the column expects', () => {
    const withName = asObjectList(hasAnyKey('name'));

    expect(withName("[{'name': 'a'}]")).toEqual({ ok: true, value: [{ name: 'a' }] });
    expect(withName("[{'other': 'a'}]")).toEqual({
      ok: false,
      reason: 'object does not have the expected keys',
    });
    expect(withName("['a']")).toEqual({ ok: false, reason: 'list contains a non-object element' });
    expect(withName("[['a']]")).toEqual({ ok: false, reason: 'list contains a non-object element' });
    expect(withName("[None]")).toEqual({ ok: false, reason: 'list contains a non-object element' });
    expect(withName("{'a': 1}")).toEqual({ ok: false, reason: 'not a list' });
    expect(withName('nope')).toEqual({ ok: false, reason: 'not a Python literal' });
  });

  it('keeps only the entries that are plausibly phone numbers', () => {
    expect(asPhoneList("['+15202458934', 'call me']")).toEqual({
      ok: true,
      value: ['+15202458934'],
    });
  });

  it('quarantines a phone column that holds no phone number at all', () => {
    expect(asPhoneList("['call me']")).toEqual({ ok: false, reason: 'no plausible phone numbers' });
  });

  it('passes a malformed phone cell straight through as the parser refused it', () => {
    expect(asPhoneList('nope')).toEqual({ ok: false, reason: 'not a Python literal' });
  });

  it('reads addresses out of an email list and keeps the type when there is one', () => {
    expect(asEmailList("[{'address': 'Ada@Example.com', 'type': 'personal'}, {'address': 'x'}]")).toEqual({
      ok: true,
      value: [{ address: 'ada@example.com', type: 'personal' }],
    });
  });

  it('quarantines an email column whose addresses are all unusable', () => {
    expect(asEmailList("[{'address': 'not-an-address'}]")).toEqual({
      ok: false,
      reason: 'no valid email addresses',
    });
  });

  it('passes a malformed email cell straight through', () => {
    expect(asEmailList('nope')).toEqual({ ok: false, reason: 'not a Python literal' });
  });
});

describe('hasAnyKey', () => {
  it('is satisfied by any one of the keys', () => {
    expect(hasAnyKey('a', 'b')({ b: 1 })).toBe(true);
    expect(hasAnyKey('a', 'b')({ c: 1 })).toBe(false);
  });
});
