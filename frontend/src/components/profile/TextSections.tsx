import type { ReactElement } from 'react';
import { formatNumber, readLanguage, titleCase } from '@/lib/format';
import { ClampedText, CollapsibleSection, ProfileSection } from '@/components/profile/ProfileSection';
import type { SourceEntry } from '@/types/api';

const ABOUT_LIMIT = 280;
const VISIBLE_SKILLS = 5;

export function ProfileAbout({ text }: { text: string }): ReactElement {
  return (
    <ProfileSection title="About">
      <ClampedText text={text} limit={ABOUT_LIMIT} />
    </ProfileSection>
  );
}

/** The source gives a skill nothing but its name, so the list is plain rows. */
export function SkillsSection({ skills }: { skills: string[] }): ReactElement | null {
  if (skills.length === 0) return null;
  const count = formatNumber(skills.length);

  return (
    <CollapsibleSection
      title={`Skills (${count})`}
      items={skills}
      limit={VISIBLE_SKILLS}
      moreLabel={`Show all ${count} skills`}
    >
      {(shown) => (
        <ul className="divide-y divide-line">
          {shown.map((skill) => (
            <li key={skill} className="py-3 text-base font-semibold text-ink first:pt-0 last:pb-0">
              {titleCase(skill)}
            </li>
          ))}
        </ul>
      )}
    </CollapsibleSection>
  );
}

/** Interests arrive as plain strings, which reads as one line of separated names. */
export function InterestsSection({ interests }: { interests: string[] }): ReactElement | null {
  if (interests.length === 0) return null;

  return (
    <ProfileSection title="Interests">
      <p className="text-sm text-ink">{interests.map((interest) => titleCase(interest)).join(' • ')}</p>
    </ProfileSection>
  );
}

/** A language carries a name and at most a proficiency, which also reads as one line. */
export function LanguagesSection({ entries }: { entries: SourceEntry[] }): ReactElement | null {
  if (entries.length === 0) return null;

  return (
    <ProfileSection title="Languages">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {entries.map((entry, index) => {
          const item = readLanguage(entry);
          return (
            <li key={index} className="text-ink">
              {item.name ?? 'Unspecified'}
              {item.proficiency === undefined ? null : (
                <span className="text-muted"> ({item.proficiency})</span>
              )}
            </li>
          );
        })}
      </ul>
    </ProfileSection>
  );
}
