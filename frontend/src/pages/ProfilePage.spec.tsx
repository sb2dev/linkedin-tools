import type { ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { ProfilePage } from './ProfilePage';
import { type FakeReply, type FetchStub, profileDetail, renderApp, stubFetch } from '@/test';
import type { ProfileDetail } from '@/types/api';

let network: FetchStub | undefined;

afterEach(() => {
  network?.restore();
  network = undefined;
});

/** Stands in for the search the reader came from, keeping its query string visible to the test. */
function SearchStub(): ReactElement {
  const location = useLocation();
  return (
    <div>
      <p>Search results</p>
      <output data-testid="url">{location.search}</output>
      <Link to="/profiles/joeyholland">Joseph Holland</Link>
    </div>
  );
}

function routes(): ReactElement {
  return (
    <Routes>
      <Route path="/" element={<SearchStub />} />
      <Route path="/profiles/:username" element={<ProfilePage />} />
    </Routes>
  );
}

function render(reply: FakeReply, username = 'joeyholland'): void {
  network = stubFetch(() => reply);
  renderApp(routes(), { route: `/profiles/${username}` });
}

function show(profile: ProfileDetail = profileDetail()): void {
  render({ body: profile });
}

function section(title: string): HTMLElement {
  const heading = screen.getByRole('heading', { name: title });
  const found = heading.closest('section');
  if (found === null) throw new Error(`the ${title} heading is not inside a section`);
  return found;
}

describe('ProfilePage', () => {
  it('says who the person is, in readable case, above everything else', async () => {
    show();

    const name = await screen.findByRole('heading', { level: 1 });
    expect(name).toHaveTextContent('Joseph Holland');
    // The line under the name is the person's job title, not the trade their employer is in.
    expect(name.nextElementSibling).toHaveTextContent('Recruiting Manager');
    expect(screen.getByText(/Denton, Texas, United States/)).toBeInTheDocument();
  });

  it('holds a narrower measure than a results table, so the header keeps its proportions', async () => {
    show();
    const heading = await screen.findByRole('heading', { level: 1 });

    // A wider column flattens the banner and stops the headline wrapping under the name.
    const container = heading.closest('div.mx-auto');
    expect(container?.className).toContain('max-w-[52.5rem]');
  });

  it('reads the metrics in the units the dataset uses, not as a grid of raw columns', async () => {
    show();
    await screen.findByRole('heading', { level: 1 });

    // The counts read as a sentence in the header rather than as bare numbers in tiles.
    expect(screen.getByText('1,247').closest('p')).toHaveTextContent(
      '1,247 connections · 12 years of experience',
    );
    expect(screen.queryByText('$85k-100k')).not.toBeInTheDocument();
    expect(screen.queryByText('Inferred salary')).not.toBeInTheDocument();
    expect(screen.queryByText('Gender')).not.toBeInTheDocument();
  });

  it('keeps personal contact details hidden until they are asked for', async () => {
    const user = userEvent.setup();
    show();
    await screen.findByRole('heading', { level: 1 });

    expect(screen.queryByText(/joeyholland@gmail\.com/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\+19405550143/)).not.toBeInTheDocument();

    // The header carries the disclosure, on the grey line and again in the button row.
    await user.click(screen.getAllByRole('button', { name: 'Contact info' })[0]);

    expect(screen.getByText('joeyholland@gmail.com')).toBeInTheDocument();
    expect(screen.getByText('+19405550143')).toBeInTheDocument();
    expect(screen.getByText('joseph.holland@garverusa.com')).toBeInTheDocument();
  });

  it('offers no contact control at all when the API withheld the details', async () => {
    show(profileDetail({ contact: undefined }));
    await screen.findByRole('heading', { level: 1 });

    expect(screen.queryByRole('button', { name: 'Contact info' })).not.toBeInTheDocument();
  });

  it('puts the current role first and the rest in most recent order', async () => {
    show();
    await screen.findByRole('heading', { level: 1 });

    const roles = within(section('Experience'))
      .getAllByRole('listitem')
      .map((entry) => entry.textContent ?? '');

    expect(roles[0]).toContain('Recruiting Manager');
    // The open end of the current role is what marks it, the way a profile prints it.
    expect(roles[0]).toContain('Present');
    expect(roles[1]).toContain('Senior Recruiter');
    expect(roles[2]).toContain('Recruiter');
    expect(roles[1]).toContain('Jan 2012 – Feb 2017');
  });

  it('reads an experience entry written in the export\'s own snake_case keys', async () => {
    show();
    await screen.findByRole('heading', { level: 1 });

    const current = within(section('Experience')).getAllByRole('listitem')[0];
    expect(current).toHaveTextContent('Garver');
    expect(current).toHaveTextContent('Civil Engineering');
    expect(current).toHaveTextContent('North Little Rock, Arkansas, United States');
    expect(current).toHaveTextContent('Mar 2017 – Present');
    expect(current).toHaveTextContent('Level: Manager');
  });

  it('reads a degree, a major and the years from an education entry', async () => {
    show();
    await screen.findByRole('heading', { level: 1 });

    const study = within(section('Education')).getAllByRole('listitem')[0];
    expect(study).toHaveTextContent('University of North Texas');
    // Degree and field run together on one line, the way a profile prints a qualification.
    expect(study).toHaveTextContent('Bachelors, Bachelor of Business Administration, Business Administration');
    expect(study).toHaveTextContent('2004 – 2008');
    // The span is shown beside the dates, because that is what a reader is judging.
    expect(study).toHaveTextContent('4 yrs 1 mo');
  });



  it('says how a repaired row reached the index', async () => {
    show(
      profileDetail({
        quality: { ...profileDetail().quality, repaired: true, drifted: true },
      }),
    );
    await screen.findByRole('heading', { level: 1 });

    expect(screen.getByText('row realigned, column drift detected')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('leaves out every section the record has nothing for', async () => {
    show(
      profileDetail({
        summary: undefined,
        skills: [],
        interests: [],
        experience: [],
        education: [],
        certifications: [],
        languages: [],
        contact: undefined,
      }),
    );
    await screen.findByRole('heading', { level: 1 });

    for (const title of [
      'Summary',
      'Experience',
      'Education',
      'Licenses & certifications',
      'Languages',
      'Interests',
    ]) {
      expect(screen.queryByRole('heading', { name: title })).not.toBeInTheDocument();
    }
    expect(screen.getByRole('heading', { name: 'Data quality' })).toBeInTheDocument();
  });

  it('counts the skills it is showing', async () => {
    show();

    expect(await screen.findByRole('heading', { name: 'Skills (3)' })).toBeInTheDocument();
    expect(within(section('Skills (3)')).getByText('Human Resources')).toBeInTheDocument();
  });

  it('links out to the source profile without leaking the reader back to it', async () => {
    show();
    await screen.findByRole('heading', { level: 1 });

    const link = screen.getByRole('link', { name: 'LinkedIn profile' });
    // The source stores the URL with no scheme.
    expect(link).toHaveAttribute('href', 'https://linkedin.com/in/joeyholland');
    expect(new URL(link.getAttribute('href') ?? '').origin).not.toBe(window.location.origin);
    expect(link).toHaveAttribute('rel', expect.stringContaining('noreferrer'));
  });

  it('says a profile does not exist rather than offering a pointless retry', async () => {
    render({
      status: 404,
      statusText: 'Not Found',
      body: { type: 'about:blank', title: 'Not Found', status: 404, detail: 'No profile with that username.' },
    });

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('No such profile')).toBeInTheDocument();
    expect(within(alert).queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to search' })).toBeInTheDocument();
  });

  it('offers a retry for a failure that might not repeat', async () => {
    render({
      status: 400,
      statusText: 'Bad Request',
      body: { type: 'about:blank', title: 'Bad Request', status: 400, detail: 'That username is not valid.' },
    });

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('That username is not valid.')).toBeInTheDocument();
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('asks the API for the username in the address, encoded', async () => {
    show();
    await screen.findByRole('heading', { level: 1 });

    expect(network?.requests[0].path).toBe('/api/profiles/joeyholland');
  });

  it('a profile opened straight from a link goes back to the search rather than nowhere', async () => {
    const user = userEvent.setup();
    show();
    await screen.findByRole('heading', { level: 1 });

    await user.click(screen.getByRole('button', { name: '← Back to results' }));

    expect(await screen.findByText('Search results')).toBeInTheDocument();
  });
  it('shows a record the source barely filled in without any empty furniture', async () => {
    show(
      profileDetail({
        person: { fullName: 'shoba murali' },
        job: undefined,
        location: undefined,
        social: undefined,
        metrics: undefined,
        summary: undefined,
        skills: undefined,
        interests: undefined,
        experience: undefined,
        education: undefined,
        certifications: undefined,
        languages: undefined,
        contact: undefined,
      }),
    );

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Shoba Murali');
    // The whole header block collapses: no role, no place, and not one fact worth a label.
    expect(screen.queryByText('Industry')).not.toBeInTheDocument();
    expect(screen.queryByText('Experience')).not.toBeInTheDocument();
    expect(screen.queryByText('Connections')).not.toBeInTheDocument();
    expect(screen.queryByText('Inferred salary')).not.toBeInTheDocument();
    expect(screen.queryByText('Company size')).not.toBeInTheDocument();
    expect(screen.queryByText('Gender')).not.toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'LinkedIn profile' })).toBeInTheDocument();
  });

  it('links out to every other account the record carries', async () => {
    show(
      profileDetail({
        social: {
          githubUrl: 'github.com/joeyholland',
          twitterUrl: 'twitter.com/joeyholland',
          facebookUrl: 'facebook.com/joeyholland',
        },
      }),
    );
    await screen.findByRole('heading', { level: 1 });

    expect(screen.getByRole('link', { name: 'GitHub' })).toHaveAttribute('href', 'https://github.com/joeyholland');
    expect(screen.getByRole('link', { name: 'Twitter' })).toHaveAttribute('href', 'https://twitter.com/joeyholland');
    expect(screen.getByRole('link', { name: 'Facebook' })).toHaveAttribute('href', 'https://facebook.com/joeyholland');
    expect(screen.getByRole('link', { name: 'Company website' })).toHaveAttribute(
      'href',
      'https://garverusa.com',
    );

    for (const name of ['GitHub', 'Twitter', 'Facebook', 'Company website']) {
      const href = screen.getByRole('link', { name }).getAttribute('href') ?? '';
      expect(new URL(href).origin).not.toBe(window.location.origin);
    }
  });

  it('leaves a URL that already carries a scheme alone', async () => {
    show(profileDetail({ social: { githubUrl: 'https://github.com/someone' } }));
    await screen.findByRole('heading', { level: 1 });

    expect(screen.getByRole('link', { name: 'GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/someone',
    );
  });

  it('keeps an undated role in the timeline rather than dropping it', async () => {
    show(profileDetail({ experience: [{ company: { name: 'garver' } }, {}] }));
    await screen.findByRole('heading', { level: 1 });

    const timeline = section('Experience');
    const entries = within(timeline).getAllByRole('listitem');
    expect(entries).toHaveLength(2);
    expect(entries[0]).toHaveTextContent('Unspecified role');
    expect(entries[1]).toHaveTextContent('Unspecified role');
    expect(within(timeline).queryByText(/Present/)).not.toBeInTheDocument();
    expect(within(timeline).queryByText(/^Level:/)).not.toBeInTheDocument();
  });

  it('reads a minor and a grade point average, and names a school it has no name for', async () => {
    show(
      profileDetail({
        education: [
          { school: { name: 'university of north texas' }, minors: ['statistics'], gpa: '3.6' },
          {},
        ],
      }),
    );
    await screen.findByRole('heading', { level: 1 });

    const entries = within(section('Education')).getAllByRole('listitem');
    expect(entries[0]).toHaveTextContent('Minor: Statistics');
    expect(entries[0]).toHaveTextContent('GPA 3.6');
    expect(entries[0]).not.toHaveTextContent('Major');
    expect(entries[1]).toHaveTextContent('Unspecified school');
    // Nothing is invented for an entry the source left empty.
    expect(entries[1].textContent).toBe('?Unspecified school');
  });

  it('lists a certification the source gave neither a name, an issuer nor a date', async () => {
    show(profileDetail({ certifications: [{}] }));
    await screen.findByRole('heading', { level: 1 });

    const entry = within(section('Licenses & certifications')).getAllByRole('listitem')[0];
    // The leading character is the mark standing in for the issuer logo, hidden from a screen reader.
    expect(entry.textContent).toBe('?Unnamed certification');
  });

  it('lists a language the source gave neither a name nor a proficiency', async () => {
    show(profileDetail({ languages: [{}] }));
    await screen.findByRole('heading', { level: 1 });

    const entry = within(section('Languages')).getAllByRole('listitem')[0];
    expect(entry.textContent).toBe('Unspecified');
  });

  it('reveals only the kinds of contact detail the record actually holds', async () => {
    const user = userEvent.setup();
    show(profileDetail({ contact: { workEmail: 'joseph.holland@garverusa.com' } }));
    await screen.findByRole('heading', { level: 1 });

    await user.click(screen.getAllByRole('button', { name: 'Contact info' })[0]);

    expect(screen.getByText('Work email')).toBeInTheDocument();
    expect(screen.queryByText('Email')).not.toBeInTheDocument();
    expect(screen.queryByText('Phone')).not.toBeInTheDocument();
  });

  it('counts a mobile number among the phones even when there is no other contact detail', async () => {
    const user = userEvent.setup();
    show(profileDetail({ contact: { mobilePhone: ['+19405550143'] } }));
    await screen.findByRole('heading', { level: 1 });

    await user.click(screen.getAllByRole('button', { name: 'Contact info' })[0]);

    expect(screen.getByText('+19405550143')).toBeInTheDocument();
    expect(screen.queryByText('Work email')).not.toBeInTheDocument();
  });

  it('a profile opened from the results goes back to that search, not to a bare one', async () => {
    const user = userEvent.setup();
    network = stubFetch(() => ({ body: profileDetail() }));
    renderApp(routes(), { route: '/?q=recruiting&page=3' });

    await user.click(screen.getByRole('link', { name: 'Joseph Holland' }));
    await screen.findByRole('heading', { level: 1 });

    await user.click(screen.getByRole('button', { name: '← Back to results' }));

    expect(await screen.findByText('Search results')).toBeInTheDocument();
    expect(screen.getByTestId('url')).toHaveTextContent('?q=recruiting&page=3');
  });

  it('shows the same figure for every person, since the export carries no photographs', async () => {
    show(profileDetail({ person: { fullName: 'cher' } }));
    await screen.findByRole('heading', { level: 1 });

    // One silhouette for everyone: initials would imply the letters mean something.
    expect(document.querySelector('svg[viewBox="0 0 128 128"]')).toBeInTheDocument();
    expect(screen.queryByText('C')).not.toBeInTheDocument();
  });

  it('still draws the avatar for a row that carries no usable name', async () => {
    show(profileDetail({ person: { fullName: '  ' } }));
    await screen.findByRole('heading', { level: 1 });

    expect(document.querySelector('svg[viewBox="0 0 128 128"]')).toBeInTheDocument();
  });

  it('runs the retry it offered rather than only showing the button', async () => {
    const user = userEvent.setup();
    render({
      status: 400,
      statusText: 'Bad Request',
      body: { type: 'about:blank', title: 'Bad Request', status: 400, detail: 'That username is not valid.' },
    });

    const alert = await screen.findByRole('alert');
    const before = network?.requests.length ?? 0;

    await user.click(within(alert).getByRole('button', { name: 'Try again' }));

    await waitFor(() => {
      expect(network?.requests.length ?? 0).toBeGreaterThan(before);
    });
    expect(network?.requests.at(-1)?.path).toBe('/api/profiles/joeyholland');
  });
});
