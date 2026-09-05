import type { ReactElement, ReactNode } from 'react';
import clsx from 'clsx';
import {
  absoluteUrl,
  formatDateRange,
  formatDuration,
  formatPartialDate,
  joinParts,
  readCertification,
  readEducation,
  readExperience,
  titleCase,
} from '@/lib/format';
import { buttonClass, focusRing } from '@/components/layout';
import { Monogram } from '@/components/profile/Avatar';
import { ClampedText, CollapsibleSection, ProfileSection } from '@/components/profile/ProfileSection';
import type { SourceEntry } from '@/types/api';

const VISIBLE_ROLES = 5;

/** A role description is a supporting note, so it is cut shorter than the About summary. */
const DESCRIPTION_LIMIT = 220;

interface EntryRowProps {
  /** The organisation the mark stands for: the export carries no logos to show instead. */
  organisation: string;
  /** Schools read as a round mark, employers and issuers as a square one. */
  round: boolean;
  /** A rule above the row, running the full width of the card's content. */
  divided: boolean;
  title: string;
  subtitle: string;
  /** The quieter lines under the subtitle: dates, place, whatever else the row carries. */
  lines: (string | undefined)[];
  children?: ReactNode;
}

/** A row in Experience, Education or Licenses, all of which share a shape. */
function EntryRow({ organisation, round, divided, title, subtitle, lines, children }: EntryRowProps): ReactElement {
  const quiet = lines.filter((line): line is string => line !== undefined && line.length > 0);

  return (
    <li className={clsx('flex gap-2 pb-4 last:pb-0', divided && 'border-t border-line pt-3')}>
      <Monogram name={organisation} className={clsx('size-12 text-base', round ? 'rounded-full' : 'rounded')} />

      <div className="min-w-0 flex-1">
        <p className="break-words text-base font-semibold text-ink">{title}</p>
        {subtitle.length > 0 ? <p className="break-words text-sm text-ink">{subtitle}</p> : null}
        {quiet.map((line, index) => (
          <p key={index} className="break-words text-sm text-muted">
            {line}
          </p>
        ))}
        {children}
      </div>
    </li>
  );
}

/** Current roles first, then most recent start date; undated entries sink to the bottom. */
function byRecency(left: SourceEntry, right: SourceEntry): number {
  const a = readExperience(left);
  const b = readExperience(right);
  if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
  return (b.start ?? '').localeCompare(a.start ?? '');
}

export function ExperienceSection({ entries }: { entries: SourceEntry[] }): ReactElement | null {
  if (entries.length === 0) return null;
  const ordered = [...entries].sort(byRecency);

  return (
    <CollapsibleSection
      title="Experience"
      items={ordered}
      limit={VISIBLE_ROLES}
      moreLabel={`Show all ${String(ordered.length)} roles`}
    >
      {(shown) => (
        <ol>
          {shown.map((entry, index) => {
            const item = readExperience(entry);
            return (
              <EntryRow
                key={index}
                organisation={item.company ?? item.title ?? ''}
                round={false}
                divided={index > 0}
                title={titleCase(item.title) || 'Unspecified role'}
                // The industry sits where a profile would put the employment type.
                subtitle={joinParts([item.company, item.companyIndustry], ' · ')}
                lines={[
                  joinParts([formatDateRange(item.start, item.end), formatDuration(item.start, item.end)], ' · '),
                  item.location,
                  item.levels.length > 0 ? `Level: ${item.levels.join(', ')}` : undefined,
                ]}
              >
                {item.summary === undefined ? null : (
                  <ClampedText text={item.summary} limit={DESCRIPTION_LIMIT} className="mt-2" />
                )}
              </EntryRow>
            );
          })}
        </ol>
      )}
    </CollapsibleSection>
  );
}

export function EducationSection({ entries }: { entries: SourceEntry[] }): ReactElement | null {
  if (entries.length === 0) return null;

  return (
    <ProfileSection title="Education">
      <ol>
        {entries.map((entry, index) => {
          const item = readEducation(entry);
          return (
            <EntryRow
              key={index}
              organisation={item.school ?? ''}
              round
              divided={index > 0}
              title={item.school ?? 'Unspecified school'}
              // A profile reads the qualification as one line: the degree, then what it was in.
              subtitle={joinParts([item.degrees.join(', '), item.majors.join(', ')])}
              lines={[
                joinParts([formatDateRange(item.start, item.end), formatDuration(item.start, item.end)], ' · '),
                item.minors.length > 0 ? `Minor: ${item.minors.join(', ')}` : undefined,
                item.gpa === undefined ? undefined : `GPA ${item.gpa}`,
              ]}
            />
          );
        })}
      </ol>
    </ProfileSection>
  );
}

const CREDENTIAL_KEYS = ['url', 'credential_url'];

/** "Issued Aug 2020", from a source date that may be a bare year or missing altogether. */
function stamp(prefix: string, value: string | undefined): string | undefined {
  const when = formatPartialDate(value);
  return when === undefined ? undefined : `${prefix} ${when}`;
}

/** Most certification entries carry no link at all, so the control appears only when one does. */
function credentialUrl(entry: SourceEntry): string | undefined {
  for (const key of CREDENTIAL_KEYS) {
    const value = entry[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

export function CertificationsSection({ entries }: { entries: SourceEntry[] }): ReactElement | null {
  if (entries.length === 0) return null;

  return (
    <ProfileSection title="Licenses & certifications">
      <ol>
        {entries.map((entry, index) => {
          const item = readCertification(entry);
          const credential = credentialUrl(entry);
          return (
            <EntryRow
              key={index}
              organisation={item.organization ?? item.name ?? ''}
              round={false}
              divided={index > 0}
              title={item.name ?? 'Unnamed certification'}
              subtitle={item.organization ?? ''}
              lines={[joinParts([stamp('Issued', item.start), stamp('Expires', item.end)], ' · ')]}
            >
              {credential === undefined ? null : (
                <a
                  href={absoluteUrl(credential)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className={clsx(buttonClass, 'mt-2', focusRing)}
                >
                  Show credential
                  <span aria-hidden="true">↗</span>
                </a>
              )}
            </EntryRow>
          );
        })}
      </ol>
    </ProfileSection>
  );
}
