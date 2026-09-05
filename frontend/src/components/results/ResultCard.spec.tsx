/**
 * One result row: who the person is, what the query matched, and how much of the record survived
 * import. The badge and the highlights are part of the card, so they are asserted through it.
 */

import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ProfileSummary } from '@/types/api';
import { renderApp } from '@/test';
import { profile } from '@/test/fixtures';
import { ResultCard } from './ResultCard';

function show(overrides: Partial<ProfileSummary> = {}) {
  return renderApp(
    <ul>
      <ResultCard profile={profile(overrides)} />
    </ul>,
  );
}

describe('ResultCard', () => {
  it('links the name to the profile, escaping the username in the path', () => {
    show({ linkedinUsername: 'ada lovelace/1', fullName: 'ada lovelace' });

    expect(screen.getByRole('link', { name: 'Ada Lovelace' })).toHaveAttribute(
      'href',
      '/profiles/ada%20lovelace%2F1',
    );
  });

  it('falls back to the username when the row carries no name', () => {
    show({ fullName: '', linkedinUsername: 'joeyholland' });

    expect(screen.getByRole('link', { name: 'joeyholland' })).toBeInTheDocument();
  });

  it('reads the role as "title at company"', () => {
    show({ jobTitle: 'head of growth', companyName: 'northwind trading' });

    expect(screen.getByText('Head of Growth at Northwind Trading')).toBeInTheDocument();
  });

  it('leaves the role line out when neither title nor company is known', () => {
    show({ jobTitle: '', companyName: '', location: '', yearsExperience: undefined, industry: '' });

    expect(screen.queryByText(/ at /)).not.toBeInTheDocument();
  });

  it('joins location, experience and industry into one quiet line', () => {
    show({ location: 'denton, texas', yearsExperience: 8, industry: 'marketing' });

    const meta = screen.getByText(/Denton, Texas/);
    expect(meta).toHaveTextContent('8 years');
    expect(meta).toHaveTextContent('Marketing');
  });

  describe('the skills', () => {
    it('shows the first few and offers the rest the summary carried', async () => {
      const skills = Array.from({ length: 9 }, (_unused, index) => `skill ${String(index)}`);
      show({ skills, totalSkills: 9 });

      expect(screen.getAllByText(/^Skill \d$/)).toHaveLength(6);

      await userEvent.click(screen.getByRole('button', { name: '+3 more' }));
      expect(screen.getAllByText(/^Skill \d$/)).toHaveLength(9);
    });

    it('sends the reader to the profile for the skills the summary did not carry', () => {
      show({ skills: ['leadership'], totalSkills: 50 });

      expect(screen.getByRole('link', { name: '+49 more on the profile' })).toHaveAttribute(
        'href',
        expect.stringContaining('/profiles/'),
      );
    });

    it('offers nothing more when the summary already holds them all', () => {
      show({ skills: ['leadership'], totalSkills: 1 });

      expect(screen.queryByText(/more/)).not.toBeInTheDocument();
    });

    it('shows no skill list at all when the row has none', () => {
      const { container } = show({ skills: [], totalSkills: 0 });

      // The outer <ul> in the harness stays; the card must add no list of its own.
      expect(container.querySelectorAll('ul')).toHaveLength(1);
    });
  });

  describe('the data-quality badge', () => {
    it('marks a row the importer had to realign', () => {
      show({ repaired: true, qualityScore: 0.9 });

      expect(screen.getByText('Repaired')).toBeInTheDocument();
    });

    it('marks a sparse record, and says what share of the fields survived', () => {
      show({ repaired: false, qualityScore: 0.3 });

      const badge = screen.getByText('Sparse record');
      expect(badge).toHaveAccessibleName(/only 30% of the expected fields/);
    });

    it('says nothing at all about a clean, full record', () => {
      show({ repaired: false, qualityScore: 0.95 });

      expect(screen.queryByText('Repaired')).not.toBeInTheDocument();
      expect(screen.queryByText('Sparse record')).not.toBeInTheDocument();
    });
  });

  describe('the highlights', () => {
    it('renders the matched run as a mark, never as raw markup', () => {
      show({ highlights: { summary: ['a <em>growth</em> marketer'] } });

      const mark = screen.getByText('growth');
      expect(mark.tagName).toBe('MARK');
      expect(screen.queryByText(/<em>/)).not.toBeInTheDocument();
    });

    it('names the field each fragment came from', () => {
      show({ highlights: { jobTitle: ['<em>head</em> of growth'] } });

      const entry = screen.getByText('jobTitle').closest('div') as HTMLElement;
      expect(within(entry).getByText('head')).toBeInTheDocument();
    });

    it('shows at most two fields, so a card stays a card', () => {
      show({
        highlights: {
          a: ['<em>one</em>'],
          b: ['<em>two</em>'],
          c: ['<em>three</em>'],
        },
      });

      expect(screen.queryByText('three')).not.toBeInTheDocument();
    });

    it('ignores a field the API listed with no fragments', () => {
      show({ highlights: { summary: [] } });

      expect(screen.queryByText('summary')).not.toBeInTheDocument();
    });

    it('shows nothing when the query produced no highlights', () => {
      show({ highlights: undefined });

      expect(screen.queryByRole('definition')).not.toBeInTheDocument();
    });
  });
});
