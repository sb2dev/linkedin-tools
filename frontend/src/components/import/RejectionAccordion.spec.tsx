/** Rejections summarised per reason. A listing of hundreds of lines helps nobody; a shape does. */

import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RejectionGroup } from '@/types/api';
import { renderApp } from '@/test';
import { RejectionAccordion } from './RejectionAccordion';

function group(overrides: Partial<RejectionGroup> = {}): RejectionGroup {
  return {
    reason: 'junk_line',
    label: 'Junk line',
    count: 20,
    samples: [
      { lineNumber: 12, excerpt: '/mnt/dump/part-0001' },
      { lineNumber: 30, excerpt: '/mnt/dump/part-0002' },
    ],
    ...overrides,
  };
}

describe('RejectionAccordion', () => {
  it('renders nothing when the file had no rejections', () => {
    const { container } = renderApp(<RejectionAccordion rejections={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('totals the rejections across every reason', () => {
    renderApp(
      <RejectionAccordion
        rejections={[group({ count: 20 }), group({ reason: 'field_count', label: 'Wrong width', count: 14 })]}
      />,
    );

    expect(screen.getByText('34 in total')).toBeInTheDocument();
  });

  it('keeps the sample lines closed until they are asked for', async () => {
    renderApp(<RejectionAccordion rejections={[group()]} />);

    const toggle = screen.getByRole('button', { name: /Junk line/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('/mnt/dump/part-0001')).not.toBeInTheDocument();

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('/mnt/dump/part-0001')).toBeInTheDocument();
  });

  it('closes the one that was open when it is clicked again', async () => {
    renderApp(<RejectionAccordion rejections={[group()]} />);
    const toggle = screen.getByRole('button', { name: /Junk line/ });

    await userEvent.click(toggle);
    await userEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens one reason at a time', async () => {
    renderApp(
      <RejectionAccordion
        rejections={[group(), group({ reason: 'field_count', label: 'Wrong width' })]}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /Junk line/ }));
    await userEvent.click(screen.getByRole('button', { name: /Wrong width/ }));

    expect(screen.getByRole('button', { name: /Junk line/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: /Wrong width/ })).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows the line number beside each sample, so it can be found in the file', async () => {
    renderApp(<RejectionAccordion rejections={[group()]} />);

    await userEvent.click(screen.getByRole('button', { name: /Junk line/ }));

    const sample = screen.getByText('/mnt/dump/part-0001').closest('li') as HTMLElement;
    expect(within(sample).getByText('line 12')).toBeInTheDocument();
  });

  it('shows a few samples and says how many more there are', async () => {
    const samples = Array.from({ length: 9 }, (_unused, index) => ({
      lineNumber: index + 1,
      excerpt: `excerpt ${String(index + 1)}`,
    }));
    renderApp(<RejectionAccordion rejections={[group({ samples })]} />);

    await userEvent.click(screen.getByRole('button', { name: /Junk line/ }));

    expect(screen.getAllByText(/^excerpt \d+$/)).toHaveLength(3);
    expect(screen.getByText(/and 6 more sample lines/)).toBeInTheDocument();
  });

  it('says so when a reason captured no samples at all', async () => {
    renderApp(<RejectionAccordion rejections={[group({ samples: [] })]} />);

    await userEvent.click(screen.getByRole('button', { name: /Junk line/ }));

    expect(screen.getByText('No sample lines were captured.')).toBeInTheDocument();
  });
});
