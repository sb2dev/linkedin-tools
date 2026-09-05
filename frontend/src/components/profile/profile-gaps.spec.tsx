/**
 * The paths through the profile screen a full record never takes: a missing headline, a person with
 * no place, a certification that carries a credential link, and the signed-in header.
 */

import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { setAccessToken } from '@/api/client';
import { useAuthStore } from '@/hooks/use-auth';
import { renderApp } from '@/test';
import { profileDetail } from '@/test/fixtures';
import { AppShell } from '@/components/layout';
import { CertificationsSection } from './EntrySections';
import { ProfileHeader } from './ProfileHeader';
import { affiliationsOf, headlineOf } from './header-fields';

describe('headlineOf', () => {
  it('prefers the stated job title', () => {
    expect(headlineOf(profileDetail({ job: { title: 'head of growth' } }))).toBe(
      'Head of Growth',
    );
  });

  it('falls back to the title of the primary role', () => {
    const profile = profileDetail({
      job: undefined,
      experience: [{ is_primary: true, title: { name: 'recruiting manager' } }],
    });

    expect(headlineOf(profile)).toContain('ecruiting');
  });

  it('falls back to the industry when no title survived at all', () => {
    const profile = profileDetail({
      job: { industry: 'marketing' },
      experience: [],
    });

    expect(headlineOf(profile)).toBe('Marketing');
  });
});

describe('affiliationsOf', () => {
  it('takes the employer from the primary role when the job block names none', () => {
    const profile = profileDetail({
      job: {},
      experience: [{ is_primary: true, company: { name: 'garver' } }],
    });

    expect(affiliationsOf(profile).map((entry) => entry.name)).toContain('Garver');
  });

  it('reports nothing when there is neither an employer nor a school', () => {
    const profile = profileDetail({
      job: {},
      experience: [],
      education: [],
    });

    expect(affiliationsOf(profile)).toEqual([]);
  });
});

describe('ProfileHeader', () => {
  it('leaves the place line out when there is no place and no contact', () => {
    renderApp(
      <ProfileHeader profile={profileDetail({ location: undefined, contact: undefined })} />,
    );

    expect(screen.queryByRole('button', { name: 'Contact info' })).not.toBeInTheDocument();
  });

  it('shows the contact control on its own when the record names no place', () => {
    renderApp(
      <ProfileHeader
        profile={profileDetail({
          location: undefined,
          contact: { emails: [{ address: 'a@b.test' }] },
        })}
      />,
    );

    expect(screen.getAllByRole('button', { name: 'Contact info' }).length).toBeGreaterThan(0);
  });
});

describe('CertificationsSection', () => {
  it('offers the credential when the entry carries a link', () => {
    renderApp(
      <CertificationsSection
        entries={[{ name: 'PMP', organization: 'PMI', url: 'credly.com/badge/1' }]}
      />,
    );

    expect(screen.getByRole('link', { name: /Show credential/ })).toHaveAttribute(
      'href',
      'https://credly.com/badge/1',
    );
  });

  it('offers none when it does not', () => {
    renderApp(<CertificationsSection entries={[{ name: 'PMP', organization: 'PMI' }]} />);

    expect(screen.queryByRole('link', { name: /Show credential/ })).not.toBeInTheDocument();
  });

  it('renders nothing at all with no entries', () => {
    const { container } = renderApp(<CertificationsSection entries={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe('AppShell', () => {
  it('says nothing about sign-in while signed out', () => {
    useAuthStore.setState({ token: null, username: null, error: null, pending: false });
    renderApp(<AppShell />);

    expect(screen.queryByText('Signed in')).not.toBeInTheDocument();
  });

  it('marks the header once a token is held', () => {
    setAccessToken('a-token');
    useAuthStore.setState({ token: 'a-token', username: 'admin', error: null, pending: false });
    renderApp(<AppShell />);

    expect(screen.getByText('Signed in')).toBeInTheDocument();
  });

  it('offers a skip link before the navigation', () => {
    renderApp(<AppShell />);

    const skip = screen.getByRole('link', { name: 'Skip to content' });
    expect(skip).toHaveAttribute('href', '#content');
    expect(within(screen.getByRole('main')).queryByRole('link', { name: 'Skip to content' })).toBeNull();
  });
});
