/** What the header card reads off a profile record. */

import {
  absoluteUrl,
  formatNumber,
  formatYears,
  readEducation,
  readExperience,
  titleCase,
} from '@/lib/format';
import type { ProfileDetail } from '@/types/api';

/** The line under the name is the person's job title. */
export function headlineOf(profile: ProfileDetail): string {
  const stated = titleCase(profile.job?.title);
  if (stated.length > 0) return stated;

  const held = primaryRole(profile)?.title ?? '';
  return held.length > 0 ? held : titleCase(profile.job?.industry);
}

/** The role the export marked current. Records often leave `job` empty and say it here instead. */
function primaryRole(profile: ProfileDetail): ReturnType<typeof readExperience> | undefined {
  return (profile.experience ?? []).map(readExperience).find((entry) => entry.isPrimary);
}

export interface Count {
  value: string;
  unit: string;
}

/** The numbers a profile leads with. */
export function countsOf(profile: ProfileDetail): Count[] {
  const counts: Count[] = [];

  const connections = profile.metrics?.connections;
  if (connections !== undefined && connections > 0) {
    counts.push({ value: formatNumber(connections), unit: 'connections' });
  }

  const years = formatYears(profile.metrics?.yearsExperience);
  if (years !== undefined) counts.push({ value: years, unit: 'of experience' });

  return counts;
}

export interface Affiliation {
  name: string;
  /** A school reads as a round mark and an employer as a square one, as in the entry lists below. */
  round: boolean;
}

/** The employer and the school: what a profile pins in the column beside the name. */
export function affiliationsOf(profile: ProfileDetail): Affiliation[] {
  const employer =
    titleCase(profile.job?.company?.name) || titleCase(primaryRole(profile)?.company);
  const school = (profile.education ?? []).map(readEducation).find((entry) => entry.school !== undefined);

  return [
    { name: employer, round: false },
    { name: school?.school ?? '', round: true },
  ].filter((entry) => entry.name.length > 0);
}

export interface ProfileLink {
  label: string;
  href: string;
}

function reachable(href?: string): href is string {
  return href !== undefined && href.trim().length > 0;
}

/** Every destination the record can actually reach, in the order the buttons are drawn. */
export function linksOf(profile: ProfileDetail): ProfileLink[] {
  const social = profile.social;
  const candidates: ProfileLink[] = [];

  const push = (label: string, href?: string): void => {
    if (reachable(href)) candidates.push({ label, href: absoluteUrl(href) });
  };

  push('LinkedIn profile', profile.identity.linkedinUrl);
  push('Company website', profile.job?.company?.website);
  push('GitHub', social?.githubUrl);
  push('Twitter', social?.twitterUrl);
  push('Facebook', social?.facebookUrl);

  return candidates;
}
