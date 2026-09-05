import { FilterQueryError, parseFilterQuery } from './filter-query.parser';

describe('parseFilterQuery', () => {
  describe('parameter selection', () => {
    it('ignores everything that is not a filter', () => {
      expect(parseFilterQuery('q=engineer&sort=name&page=2&size=50&facets=skills')).toEqual({});
    });

    it('accepts a query string with or without its leading question mark', () => {
      const expected = { skills: { type: 'terms', values: ['leadership'] } };

      expect(parseFilterQuery('?f.skills=leadership')).toEqual(expected);
      expect(parseFilterQuery('f.skills=leadership')).toEqual(expected);
    });

    it('reads filters that are mixed in among the search options', () => {
      const filters = parseFilterQuery('q=lead&f.country=india&sort=relevance&f.hasGithub=true');

      expect(filters).toEqual({
        country: { type: 'terms', values: ['india'] },
        hasGithub: { type: 'exists', present: true },
      });
    });

    it('rejects an unknown field by name rather than dropping it', () => {
      expect(() => parseFilterQuery('f.favouriteColour=blue')).toThrow(FilterQueryError);

      try {
        parseFilterQuery('f.favouriteColour=blue');
        fail('expected a FilterQueryError');
      } catch (error) {
        expect(error).toBeInstanceOf(FilterQueryError);
        expect((error as FilterQueryError).parameter).toBe('f.favouriteColour');
      }
    });
  });

  describe('terms', () => {
    it('splits on commas', () => {
      expect(parseFilterQuery('f.skills=leadership,training')).toEqual({
        skills: { type: 'terms', values: ['leadership', 'training'] },
      });
    });

    it('keeps an escaped comma inside a single value', () => {
      expect(parseFilterQuery('f.companyName=lopez%2C%20lopez%20and%20jones')).toEqual({
        companyName: { type: 'terms', values: ['lopez, lopez and jones'] },
      });
    });

    it('decodes a plus as a space, as a query string requires', () => {
      expect(parseFilterQuery('f.jobTitle=head+of+sales')).toEqual({
        jobTitle: { type: 'terms', values: ['head of sales'] },
      });
    });

    it('trims, drops blanks and de-duplicates', () => {
      expect(parseFilterQuery('f.skills=%20sales%20,,sales,marketing')).toEqual({
        skills: { type: 'terms', values: ['sales', 'marketing'] },
      });
    });

    it('merges a repeated parameter', () => {
      expect(parseFilterQuery('f.skills=sales&f.skills=training,sales')).toEqual({
        skills: { type: 'terms', values: ['sales', 'training'] },
      });
    });

    it('drops a parameter that carries nothing instead of filtering on nothing', () => {
      expect(parseFilterQuery('f.skills=')).toEqual({});
      expect(parseFilterQuery('f.skills=,,%20')).toEqual({});
      expect(parseFilterQuery('f.skills')).toEqual({});
    });

    it('reports malformed percent-encoding as a bad parameter', () => {
      expect(() => parseFilterQuery('f.skills=%zz')).toThrow(FilterQueryError);
    });
  });

  describe('ordered terms', () => {
    it('keeps a salary band whole when its comma is escaped', () => {
      expect(parseFilterQuery('f.salaryBand=20%2C000-25%2C000,%3C20%2C000')).toEqual({
        salaryBand: { type: 'terms', values: ['20,000-25,000', '<20,000'] },
      });
    });

    it('answers with the canonical spelling of a closed vocabulary', () => {
      expect(parseFilterQuery('f.seniority=CXO,Director')).toEqual({
        seniority: { type: 'terms', values: ['cxo', 'director'] },
      });
    });

    it('rejects a value outside the vocabulary', () => {
      expect(() => parseFilterQuery('f.companySize=quite-big')).toThrow(
        /f.companySize: "quite-big" is not one of/,
      );
    });
  });

  describe('range', () => {
    it('reads both ends', () => {
      expect(parseFilterQuery('f.yearsExperience=5..15')).toEqual({
        yearsExperience: { type: 'range', min: 5, max: 15 },
      });
    });

    it('reads an open upper end', () => {
      expect(parseFilterQuery('f.yearsExperience=5..')).toEqual({
        yearsExperience: { type: 'range', min: 5, max: undefined },
      });
    });

    it('reads an open lower end', () => {
      expect(parseFilterQuery('f.connections=..500')).toEqual({
        connections: { type: 'range', min: undefined, max: 500 },
      });
    });

    it('reads a fractional bound', () => {
      expect(parseFilterQuery('f.qualityScore=0.75..1')).toEqual({
        qualityScore: { type: 'range', min: 0.75, max: 1 },
      });
    });

    it('drops a range that is open at both ends', () => {
      expect(parseFilterQuery('f.yearsExperience=..')).toEqual({});
      expect(parseFilterQuery('f.yearsExperience=')).toEqual({});
    });

    it('rejects a value that is not a range at all', () => {
      expect(() => parseFilterQuery('f.yearsExperience=5')).toThrow(
        /f.yearsExperience: Expected a range like "5..15"/,
      );
    });

    it('rejects a non-numeric bound', () => {
      expect(() => parseFilterQuery('f.yearsExperience=five..15')).toThrow(
        /The lower bound "five" is not a number/,
      );
      expect(() => parseFilterQuery('f.yearsExperience=1..1e5')).toThrow(
        /The upper bound "1e5" is not a number/,
      );
    });

    it('rejects an inverted range', () => {
      expect(() => parseFilterQuery('f.yearsExperience=15..5')).toThrow(
        /The lower bound 15 is above the upper bound 5/,
      );
    });
  });

  describe('date range', () => {
    it('reads a year range', () => {
      expect(parseFilterQuery('f.graduationYear=2000..2010')).toEqual({
        graduationYear: { type: 'date_range', from: '2000', to: '2010' },
      });
    });

    it('reads partial dates and open ends', () => {
      expect(parseFilterQuery('f.jobStartYear=2019-06..')).toEqual({
        jobStartYear: { type: 'date_range', from: '2019-06', to: undefined },
      });
      expect(parseFilterQuery('f.jobStartYear=..2021-03-14')).toEqual({
        jobStartYear: { type: 'date_range', from: undefined, to: '2021-03-14' },
      });
    });

    it('rejects a bound that is not a date', () => {
      expect(() => parseFilterQuery('f.graduationYear=2000..last%20year')).toThrow(
        /The upper bound "last year" is not a year, year-month or full date/,
      );
      expect(() => parseFilterQuery('f.graduationYear=2000-13..2010')).toThrow(FilterQueryError);
    });

    it('rejects an inverted range', () => {
      expect(() => parseFilterQuery('f.graduationYear=2010..2000')).toThrow(
        /is after the upper bound/,
      );
    });

    it('drops a range that is empty, blank or open at both ends', () => {
      expect(parseFilterQuery('f.graduationYear=')).toEqual({});
      expect(parseFilterQuery('f.graduationYear=..')).toEqual({});
      // A box the operator cleared to a space still sends a parameter.
      expect(parseFilterQuery('f.graduationYear=%20')).toEqual({});
    });
  });

  describe('exists', () => {
    it('reads both states', () => {
      expect(parseFilterQuery('f.hasGithub=true&f.hasSummary=FALSE')).toEqual({
        hasGithub: { type: 'exists', present: true },
        hasSummary: { type: 'exists', present: false },
      });
    });

    it('drops a blank value', () => {
      expect(parseFilterQuery('f.hasGithub=')).toEqual({});
      expect(parseFilterQuery('f.hasGithub=%20')).toEqual({});
    });

    it('rejects anything else', () => {
      expect(() => parseFilterQuery('f.hasGithub=yes')).toThrow(
        /f.hasGithub: Expected "true" or "false"; received "yes"/,
      );
    });
  });

  it('reads a whole realistic query in one pass', () => {
    const filters = parseFilterQuery(
      '?q=growth&sort=connections&page=3&f.skills=leadership,b2b%20marketing' +
        '&f.seniority=director,vp&f.salaryBand=%3E250%2C000&f.yearsExperience=10..' +
        '&f.graduationYear=1995..2005&f.hasGithub=false&f.country=united%20states',
    );

    expect(filters).toEqual({
      skills: { type: 'terms', values: ['leadership', 'b2b marketing'] },
      seniority: { type: 'terms', values: ['director', 'vp'] },
      salaryBand: { type: 'terms', values: ['>250,000'] },
      yearsExperience: { type: 'range', min: 10, max: undefined },
      graduationYear: { type: 'date_range', from: '1995', to: '2005' },
      hasGithub: { type: 'exists', present: false },
      country: { type: 'terms', values: ['united states'] },
    });
  });
});
