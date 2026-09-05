import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parsePythonLiteral, PythonLiteralSyntaxError, tryParsePythonLiteral } from './python-literal.parser';

/** Cells lifted verbatim from the reference dataset, so the tests bind to real input. */
const CELLS: Record<string, string> = JSON.parse(
  readFileSync(join(__dirname, '../../../test/fixtures/python-literal-cells.json'), 'utf8'),
);

describe('parsePythonLiteral', () => {
  describe('scalars', () => {
    it.each([
      ["'hello'", 'hello'],
      ['"hello"', 'hello'],
      ['None', null],
      ['True', true],
      ['False', false],
      ['42', 42],
      ['-3.5', 3.5 * -1],
      ['12.0', 12],
    ])('parses %s', (source, expected) => {
      expect(parsePythonLiteral(source)).toBe(expected);
    });

    it('treats nan as absent rather than failing the whole cell', () => {
      expect(parsePythonLiteral('nan')).toBeNull();
    });
  });

  describe('the cases that break JSON.parse', () => {
    it('reads single-quoted strings', () => {
      expect(parsePythonLiteral("['guitar', 'aviation']")).toEqual(['guitar', 'aviation']);
    });

    it('keeps an apostrophe inside a single-quoted string', () => {
      // A regex that swaps quote characters corrupts exactly this value.
      expect(parsePythonLiteral("['bachelor\\'s degree']")).toEqual(["bachelor's degree"]);
    });

    it('reads a double-quoted string containing an apostrophe', () => {
      expect(parsePythonLiteral('["bachelor\'s degree"]')).toEqual(["bachelor's degree"]);
    });

    it('maps None to null inside a structure', () => {
      expect(parsePythonLiteral("{'proficiency': None}")).toEqual({ proficiency: null });
    });

    it('accepts a trailing comma', () => {
      expect(parsePythonLiteral("['a', 'b',]")).toEqual(['a', 'b']);
    });

    it('reads a tuple as a list', () => {
      expect(parsePythonLiteral("('a', 'b')")).toEqual(['a', 'b']);
    });
  });

  describe('real cells from the dataset', () => {
    it.each(Object.keys(CELLS))('parses the %s cell', (key) => {
      expect(() => parsePythonLiteral(CELLS[key])).not.toThrow();
    });

    it('reads a list of email objects', () => {
      const value = parsePythonLiteral(CELLS.list_of_dicts) as { address: string; type: string }[];
      expect(value[0]).toEqual({ address: 'j3holland@yahoo.com', type: 'personal' });
    });

    it('reads a bare dict', () => {
      const value = parsePythonLiteral(CELLS.bare_dict) as Record<string, unknown>;
      expect(value.status).toBe('updated');
      expect(value.current_version).toBe('13.0');
    });

    it('reads an empty list', () => {
      expect(parsePythonLiteral(CELLS['empty_[]'])).toEqual([]);
    });
  });

  describe('escape sequences', () => {
    it('reads a \\x byte escape', () => {
      expect(parsePythonLiteral("'caf\\xe9'")).toBe('caf\u00e9');
    });

    it('reads a \\u code point escape', () => {
      expect(parsePythonLiteral("'caf\\u00e9'")).toBe('caf\u00e9');
    });

    it('reads the C escapes Python shares with JSON', () => {
      expect(parsePythonLiteral("'a\\nb\\tc\\rd\\be\\ff\\vg\\0h'")).toBe('a\nb\tc\rd\be\ff\vg\0h');
    });

    it('keeps an unknown escape verbatim, as Python does', () => {
      // A Windows path in a free-text cell: "\d" is not an escape and must survive as two characters.
      expect(parsePythonLiteral("'C:\\data'")).toBe('C:\\data');
    });

    it('keeps a short \\x escape verbatim rather than reading past the quote', () => {
      expect(parsePythonLiteral("'\\xZ9'")).toBe('\\xZ9');
    });

    it('keeps a short \\u escape verbatim rather than reading past the quote', () => {
      expect(parsePythonLiteral("'\\u00e'")).toBe('\\u00e');
    });
  });

  describe('dicts', () => {
    it('reads an empty dict', () => {
      expect(parsePythonLiteral('{}')).toEqual({});
    });

    it('accepts a trailing comma', () => {
      expect(parsePythonLiteral("{'a': 1,}")).toEqual({ a: 1 });
    });

    it('stringifies a non-string key', () => {
      expect(parsePythonLiteral('{1: None, True: None}')).toEqual({ '1': null, true: null });
    });

    it('refuses a key that is a list, which has no sensible property name', () => {
      expect(() => parsePythonLiteral("{['a']: None}")).toThrow('dict key is not a scalar');
    });
  });

  describe('rejection', () => {
    it('rejects an unterminated string', () => {
      expect(() => parsePythonLiteral("'abc")).toThrow(/unterminated string/);
    });

    it('rejects a string that ends on a backslash', () => {
      expect(() => parsePythonLiteral("'abc\\")).toThrow(/dangling escape/);
    });

    it('rejects a sign with no digits behind it', () => {
      expect(() => parsePythonLiteral('+')).toThrow(/malformed number/);
    });

    it('names EOF rather than an empty character when input runs out', () => {
      expect(() => parsePythonLiteral("['a'")).toThrow(/expected '\]' but found 'EOF'/);
    });

    it.each(['[', "{'a': }", "['a' 'b']", 'undefined', "['a'] trailing"])(
      'rejects %s',
      (source) => {
        expect(() => parsePythonLiteral(source)).toThrow(PythonLiteralSyntaxError);
      },
    );

    it('reports where the failure happened', () => {
      expect(() => parsePythonLiteral("['a', ")).toThrow(/offset \d+/);
    });

    it('refuses input nested past the depth limit rather than blowing the stack', () => {
      expect(() => parsePythonLiteral('['.repeat(64) + ']'.repeat(64))).toThrow(PythonLiteralSyntaxError);
    });
  });

  describe('tryParsePythonLiteral', () => {
    it('returns the value on success', () => {
      expect(tryParsePythonLiteral("['a']")).toEqual(['a']);
    });

    it('returns undefined instead of throwing', () => {
      expect(tryParsePythonLiteral('[')).toBeUndefined();
    });
  });
});
