/** The card shapes the profile page is built from: a section, a collapsible one, and clamped prose. */

import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '@/test';
import { ClampedText, CollapsibleSection, ProfileSection } from './ProfileSection';

describe('ProfileSection', () => {
  it('gives the card a heading and its content', () => {
    renderApp(
      <ProfileSection title="About">
        <p>the bio</p>
      </ProfileSection>,
    );

    expect(screen.getByRole('heading', { name: 'About' })).toBeInTheDocument();
    expect(screen.getByText('the bio')).toBeInTheDocument();
  });

  it('draws a footer only when one is given', () => {
    const { rerender } = renderApp(
      <ProfileSection title="About">
        <p>x</p>
      </ProfileSection>,
    );
    expect(screen.queryByText('a control')).not.toBeInTheDocument();

    rerender(
      <ProfileSection title="About" footer={<span>a control</span>}>
        <p>x</p>
      </ProfileSection>,
    );
    expect(screen.getByText('a control')).toBeInTheDocument();
  });
});

describe('CollapsibleSection', () => {
  const items = ['a', 'b', 'c', 'd'];
  const list = (shown: string[]) => (
    <ul>
      {shown.map((entry) => (
        <li key={entry}>{entry}</li>
      ))}
    </ul>
  );

  it('shows the first few and keeps the rest behind a control', async () => {
    renderApp(
      <CollapsibleSection title="Skills" items={items} limit={2} moreLabel="Show all 4 skills">
        {list}
      </CollapsibleSection>,
    );

    expect(screen.getAllByRole('listitem')).toHaveLength(2);

    await userEvent.click(screen.getByRole('button', { name: /Show all 4 skills/ }));
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
  });

  it('collapses again, and says so on the control', async () => {
    renderApp(
      <CollapsibleSection title="Skills" items={items} limit={2} moreLabel="Show all">
        {list}
      </CollapsibleSection>,
    );

    await userEvent.click(screen.getByRole('button', { name: /Show all/ }));
    await userEvent.click(screen.getByRole('button', { name: /Show less/ }));

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('offers no control when everything already fits', () => {
    renderApp(
      <CollapsibleSection title="Skills" items={['a']} limit={5} moreLabel="Show all">
        {list}
      </CollapsibleSection>,
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('ClampedText', () => {
  const long = 'a bio that runs on and on and needs cutting somewhere sensible';

  it('shows short prose whole, with no control', () => {
    renderApp(<ClampedText text="short" limit={100} />);

    expect(screen.getByText('short')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('cuts long prose at a word boundary and offers the rest', async () => {
    renderApp(<ClampedText text={long} limit={20} />);

    const paragraph = screen.getByRole('button').parentElement as HTMLElement;
    expect(paragraph.textContent).toContain('…');
    expect(paragraph.textContent).not.toContain('sensible');

    await userEvent.click(screen.getByRole('button', { name: 'more' }));
    expect(screen.getByRole('button').parentElement).toHaveTextContent('sensible');
  });

  it('folds back up again', async () => {
    renderApp(<ClampedText text={long} limit={20} />);

    await userEvent.click(screen.getByRole('button', { name: 'more' }));
    await userEvent.click(screen.getByRole('button', { name: 'less' }));

    expect(screen.getByRole('button').parentElement?.textContent).not.toContain('sensible');
  });

  it('cuts mid-word when the limit falls inside the first word', () => {
    renderApp(<ClampedText text="antidisestablishmentarianism" limit={5} />);

    expect(screen.getByRole('button').parentElement?.textContent).toContain('antid…');
  });
});
