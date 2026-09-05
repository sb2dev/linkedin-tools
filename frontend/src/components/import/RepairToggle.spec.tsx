/**
 * Realignment is the reader's decision, so the panel has to price it before they take it: how many
 * rows move, what that changes, and - on the evidence it shows - which cells it rewrites.
 */

import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ImportPreview } from '@/types/api';
import { renderApp } from '@/test';
import { importPreview } from '@/test/fixtures';
import { RepairToggle } from './RepairToggle';

function show(overrides: Partial<ImportPreview> = {}, repair = false) {
  const onRepairChange = vi.fn();
  const view = renderApp(
    <RepairToggle
      preview={{ ...importPreview(), ...overrides }}
      repair={repair}
      onRepairChange={onRepairChange}
    />,
  );
  return { ...view, onRepairChange };
}

/** The fixture: 213 rows scrambled, a provable offset for 133 of them. */
describe('RepairToggle', () => {
  it('offers to move only the rows whose shift can be proved', () => {
    show();

    expect(screen.getByLabelText(/Realign 133 scrambled rows/)).toBeInTheDocument();
    expect(screen.getByText(/213 rows in this file/)).toBeInTheDocument();
  });

  it('starts from the unrepaired reading, so nothing is realigned unless it is asked for', () => {
    show();

    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('reports the choice rather than applying it, because the panel owns the commit', async () => {
    const { onRepairChange } = show();

    await userEvent.click(screen.getByRole('checkbox'));

    expect(onRepairChange).toHaveBeenCalledWith(true);
  });

  it('turns back off again', async () => {
    const { onRepairChange } = show({}, true);

    await userEvent.click(screen.getByRole('checkbox'));

    expect(onRepairChange).toHaveBeenCalledWith(false);
  });

  describe('what it says the repair would change', () => {
    it('names the direction of every count that moves', () => {
      show();

      // 213 -> 80 still scrambled, and 9203 -> 7602 quarantined fields.
      expect(screen.getByText('−133')).toBeInTheDocument();
      expect(screen.getByText('−1,601')).toBeInTheDocument();
    });

    it('says nothing about a count the repair leaves alone', () => {
      // The fixture's profile counts are equal on both sides, so neither may be listed.
      show();

      expect(screen.queryByText(/new profiles/)).not.toBeInTheDocument();
    });

    it('marks a count that goes up with a plus', () => {
      const preview = importPreview();
      show({ countsWithRepair: { ...preview.countsWithRepair, profilesNew: preview.counts.profilesNew + 34 } });

      expect(screen.getByText('+34')).toBeInTheDocument();
    });
  });

  describe('the evidence', () => {
    it('is folded away until it is asked for', () => {
      show();

      expect(screen.queryByText('tim martin')).not.toBeInTheDocument();
    });

    it('shows the columns a sample row would move, old value and new', async () => {
      show();

      await userEvent.click(screen.getByRole('button', { name: /Show what would move/ }));

      expect(screen.getByText(/tim martin/)).toBeInTheDocument();
      // The fixture carries two samples, and both shift the salary column.
      expect(screen.getAllByText('inferred_salary')).toHaveLength(2);
      expect(screen.getByText('I am an Army officer with 2 deployments to Iraq.')).toBeInTheDocument();
    });

    it('reads an emptied cell as "(empty)" rather than as a blank line', async () => {
      show();

      await userEvent.click(screen.getByRole('button', { name: /Show what would move/ }));

      expect(screen.getAllByText('(empty)').length).toBeGreaterThan(0);
    });

    it('folds away again', async () => {
      show();

      await userEvent.click(screen.getByRole('button', { name: /Show what would move/ }));
      await userEvent.click(screen.getByRole('button', { name: /Hide what would move/ }));

      expect(screen.queryByText(/tim martin/)).not.toBeInTheDocument();
    });

    it('signs a forward shift, so the direction of the move is readable', async () => {
      show({
        repairSample: [
          {
            linkedinUsername: 'ada',
            fullName: 'ada lovelace',
            offset: 2,
            before: { skills: '' },
            after: { skills: "['analytical engines']" },
          },
        ],
      });

      await userEvent.click(screen.getByRole('button', { name: /Show what would move/ }));

      expect(screen.getByText(/block shifted by \+2/)).toBeInTheDocument();
      // The cell the repair fills was empty before, and reads as such rather than as a blank line.
      expect(screen.getByText('(empty)')).toBeInTheDocument();
    });

    it('is left out entirely when the preview carried no sample', () => {
      show({ repairSample: [] });

      expect(screen.queryByRole('button', { name: /what would move/ })).not.toBeInTheDocument();
    });
  });

  describe('a file with nothing to realign', () => {
    it('shows no panel at all when no row is scrambled', () => {
      const preview = importPreview();
      const { container } = show({
        counts: { ...preview.counts, scrambledRows: 0 },
        countsWithRepair: { ...preview.countsWithRepair, realignedRows: 0 },
      });

      expect(container).toBeEmptyDOMElement();
    });

    it('says so, and offers nothing to switch on, when no shift can be proved', () => {
      const preview = importPreview();
      show({ countsWithRepair: { ...preview.countsWithRepair, realignedRows: 0 } });

      expect(screen.getByText(/None of them has a shift that can be proved/)).toBeInTheDocument();
      expect(screen.getByRole('checkbox')).toBeDisabled();
    });
  });
});
