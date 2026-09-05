import { useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import {
  formatNumber,
  formatQualityScore,
  formatYears,
  initials,
  joinParts,
  qualityFraction,
  splitHighlight,
  titleCase,
} from '@/lib/format';
import { cardClass, focusRing } from '@/components/layout';
import type { ProfileSummary } from '@/types/api';

interface QualityBadgeProps {
  score: number;
  repaired: boolean;
}

const SPARSE_BELOW = 0.5;

/** Names the damage a profile carries; profiles with none get no badge. */
function QualityBadge({ score, repaired }: QualityBadgeProps): ReactElement | null {
  const sparse = qualityFraction(score) < SPARSE_BELOW;
  if (!repaired && !sparse) return null;

  const reasons: string[] = [];
  if (repaired) reasons.push('a scrambled column block was realigned during import');
  if (sparse) reasons.push(`only ${formatQualityScore(score)} of the expected fields are populated`);

  const label = repaired ? 'Repaired' : 'Sparse record';
  const explanation = `Data quality: ${reasons.join('; ')}.`;

  return (
    <span
      title={explanation}
      aria-label={explanation}
      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line bg-surface px-2 py-0.5 text-xs font-medium text-muted"
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-muted" />
      {label}
    </span>
  );
}

const MAX_FRAGMENTS = 2;

interface HighlightsProps {
  highlights: Record<string, string[]>;
}

/** Fragments render as text nodes with marked runs; the API's markup never reaches the DOM. */
function Highlights({ highlights }: HighlightsProps): ReactElement | null {
  const entries = Object.entries(highlights)
    .filter(([, fragments]) => fragments.length > 0)
    .slice(0, MAX_FRAGMENTS);
  if (entries.length === 0) return null;

  return (
    <dl className="mt-2 space-y-1 border-l-2 border-line pl-3 text-sm text-muted">
      {entries.map(([field, fragments]) => (
        <div key={field} className="flex flex-wrap gap-x-2">
          <dt className="text-xs uppercase tracking-wide text-faint">{field}</dt>
          <dd className="min-w-0 break-words">
            {splitHighlight(fragments[0]).map((part, index) =>
              part.match ? (
                <mark key={index} className="bg-accent/15 text-ink">
                  {part.text}
                </mark>
              ) : (
                <span key={index}>{part.text}</span>
              ),
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

const VISIBLE_SKILLS = 6;

interface ResultCardProps {
  profile: ProfileSummary;
}

export function ResultCard({ profile }: ResultCardProps): ReactElement {
  const [expanded, setExpanded] = useState(false);

  const href = `/profiles/${encodeURIComponent(profile.linkedinUsername)}`;
  const name = titleCase(profile.fullName);
  const role = joinParts(
    [titleCase(profile.jobTitle), titleCase(profile.companyName)].filter((part) => part.length > 0),
    ' at ',
  );
  const meta = joinParts([
    titleCase(profile.location),
    formatYears(profile.yearsExperience),
    titleCase(profile.industry),
  ]);

  const shown = expanded ? profile.skills : profile.skills.slice(0, VISIBLE_SKILLS);
  // Expanding can only reveal the skills the summary carried; the rest live on the profile page.
  const expandable = profile.skills.length - shown.length;
  const onlyOnProfile = Math.max(0, profile.totalSkills - profile.skills.length);

  return (
    <li className={clsx(cardClass, 'p-4')}>
      <div className="flex gap-3">
        <span
          aria-hidden="true"
          className="hidden size-10 shrink-0 select-none items-center justify-center rounded-full bg-accent/10 text-sm font-semibold text-accent sm:flex"
        >
          {initials(profile.fullName)}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <h3 className="min-w-0 text-base font-semibold">
              <Link to={href} className={clsx('break-words text-ink hover:text-accent hover:underline', focusRing)}>
                {name || profile.linkedinUsername}
              </Link>
            </h3>
            <QualityBadge score={profile.qualityScore} repaired={profile.repaired} />
          </div>

          {role.length > 0 ? <p className="mt-0.5 break-words text-sm text-ink">{role}</p> : null}
          {meta.length > 0 ? <p className="mt-0.5 break-words text-sm text-muted">{meta}</p> : null}

          {shown.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {shown.map((skill) => (
                <li
                  key={skill}
                  className="rounded-md border border-line bg-surface px-2 py-0.5 text-xs text-muted"
                >
                  {titleCase(skill)}
                </li>
              ))}
              {expandable > 0 ? (
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setExpanded(true);
                    }}
                    className={clsx('rounded-md px-2 py-0.5 text-xs font-medium text-accent hover:underline', focusRing)}
                  >
                    +{formatNumber(expandable)} more
                  </button>
                </li>
              ) : onlyOnProfile > 0 ? (
                <li>
                  <Link
                    to={href}
                    className={clsx('rounded-md px-2 py-0.5 text-xs font-medium text-accent hover:underline', focusRing)}
                  >
                    +{formatNumber(onlyOnProfile)} more on the profile
                  </Link>
                </li>
              ) : null}
            </ul>
          ) : null}

          {profile.highlights ? <Highlights highlights={profile.highlights} /> : null}
        </div>
      </div>
    </li>
  );
}
