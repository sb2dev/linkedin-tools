/** The typeahead behind every large filter. */

import { SALARY_BAND_ORDER, SENIORITY_ORDER } from '../domain/search/field-registry';
import { UnknownFilterFieldError } from '../domain/search/search-criteria';
import { FakeProfileSearch } from 'src/test/fakes';
import {
  DEFAULT_SUGGESTION_LIMIT,
  MAX_SUGGESTION_LIMIT,
  NotSuggestableFieldError,
  SuggestValuesUseCase,
} from './suggest-values.use-case';

function useCase(suggestions: readonly string[] = []) {
  const search = new FakeProfileSearch();
  search.suggestions = suggestions;
  return { search, subject: new SuggestValuesUseCase(search) };
}

describe('fields that cannot be completed', () => {
  it('refuses a key the registry does not know, without asking the cluster', async () => {
    const { search, subject } = useCase();

    await expect(subject.execute('twitterUsername', 'a')).rejects.toBeInstanceOf(
      UnknownFilterFieldError,
    );
    expect(search.journal).toEqual([]);
  });

  it.each(['yearsExperience', 'connections', 'graduationYear', 'hasGithub', 'qualityScore'])(
    'refuses %s, which holds no text to complete',
    async (key) => {
      const { search, subject } = useCase();

      await expect(subject.execute(key, '2')).rejects.toBeInstanceOf(NotSuggestableFieldError);
      expect(search.journal).toEqual([]);
    },
  );

  it('names the field in the refusal, so the client can say which input failed', async () => {
    const { subject } = useCase();

    const error = await subject
      .execute('yearsExperience', '5')
      .then(() => undefined)
      .catch((thrown: unknown) => thrown);

    expect((error as NotSuggestableFieldError).key).toBe('yearsExperience');
  });
});

describe('a closed vocabulary', () => {
  it('is answered from the registry, not from what the corpus happens to contain', async () => {
    const { search, subject } = useCase(['should not be used']);

    const values = await subject.execute('salaryBand', '1');

    expect(values).toEqual(['100,000-150,000', '150,000-250,000']);
    expect(search.journal).toEqual([]);
  });

  it('offers a band nobody in the corpus has yet, which is the point of not asking the index', async () => {
    const { subject } = useCase([]);

    await expect(subject.execute('companySize', '10001')).resolves.toEqual(['10001+']);
  });

  it('comes back in its natural order rather than alphabetically', async () => {
    const { subject } = useCase();

    const values = await subject.execute('salaryBand', '', SALARY_BAND_ORDER.length);

    expect(values).toEqual(SALARY_BAND_ORDER);
  });

  it('matches a capitalised prefix, since the corpus is entirely lower case', async () => {
    const { subject } = useCase();

    await expect(subject.execute('seniority', 'Dir')).resolves.toEqual(['director']);
  });

  it('returns nothing rather than everything when the prefix matches no value', async () => {
    const { subject } = useCase();

    await expect(subject.execute('seniority', 'zz')).resolves.toEqual([]);
  });

  it('is capped by the limit like any other answer', async () => {
    const { subject } = useCase();

    await expect(subject.execute('seniority', '', 3)).resolves.toEqual(
      SENIORITY_ORDER.slice(0, 3),
    );
  });
});

describe('what reaches the index', () => {
  it('sends the field key rather than the document path, so the adapter owns the mapping', async () => {
    const { search, subject } = useCase(['head of growth']);

    await subject.execute('jobTitle', 'head');

    expect(search.suggestCalls[0]?.fieldKey).toBe('jobTitle');
  });

  it('lower-cases and trims the prefix before it is sent', async () => {
    const { search, subject } = useCase();

    await subject.execute('companyName', '  Northwind Trading  ');

    expect(search.suggestCalls[0]?.prefix).toBe('northwind trading');
  });

  it('sends a blank prefix through rather than refusing, so an empty box still opens the list', async () => {
    const { search, subject } = useCase(['a', 'b']);

    await expect(subject.execute('skills', '   ')).resolves.toEqual(['a', 'b']);
    expect(search.suggestCalls[0]?.prefix).toBe('');
  });

  it('passes the index answer straight back, since the adapter has already ordered it', async () => {
    const { subject } = useCase(['java', 'javascript', 'jakarta ee']);

    await expect(subject.execute('skills', 'ja')).resolves.toEqual([
      'java',
      'javascript',
      'jakarta ee',
    ]);
  });
});

describe('the limit', () => {
  it.each([
    ['is defaulted when absent', undefined, DEFAULT_SUGGESTION_LIMIT],
    ['is defaulted when not a number', Number.NaN, DEFAULT_SUGGESTION_LIMIT],
    ['is defaulted when unbounded', Number.POSITIVE_INFINITY, DEFAULT_SUGGESTION_LIMIT],
    ['is capped so one request cannot ask for the whole vocabulary', 5000, MAX_SUGGESTION_LIMIT],
    ['is raised to one rather than asking for nothing', 0, 1],
    ['is raised to one rather than going negative', -20, 1],
    ['is floored rather than sent as a fraction', 7.9, 7],
  ])('%s', async (_name, requested, expected) => {
    const { search, subject } = useCase();

    await subject.execute('skills', 'ja', requested);

    expect(search.suggestCalls[0]?.limit).toBe(expected);
  });
});
