/** The result-row projection, shared by the search adapter and the import preview. */

import { compact, isFilledString } from 'src/shared/objects';
import { ProfileSummary } from './search-result';

/** What a summary needs, whether it arrives from the index or from a freshly built document. */
export interface ProfileSummarySource {
  readonly linkedinUsername: string;
  readonly fullName: string;
  readonly jobTitle?: string;
  readonly companyName?: string;
  readonly industry?: string;
  readonly locationName?: string;
  readonly locality?: string;
  readonly region?: string;
  readonly country?: string;
  readonly yearsExperience?: number;
  readonly skills?: readonly string[];
  readonly quality?: { readonly score: number; readonly repaired: boolean };
}

/** Enough to show what a person does; the rest is one click away on the profile page. */
const SUMMARY_SKILL_LIMIT = 8;

export function toProfileSummary(
  source: ProfileSummarySource,
  options: { highlights?: Record<string, string[]>; score?: number } = {},
): ProfileSummary {
  const skills = source.skills ?? [];
  return compact({
    linkedinUsername: source.linkedinUsername,
    fullName: source.fullName,
    jobTitle: source.jobTitle,
    companyName: source.companyName,
    industry: source.industry,
    location: source.locationName ?? joinPlace(source),
    yearsExperience: source.yearsExperience,
    skills: skills.slice(0, SUMMARY_SKILL_LIMIT),
    totalSkills: skills.length,
    qualityScore: source.quality?.score ?? 0,
    repaired: source.quality?.repaired ?? false,
    highlights: normaliseHighlights(options.highlights),
    score: options.score,
  });
}

/** Highlighted sub-fields come back as `skills.text`; the client knows the field by its own name. */
function normaliseHighlights(
  highlight: Record<string, string[]> | undefined,
): Record<string, string[]> | undefined {
  if (!highlight) return undefined;
  const byField: Record<string, string[]> = {};
  for (const [field, fragments] of Object.entries(highlight)) {
    byField[field.replace(/\.text$/, '')] = fragments;
  }
  return Object.keys(byField).length > 0 ? byField : undefined;
}

function joinPlace(source: ProfileSummarySource): string | undefined {
  const parts = [source.locality, source.region, source.country].filter(isFilledString);
  return parts.length > 0 ? parts.join(', ') : undefined;
}
