import { Fragment, useState, type ReactElement } from 'react';
import clsx from 'clsx';
import { cardClass, focusRing, primaryButtonClass, secondaryButtonClass } from '@/components/layout';
import { ContactPanel } from '@/components/profile/ContactPanel';
import { Monogram, PersonAvatar, bannerBackground } from '@/components/profile/Avatar';
import {
  affiliationsOf,
  countsOf,
  headlineOf,
  linksOf,
  type Affiliation,
} from '@/components/profile/header-fields';
import { formatLocation, titleCase } from '@/lib/format';
import type { ProfileDetail } from '@/types/api';

/** The employer and the school, in the column to the right of the name. */
function Affiliations({ affiliations }: { affiliations: Affiliation[] }): ReactElement | null {
  if (affiliations.length === 0) return null;

  return (
    <ul className="w-full shrink-0 space-y-3 sm:w-56">
      {affiliations.map((affiliation) => (
        <li key={affiliation.name} className="flex items-center gap-2.5">
          <Monogram
            name={affiliation.name}
            label={affiliation.name.charAt(0)}
            className={clsx('size-7 text-xs', affiliation.round ? 'rounded-full' : 'rounded')}
          />
          <span className="truncate text-sm font-semibold text-ink">{affiliation.name}</span>
        </li>
      ))}
    </ul>
  );
}

/** The disclosure that opens the contact panel. */
function ContactToggle({
  open,
  onToggle,
  className,
}: {
  open: boolean;
  onToggle: () => void;
  className: string;
}): ReactElement {
  return (
    <button type="button" onClick={onToggle} aria-expanded={open} className={clsx(className, focusRing)}>
      Contact info
    </button>
  );
}

export function ProfileHeader({ profile }: { profile: ProfileDetail }): ReactElement {
  const [contactOpen, setContactOpen] = useState(false);

  const name = titleCase(profile.person.fullName);
  const headline = headlineOf(profile);
  const place = formatLocation(profile.location);
  const counts = countsOf(profile);
  const links = linksOf(profile);
  const contact = profile.contact;

  const toggleContact = (): void => {
    setContactOpen(!contactOpen);
  };

  return (
    <header className={clsx(cardClass, 'overflow-hidden')}>
      {/* Where a cover photo would sit. The export carries no images, so the strip is drawn from
          the name, which keeps two profiles from opening on the same colour. */}
      <div
        aria-hidden="true"
        className="aspect-[4/1] max-h-50 w-full"
        style={{ background: bannerBackground(name) }}
      />

      <div className="px-4 pb-6 sm:px-6">
        {/* Straddles the strip above it, ringed in the card colour so it reads as a cut-out. */}
        <PersonAvatar
          className="-mt-12 size-24 border-4 border-card bg-card sm:-mt-24 sm:size-40"
        />

        <div className="mt-4 flex flex-col gap-x-8 gap-y-5 sm:mt-8 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold leading-tight text-ink">{name}</h1>

            {headline.length === 0 ? null : (
              <p className="mt-1 text-base leading-tight text-ink">{headline}</p>
            )}

            {place.length === 0 && contact === undefined ? null : (
              <p className="mt-1 text-sm text-muted">
                {place.length === 0 ? null : place}
                {place.length > 0 && contact !== undefined ? ' · ' : null}
                {contact === undefined ? null : (
                  <ContactToggle
                    open={contactOpen}
                    onToggle={toggleContact}
                    className="font-semibold text-accent hover:underline"
                  />
                )}
              </p>
            )}

            {counts.length === 0 ? null : (
              <p className="mt-1.5 text-sm text-muted">
                {counts.map((count, index) => (
                  <Fragment key={count.unit}>
                    {index === 0 ? null : ' · '}
                    <span className="font-semibold">{count.value}</span> {count.unit}
                  </Fragment>
                ))}
              </p>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              {links.map((link, index) => (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className={clsx(index === 0 ? primaryButtonClass : secondaryButtonClass, focusRing)}
                >
                  {link.label}
                </a>
              ))}
              {contact === undefined ? null : (
                <ContactToggle
                  open={contactOpen}
                  onToggle={toggleContact}
                  className={secondaryButtonClass}
                />
              )}
            </div>

            {contact !== undefined && contactOpen ? <ContactPanel contact={contact} /> : null}
          </div>

          <Affiliations affiliations={affiliationsOf(profile)} />
        </div>
      </div>
    </header>
  );
}
